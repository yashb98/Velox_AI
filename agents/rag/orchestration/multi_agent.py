"""
orchestration/multi_agent.py — LangGraph Multi-Agent Orchestration

Implements multi-agent RAG pipeline using LangGraph 0.3:
- Supervisor agent for orchestration
- Specialized agents (retriever, analyzer, reasoner, validator)
- Typed state management
- MCP tool integration ready

Reference: docs/architecture/15-advanced-rag-architecture.md §4.3
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Sequence, Literal, Annotated
from enum import Enum
import json

import httpx

logger = logging.getLogger(__name__)

# Try to import LangGraph components
try:
    from langgraph.graph import StateGraph, START, END
    from langgraph.graph.message import add_messages
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    logger.warning("LangGraph not installed. Using simplified orchestration.")

try:
    from pydantic import BaseModel, Field
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False


# ─── Agent Types ───────────────────────────────────────────────────────────────

class AgentRole(Enum):
    """Roles for specialized agents."""
    ORCHESTRATOR = "orchestrator"
    QUERY_PARSER = "query_parser"
    RETRIEVER = "retriever"
    ANALYZER = "analyzer"
    REASONER = "reasoner"
    VALIDATOR = "validator"
    CONFIDENCE_SCORER = "confidence_scorer"


# ─── State Definition ──────────────────────────────────────────────────────────

@dataclass
class Message:
    """Message in the conversation."""
    role: str  # user, assistant, system, agent
    content: str
    agent: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RAGOrchestratorState:
    """
    State for multi-agent RAG pipeline.
    Passed between agents during orchestration.
    """
    # Input
    query: str = ""
    conversation_history: List[Message] = field(default_factory=list)

    # Parsed query
    parsed_query: Dict[str, Any] = field(default_factory=dict)
    query_intent: str = ""
    sub_queries: List[str] = field(default_factory=list)

    # Retrieved documents
    retrieved_docs: List[Dict[str, Any]] = field(default_factory=list)
    retrieval_sources: List[str] = field(default_factory=list)

    # Analysis
    extracted_facts: List[str] = field(default_factory=list)
    entity_mentions: List[Dict[str, str]] = field(default_factory=list)

    # Reasoning
    reasoning_chain: str = ""
    intermediate_answers: List[str] = field(default_factory=list)

    # Validation
    validation_results: List[Dict[str, Any]] = field(default_factory=list)
    verified_claims: List[str] = field(default_factory=list)
    unverified_claims: List[str] = field(default_factory=list)

    # Final output
    final_response: str = ""
    citations: List[str] = field(default_factory=list)
    confidence_score: float = 0.0
    should_abstain: bool = False
    abstention_reason: str = ""

    # Execution metadata
    current_agent: str = ""
    agent_outputs: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


# ─── Base Agent Class ──────────────────────────────────────────────────────────

class BaseAgent:
    """Base class for specialized agents."""

    def __init__(
        self,
        role: AgentRole,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k"
    ):
        self.role = role
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

    async def _call_llm(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 500
    ) -> str:
        """Call LLM API."""
        if not self.api_key:
            return f"[Mock {self.role.value} response]"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"LLM call failed for {self.role.value}: {e}")
            return ""

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Process state. Override in subclasses."""
        raise NotImplementedError


# ─── Query Parser Agent ────────────────────────────────────────────────────────

class QueryParserAgent(BaseAgent):
    """
    Parses and structures the user query.
    Extracts intent, entities, and sub-queries.
    """

    def __init__(self, **kwargs):
        super().__init__(AgentRole.QUERY_PARSER, **kwargs)

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Parse the query."""
        system_prompt = """You are a query parser. Analyze the user's query and extract:
1. Intent (what the user wants to know)
2. Key entities mentioned
3. If complex, break into sub-questions

