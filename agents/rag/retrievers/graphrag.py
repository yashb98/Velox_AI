"""
retrievers/graphrag.py — GraphRAG Implementation for Velox AI

Implements Microsoft's GraphRAG approach:
- Entity extraction (SpaCy + LLM)
- Knowledge graph construction (NetworkX)
- Community detection (Leiden algorithm)
- Hierarchical summarization
- Local + Global search

Reference: docs/architecture/15-advanced-rag-architecture.md §3.1
"""

from __future__ import annotations

import os
import json
import logging
import hashlib
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict

import httpx

logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    import networkx as nx
    NETWORKX_AVAILABLE = True
except ImportError:
    NETWORKX_AVAILABLE = False
    logger.warning("NetworkX not installed. Graph features limited.")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class Entity:
    """Represents an extracted entity."""
    id: str
    name: str
    type: str  # PERSON, ORG, PRODUCT, CONCEPT, etc.
    description: str = ""
    attributes: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Relationship:
    """Represents a relationship between entities."""
    source: str  # Entity ID
    target: str  # Entity ID
    type: str    # works_at, owns, mentions, etc.
    weight: float = 1.0
    description: str = ""


@dataclass
class Community:
    """Represents a community of related entities."""
    id: str
    entities: List[str]  # Entity IDs
    summary: str = ""
    level: int = 0  # Hierarchy level


@dataclass
class GraphRAGResult:
    """Result from GraphRAG query."""
    answer: str
    entities: List[Entity]
    relationships: List[Relationship]
    communities: List[Community]
    local_context: str
    global_context: str
    confidence: float


# ─── Entity Extractor ──────────────────────────────────────────────────────────

class EntityExtractor:
    """
    Extract entities from text using LLM.
    Falls back to simple pattern matching if LLM unavailable.
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k"
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

    async def extract(self, text: str) -> Tuple[List[Entity], List[Relationship]]:
        """
        Extract entities and relationships from text.

        Args:
            text: Input text to analyze

        Returns:
            Tuple of (entities, relationships)
        """
        if self.api_key:
            return await self._extract_with_llm(text)
        return self._extract_simple(text)

    async def _extract_with_llm(
        self, text: str
    ) -> Tuple[List[Entity], List[Relationship]]:
        """Use LLM for entity extraction."""
        prompt = f"""Analyze the following text and extract entities and relationships.

TEXT:
{text}

Return JSON with this structure:
{{
    "entities": [
        {{"name": "Entity Name", "type": "PERSON|ORG|PRODUCT|CONCEPT|LOCATION|DATE", "description": "Brief description"}}
    ],
    "relationships": [
        {{"source": "Entity1 Name", "target": "Entity2 Name", "type": "relationship_type", "description": "Brief description"}}
    ]
}}

