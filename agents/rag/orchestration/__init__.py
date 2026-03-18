"""
Multi-Agent Orchestration for Velox AI RAG.

Implements LangGraph-based multi-agent pipeline:
- Supervisor orchestration
- Specialized agents (parser, retriever, analyzer, reasoner, validator)
- Typed state management
- Confidence scoring and calibrated abstention
"""

from .multi_agent import (
    MultiAgentOrchestrator,
    RAGOrchestratorState,
    AgentRole,
    Message,
    # Agents
    BaseAgent,
    QueryParserAgent,
    RetrieverAgent,
    AnalyzerAgent,
    ReasonerAgent,
    ValidatorAgent,
    ConfidenceScorerAgent,
    ResponseGeneratorAgent,
)

__all__ = [
    "MultiAgentOrchestrator",
    "RAGOrchestratorState",
    "AgentRole",
    "Message",
    "BaseAgent",
    "QueryParserAgent",
    "RetrieverAgent",
    "AnalyzerAgent",
    "ReasonerAgent",
    "ValidatorAgent",
    "ConfidenceScorerAgent",
    "ResponseGeneratorAgent",
]