Return JSON format:
{
    "intent": "...",
    "entities": ["entity1", "entity2"],
    "sub_queries": ["sub-question 1", "sub-question 2"],
    "complexity": "simple|medium|complex"
}"""

        prompt = f"Parse this query:\n\n{state.query}"

        result = await self._call_llm(prompt, system_prompt, temperature=0.1)

        try:
            # Parse JSON response
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]

            parsed = json.loads(result.strip())

            state.query_intent = parsed.get("intent", state.query)
            state.sub_queries = parsed.get("sub_queries", [state.query])
            state.parsed_query = parsed

            entities = parsed.get("entities", [])
            state.entity_mentions = [{"name": e, "type": "unknown"} for e in entities]

        except json.JSONDecodeError:
            # Fallback: use original query
            state.query_intent = state.query
            state.sub_queries = [state.query]

        state.current_agent = self.role.value
        state.agent_outputs[self.role.value] = {
            "intent": state.query_intent,
            "sub_queries": state.sub_queries
        }

        return state


# ─── Retriever Agent ───────────────────────────────────────────────────────────

class RetrieverAgent(BaseAgent):
    """
    Retrieves relevant documents from multiple sources.
    Uses hybrid retrieval (dense + sparse + graph).
    """

    def __init__(self, retriever: Optional[Any] = None, **kwargs):
        super().__init__(AgentRole.RETRIEVER, **kwargs)
        self.retriever = retriever

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Retrieve documents for each sub-query."""
        all_docs = []
        sources = set()

        for sub_query in state.sub_queries:
            if self.retriever:
                # Use provided retriever
                if hasattr(self.retriever, 'retrieve'):
                    docs = await self.retriever.retrieve(sub_query, top_k=5)
                elif callable(self.retriever):
                    docs = self.retriever(sub_query)
                else:
                    docs = []

                for doc in docs:
                    doc_dict = {
                        "id": getattr(doc, "id", str(hash(str(doc)))[:8]),
                        "text": getattr(doc, "text", str(doc)),
                        "source": getattr(doc, "source", "unknown"),
                        "score": getattr(doc, "score", 0.5),
                        "query": sub_query
                    }
                    all_docs.append(doc_dict)
                    sources.add(doc_dict["source"])
            else:
                # Mock retrieval
                all_docs.append({
                    "id": f"mock_{len(all_docs)}",
                    "text": f"Mock document for: {sub_query}",
                    "source": "mock",
                    "score": 0.5,
                    "query": sub_query
                })
                sources.add("mock")

        state.retrieved_docs = all_docs
        state.retrieval_sources = list(sources)
        state.current_agent = self.role.value
        state.agent_outputs[self.role.value] = {
            "doc_count": len(all_docs),
            "sources": list(sources)
        }

        return state


# ─── Analyzer Agent ────────────────────────────────────────────────────────────

class AnalyzerAgent(BaseAgent):
    """
    Analyzes retrieved documents.
    Extracts key facts and identifies relevant information.
    """

    def __init__(self, **kwargs):
        super().__init__(AgentRole.ANALYZER, **kwargs)

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Analyze documents and extract facts."""
        if not state.retrieved_docs:
            return state

        # Concatenate document texts
        doc_texts = "\n\n---\n\n".join([
            f"[Doc {i+1}]: {doc['text'][:500]}"
            for i, doc in enumerate(state.retrieved_docs[:10])
        ])

        system_prompt = """You are a document analyzer. Extract key facts and information
that are relevant to answering the query. Be precise and factual.

Return a JSON list of facts:
["fact 1", "fact 2", "fact 3"]"""

        prompt = f"""Query: {state.query}

Documents:
{doc_texts}

Extract relevant facts:"""

        result = await self._call_llm(prompt, system_prompt, temperature=0.1)

        try:
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]

            facts = json.loads(result.strip())
            if isinstance(facts, list):
                state.extracted_facts = [str(f) for f in facts]
        except json.JSONDecodeError:
            # Extract facts from text
            state.extracted_facts = [
                line.strip().lstrip("-•*1234567890. ")
                for line in result.split("\n")
                if line.strip() and len(line.strip()) > 10
            ]

        state.current_agent = self.role.value
        state.agent_outputs[self.role.value] = {
            "fact_count": len(state.extracted_facts)
        }

        return state


# ─── Reasoner Agent ────────────────────────────────────────────────────────────

class ReasonerAgent(BaseAgent):
    """
    Applies reasoning to synthesize an answer.
    Uses Chain-of-Thought and ReAct patterns.
    """

    def __init__(self, **kwargs):
        super().__init__(AgentRole.REASONER, llm_model="moonshot-v1-32k", **kwargs)

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Reason about facts to generate answer."""
        system_prompt = """You are a reasoning agent. Use step-by-step reasoning (Chain-of-Thought)
to synthesize an answer from the provided facts.

Structure your response:
1. THINK: Your reasoning process
2. ANSWER: The final answer

Be accurate and cite facts when possible."""

        facts_text = "\n".join([f"- {fact}" for fact in state.extracted_facts])

        prompt = f"""Query: {state.query}

Intent: {state.query_intent}

Extracted Facts:
{facts_text if facts_text else "No specific facts extracted."}

Think step by step and provide your answer:"""

        result = await self._call_llm(prompt, system_prompt, temperature=0.5, max_tokens=800)

        # Parse reasoning and answer
        if "ANSWER:" in result:
            parts = result.split("ANSWER:", 1)
            state.reasoning_chain = parts[0].replace("THINK:", "").strip()
            state.intermediate_answers = [parts[1].strip()]
        else:
            state.reasoning_chain = result
            state.intermediate_answers = [result]

        state.current_agent = self.role.value
        state.agent_outputs[self.role.value] = {
            "has_reasoning": bool(state.reasoning_chain)
        }

        return state