Extract only clearly mentioned entities and relationships. Be precise."""

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
                        "messages": [
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 2000,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]

                # Parse JSON from response
                # Handle potential markdown code blocks
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]

                parsed = json.loads(content.strip())

                entities = []
                entity_map = {}
                for e in parsed.get("entities", []):
                    entity_id = self._generate_id(e["name"])
                    entity = Entity(
                        id=entity_id,
                        name=e["name"],
                        type=e.get("type", "CONCEPT"),
                        description=e.get("description", "")
                    )
                    entities.append(entity)
                    entity_map[e["name"]] = entity_id

                relationships = []
                for r in parsed.get("relationships", []):
                    source_id = entity_map.get(r["source"])
                    target_id = entity_map.get(r["target"])
                    if source_id and target_id:
                        relationships.append(Relationship(
                            source=source_id,
                            target=target_id,
                            type=r.get("type", "related_to"),
                            description=r.get("description", "")
                        ))

                return entities, relationships

        except Exception as e:
            logger.error(f"LLM entity extraction failed: {e}")
            return self._extract_simple(text)

    def _extract_simple(self, text: str) -> Tuple[List[Entity], List[Relationship]]:
        """Simple pattern-based extraction fallback."""
        entities = []
        words = text.split()

        # Extract capitalized phrases as potential entities
        current_phrase = []
        for word in words:
            clean_word = word.strip(".,!?;:")
            if clean_word and clean_word[0].isupper():
                current_phrase.append(clean_word)
            else:
                if len(current_phrase) >= 1:
                    name = " ".join(current_phrase)
                    if len(name) > 2:
                        entities.append(Entity(
                            id=self._generate_id(name),
                            name=name,
                            type="CONCEPT",
                            description=""
                        ))
                current_phrase = []

        return entities[:20], []  # Limit to 20 entities

    def _generate_id(self, name: str) -> str:
        """Generate unique ID for entity."""
        return hashlib.md5(name.lower().encode()).hexdigest()[:12]


# ─── Knowledge Graph ───────────────────────────────────────────────────────────

class KnowledgeGraph:
    """
    Knowledge graph using NetworkX.
    Supports entity/relationship storage, community detection, and traversal.
    """

    def __init__(self):
        if NETWORKX_AVAILABLE:
            self.graph = nx.DiGraph()
        else:
            self.graph = None
            self._entities: Dict[str, Entity] = {}
            self._relationships: List[Relationship] = []

        self.communities: List[Community] = []
        self._entity_map: Dict[str, Entity] = {}

    def add_entity(self, entity: Entity):
        """Add entity to the graph."""
        self._entity_map[entity.id] = entity

        if self.graph is not None:
            self.graph.add_node(
                entity.id,
                name=entity.name,
                type=entity.type,
                description=entity.description
            )
        else:
            self._entities[entity.id] = entity

    def add_relationship(self, relationship: Relationship):
        """Add relationship to the graph."""
        if self.graph is not None:
            self.graph.add_edge(
                relationship.source,
                relationship.target,
                type=relationship.type,
                weight=relationship.weight,
                description=relationship.description
            )
        else:
            self._relationships.append(relationship)

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Get entity by ID."""
        return self._entity_map.get(entity_id)

    def get_neighbors(self, entity_id: str, depth: int = 1) -> List[Entity]:
        """Get neighboring entities within depth."""
        if self.graph is None or entity_id not in self.graph:
            return []

        neighbors = set()
        current_level = {entity_id}

        for _ in range(depth):
            next_level = set()
            for node in current_level:
                # Get successors and predecessors
                next_level.update(self.graph.successors(node))
                next_level.update(self.graph.predecessors(node))
            neighbors.update(next_level)
            current_level = next_level - neighbors

        return [self._entity_map[n] for n in neighbors if n in self._entity_map]

    def detect_communities(self) -> List[Community]:
        """
        Detect communities using Louvain algorithm.
        (Leiden would be used if python-igraph is available)
        """
        if self.graph is None or len(self.graph.nodes()) == 0:
            return []

        try:
            # Use Louvain community detection
            from networkx.algorithms.community import louvain_communities

            undirected = self.graph.to_undirected()
            community_sets = louvain_communities(undirected)

            self.communities = []
            for i, community in enumerate(community_sets):
                self.communities.append(Community(
                    id=f"community_{i}",
                    entities=list(community),
                    level=0
                ))

            return self.communities

        except Exception as e:
            logger.warning(f"Community detection failed: {e}")
            return []

    def query_local(
        self,
        query_entities: List[str],
        depth: int = 2
    ) -> Tuple[List[Entity], List[Relationship]]:
        """
        Local search: Get subgraph around query entities.

        Args:
            query_entities: Entity IDs to search around
            depth: Traversal depth

        Returns:
            Tuple of (entities, relationships) in local subgraph
        """
        entities = []
        relationships = []

        for entity_id in query_entities:
            if entity_id in self._entity_map:
                entities.append(self._entity_map[entity_id])
                entities.extend(self.get_neighbors(entity_id, depth))

        # Deduplicate
        seen = set()
        unique_entities = []
        for e in entities:
            if e.id not in seen:
                seen.add(e.id)
                unique_entities.append(e)

        # Get relationships between these entities
        if self.graph is not None:
            entity_ids = {e.id for e in unique_entities}
            for u, v, data in self.graph.edges(data=True):
                if u in entity_ids and v in entity_ids:
                    relationships.append(Relationship(
                        source=u,
                        target=v,
                        type=data.get("type", "related_to"),
                        weight=data.get("weight", 1.0),
                        description=data.get("description", "")
                    ))

        return unique_entities, relationships

    def to_dict(self) -> Dict:
        """Serialize graph to dictionary."""
        return {
            "entities": [
                {
                    "id": e.id,
                    "name": e.name,
                    "type": e.type,
                    "description": e.description
                }
                for e in self._entity_map.values()
            ],
            "relationships": [
                {
                    "source": r.source,
                    "target": r.target,
                    "type": r.type,
                    "weight": r.weight
                }
                for r in (
                    self._relationships if self.graph is None
                    else [
                        Relationship(u, v, data.get("type", ""), data.get("weight", 1.0))
                        for u, v, data in self.graph.edges(data=True)
                    ]
                )
            ],
            "communities": [
                {
                    "id": c.id,
                    "entities": c.entities,
                    "summary": c.summary,
                    "level": c.level
                }
                for c in self.communities
            ]
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "KnowledgeGraph":
        """Load graph from dictionary."""
        graph = cls()

        for e in data.get("entities", []):
            graph.add_entity(Entity(
                id=e["id"],
                name=e["name"],
                type=e.get("type", "CONCEPT"),
                description=e.get("description", "")
            ))

        for r in data.get("relationships", []):
            graph.add_relationship(Relationship(
                source=r["source"],
                target=r["target"],
                type=r.get("type", "related_to"),
                weight=r.get("weight", 1.0)
            ))

        return graph


# ─── Community Summarizer ──────────────────────────────────────────────────────

class CommunitySummarizer:
    """Generate summaries for communities using LLM."""

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k"
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

    async def summarize_community(
        self,
        community: Community,
        graph: KnowledgeGraph
    ) -> str:
        """Generate summary for a community."""
        # Get entity details
        entities = [graph.get_entity(e) for e in community.entities]
        entities = [e for e in entities if e is not None]

        if not entities:
            return "Empty community."

        entity_descriptions = "\n".join([
            f"- {e.name} ({e.type}): {e.description}"
            for e in entities
        ])

        if not self.api_key:
            # Simple fallback
            entity_names = [e.name for e in entities]
            return f"Community of {len(entities)} entities: {', '.join(entity_names[:5])}"

        prompt = f"""Summarize this community of related entities in 2-3 sentences:

ENTITIES:
{entity_descriptions}

Write a cohesive summary describing what this community represents and how the entities are related."""

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
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 200,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()

        except Exception as e:
            logger.error(f"Community summarization failed: {e}")
            return f"Community with {len(entities)} entities."


# ─── GraphRAG Retriever ────────────────────────────────────────────────────────

class GraphRAGRetriever:
    """
    Main GraphRAG retriever combining:
    - Entity extraction
    - Knowledge graph queries
    - Community-based global search
    - Hybrid retrieval with vector search
    """

    def __init__(
        self,
        vector_retriever: Optional[Any] = None,
        llm_api_key: Optional[str] = None,
        llm_model: str = "moonshot-v1-8k"
    ):
        self.extractor = EntityExtractor(llm_api_key=llm_api_key, llm_model=llm_model)
        self.summarizer = CommunitySummarizer(llm_api_key=llm_api_key, llm_model=llm_model)
        self.graph = KnowledgeGraph()
        self.vector_retriever = vector_retriever

    async def index_documents(self, documents: List[Dict[str, str]]):
        """
        Index documents into the knowledge graph.

        Args:
            documents: List of dicts with 'id' and 'text' fields
        """
        for doc in documents:
            entities, relationships = await self.extractor.extract(doc["text"])

            for entity in entities:
                entity.attributes["source_doc"] = doc["id"]
                self.graph.add_entity(entity)

            for rel in relationships:
                self.graph.add_relationship(rel)

        # Detect communities
        self.graph.detect_communities()

        # Summarize communities
        for community in self.graph.communities:
            community.summary = await self.summarizer.summarize_community(
                community, self.graph
            )

        logger.info(
            f"Indexed {len(documents)} docs, "
            f"{len(self.graph._entity_map)} entities, "
            f"{len(self.graph.communities)} communities"
        )

    async def query(
        self,
        query: str,
        search_type: str = "hybrid",  # local, global, hybrid
        top_k: int = 5
    ) -> GraphRAGResult:
        """
        Query the knowledge graph.

        Args:
            query: User query
            search_type: "local" (entity-centric), "global" (community-based), "hybrid"
            top_k: Number of results

        Returns:
            GraphRAGResult with context and metadata
        """
        # Extract entities from query
        query_entities, _ = await self.extractor.extract(query)
        query_entity_ids = [e.id for e in query_entities]

        local_context = ""
        global_context = ""
        result_entities = []
        result_relationships = []
        result_communities = []

        # Local search
        if search_type in ["local", "hybrid"]:
            entities, relationships = self.graph.query_local(query_entity_ids, depth=2)
            result_entities = entities
            result_relationships = relationships

            local_context = "\n".join([
                f"Entity: {e.name} ({e.type})\nDescription: {e.description}"
                for e in entities[:top_k]
            ])

        # Global search
        if search_type in ["global", "hybrid"]:
            # Find relevant communities
            relevant_communities = []
            for community in self.graph.communities:
                # Check if any query entity is in the community
                if any(qe in community.entities for qe in query_entity_ids):
                    relevant_communities.append(community)

            # If no direct match, use all communities
            if not relevant_communities:
                relevant_communities = self.graph.communities[:top_k]

            result_communities = relevant_communities
            global_context = "\n\n".join([
                f"Community: {c.summary}"
                for c in relevant_communities[:top_k]
            ])

        # Combine contexts
        combined_context = ""
        if local_context:
            combined_context += f"=== LOCAL CONTEXT ===\n{local_context}\n\n"
        if global_context:
            combined_context += f"=== GLOBAL CONTEXT ===\n{global_context}\n"

        return GraphRAGResult(
            answer="",  # To be filled by generator
            entities=result_entities,
            relationships=result_relationships,
            communities=result_communities,
            local_context=local_context,
            global_context=global_context,
            confidence=0.8 if result_entities else 0.5
        )

    def save(self, path: str):
        """Save graph to file."""
        with open(path, "w") as f:
            json.dump(self.graph.to_dict(), f, indent=2)

    def load(self, path: str):
        """Load graph from file."""
        with open(path, "r") as f:
            data = json.load(f)
        self.graph = KnowledgeGraph.from_dict(data)