# ─── Validator Agent ───────────────────────────────────────────────────────────

class ValidatorAgent(BaseAgent):
    """
    Validates claims against retrieved evidence.
    Performs fact-checking and citation verification.
    """

    def __init__(self, **kwargs):
        super().__init__(AgentRole.VALIDATOR, **kwargs)

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Validate claims in the answer."""
        if not state.intermediate_answers:
            return state

        answer = state.intermediate_answers[-1]
        doc_texts = "\n".join([
            f"[{doc['id']}]: {doc['text'][:300]}"
            for doc in state.retrieved_docs[:5]
        ])

        system_prompt = """You are a fact validator. Check each claim in the answer against
the provided evidence.

Return JSON:
{
    "verified_claims": ["claim 1", "claim 2"],
    "unverified_claims": ["claim 3"],
    "validation_notes": "..."
}"""

        prompt = f"""Answer to validate:
{answer}

Evidence:
{doc_texts if doc_texts else "No evidence available."}

Validate the claims:"""

        result = await self._call_llm(prompt, system_prompt, temperature=0.1)

        try:
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]

            validation = json.loads(result.strip())

            state.verified_claims = validation.get("verified_claims", [])
            state.unverified_claims = validation.get("unverified_claims", [])
            state.validation_results.append(validation)

        except json.JSONDecodeError:
            # Fallback: assume all claims are verified if we have evidence
            state.verified_claims = []
            state.unverified_claims = []

        state.current_agent = self.role.value
        state.agent_outputs[self.role.value] = {
            "verified": len(state.verified_claims),
            "unverified": len(state.unverified_claims)
        }

        return state


# ─── Confidence Scorer Agent ───────────────────────────────────────────────────

class ConfidenceScorerAgent(BaseAgent):
    """
    Computes overall confidence score.
    Decides whether to abstain from answering.
    """

    def __init__(self, abstention_threshold: float = 0.4, **kwargs):
        super().__init__(AgentRole.CONFIDENCE_SCORER, **kwargs)
        self.abstention_threshold = abstention_threshold

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Calculate confidence and decide abstention."""
        # Multi-factor confidence calculation
        factors = {}

        # 1. Document coverage (0-1)
        doc_count = len(state.retrieved_docs)
        factors["doc_coverage"] = min(1.0, doc_count / 5)

        # 2. Fact extraction (0-1)
        fact_count = len(state.extracted_facts)
        factors["fact_extraction"] = min(1.0, fact_count / 5)

        # 3. Verification ratio (0-1)
        total_claims = len(state.verified_claims) + len(state.unverified_claims)
        if total_claims > 0:
            factors["verification_ratio"] = len(state.verified_claims) / total_claims
        else:
            factors["verification_ratio"] = 0.5

        # 4. Reasoning quality (0-1)
        has_reasoning = len(state.reasoning_chain) > 50
        factors["reasoning_quality"] = 0.8 if has_reasoning else 0.4

        # Weighted average
        weights = {
            "doc_coverage": 0.2,
            "fact_extraction": 0.2,
            "verification_ratio": 0.4,
            "reasoning_quality": 0.2
        }

        confidence = sum(
            factors[k] * weights[k]
            for k in factors
        )

        state.confidence_score = min(1.0, max(0.0, confidence))

        # Abstention decision
        if state.confidence_score < self.abstention_threshold:
            state.should_abstain = True
            state.abstention_reason = self._get_abstention_reason(factors)
        else:
            state.should_abstain = False

        state.current_agent = self.role.value
        state.agent_outputs[self.role.value] = {
            "confidence": state.confidence_score,
            "factors": factors,
            "should_abstain": state.should_abstain
        }

        return state

    def _get_abstention_reason(self, factors: Dict[str, float]) -> str:
        """Generate abstention reason based on low factors."""
        reasons = []

        if factors.get("doc_coverage", 0) < 0.3:
            reasons.append("insufficient relevant documents found")
        if factors.get("verification_ratio", 0) < 0.3:
            reasons.append("claims could not be verified against evidence")
        if factors.get("fact_extraction", 0) < 0.2:
            reasons.append("limited factual information available")

        if reasons:
            return f"Low confidence due to: {', '.join(reasons)}"
        return "Overall confidence below threshold"


# ─── Response Generator ────────────────────────────────────────────────────────

class ResponseGeneratorAgent(BaseAgent):
    """
    Generates the final response with citations.
    """

    def __init__(self, **kwargs):
        super().__init__(AgentRole.ORCHESTRATOR, **kwargs)

    async def process(self, state: RAGOrchestratorState) -> RAGOrchestratorState:
        """Generate final response."""
        if state.should_abstain:
            state.final_response = (
                f"I don't have enough confidence to provide an accurate answer. "
                f"{state.abstention_reason}. "
                f"Please provide more context or rephrase your question."
            )
            return state

        # Use reasoner's answer as base
        if state.intermediate_answers:
            base_answer = state.intermediate_answers[-1]
        else:
            base_answer = ""

        # Add citations
        citations = []
        for i, doc in enumerate(state.retrieved_docs[:5]):
            if doc.get("source") != "mock":
                citations.append(f"[{i+1}] {doc.get('source', 'Document')}")

        state.citations = citations

        # Format final response
        if citations:
            state.final_response = f"{base_answer}\n\nSources: {', '.join(citations)}"
        else:
            state.final_response = base_answer

        return state


# ─── Multi-Agent Orchestrator ──────────────────────────────────────────────────

class MultiAgentOrchestrator:
    """
    Orchestrates the multi-agent RAG pipeline.

    Pipeline:
    1. Query Parser → Parse and structure query
    2. Retriever → Fetch relevant documents
    3. Analyzer → Extract key facts
    4. Reasoner → Apply reasoning
    5. Validator → Verify claims
    6. Confidence Scorer → Calculate confidence
    7. Response Generator → Format final response
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        abstention_threshold: float = 0.4
    ):
        self.llm_kwargs = {
            "llm_api_key": llm_api_key,
            "llm_base_url": llm_base_url
        }

        # Initialize agents
        self.agents = {
            "query_parser": QueryParserAgent(**self.llm_kwargs),
            "retriever": RetrieverAgent(retriever=retriever, **self.llm_kwargs),
            "analyzer": AnalyzerAgent(**self.llm_kwargs),
            "reasoner": ReasonerAgent(**self.llm_kwargs),
            "validator": ValidatorAgent(**self.llm_kwargs),
            "confidence_scorer": ConfidenceScorerAgent(
                abstention_threshold=abstention_threshold,
                **self.llm_kwargs
            ),
            "response_generator": ResponseGeneratorAgent(**self.llm_kwargs),
        }

        # Pipeline order
        self.pipeline = [
            "query_parser",
            "retriever",
            "analyzer",
            "reasoner",
            "validator",
            "confidence_scorer",
            "response_generator",
        ]

    async def run(self, query: str) -> RAGOrchestratorState:
        """
        Run the multi-agent pipeline.

        Args:
            query: User query

        Returns:
            Final state with response
        """
        # Initialize state
        state = RAGOrchestratorState(query=query)

        # Run pipeline
        for agent_name in self.pipeline:
            agent = self.agents[agent_name]
            try:
                logger.info(f"Running agent: {agent_name}")
                state = await agent.process(state)
            except Exception as e:
                logger.error(f"Agent {agent_name} failed: {e}")
                state.error = f"Pipeline error at {agent_name}: {str(e)}"
                break

        return state

    def get_pipeline_summary(self, state: RAGOrchestratorState) -> Dict[str, Any]:
        """Get summary of pipeline execution."""
        return {
            "query": state.query,
            "response": state.final_response,
            "confidence": state.confidence_score,
            "should_abstain": state.should_abstain,
            "agents_run": list(state.agent_outputs.keys()),
            "doc_count": len(state.retrieved_docs),
            "fact_count": len(state.extracted_facts),
            "citations": state.citations,
            "error": state.error,
        }


# ─── LangGraph Integration (Optional) ──────────────────────────────────────────

if LANGGRAPH_AVAILABLE:
    def build_langgraph_pipeline(orchestrator: MultiAgentOrchestrator) -> Any:
        """
        Build LangGraph StateGraph from orchestrator.

        This creates a proper LangGraph graph for more advanced
        features like human-in-the-loop, streaming, etc.
        """
        # Define state as Pydantic model if available
        if PYDANTIC_AVAILABLE:
            class LangGraphState(BaseModel):
                query: str = ""
                final_response: str = ""
                confidence_score: float = 0.0
                # ... add other fields

        # Build graph
        graph = StateGraph(dict)

        # Add nodes
        for agent_name, agent in orchestrator.agents.items():
            async def make_node(state: dict, a=agent) -> dict:
                rag_state = RAGOrchestratorState(**state)
                rag_state = await a.process(rag_state)
                return vars(rag_state)
            graph.add_node(agent_name, make_node)

        # Add edges
        graph.add_edge(START, "query_parser")
        graph.add_edge("query_parser", "retriever")
        graph.add_edge("retriever", "analyzer")
        graph.add_edge("analyzer", "reasoner")
        graph.add_edge("reasoner", "validator")
        graph.add_edge("validator", "confidence_scorer")
        graph.add_edge("confidence_scorer", "response_generator")
        graph.add_edge("response_generator", END)

        return graph.compile()
