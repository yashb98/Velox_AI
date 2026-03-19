# agents/tools.py
"""
Tool definitions for the LangGraph voice agent.

Provides tools that can be called by the agent during conversation:
  - RAG retrieval tools
  - Knowledge base search
  - External API integrations (order, calendar, CRM)

Tools are designed for low-latency voice interactions:
  - Fast tools: <100ms response time
  - Standard tools: <500ms response time
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Optional
from enum import Enum

import httpx

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

# External API endpoints (optional)
ORDER_API_URL = os.getenv("ORDER_API_URL", "")
ORDER_API_KEY = os.getenv("ORDER_API_KEY", "")
INVENTORY_API_URL = os.getenv("INVENTORY_API_URL", "")
CALENDAR_API_URL = os.getenv("CALENDAR_API_URL", "")
CRM_API_URL = os.getenv("CRM_API_URL", "")
HANDOFF_API_URL = os.getenv("HANDOFF_API_URL", "")

# RAG service (internal)
RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8000")


class ToolCategory(Enum):
    """Tool categories for organization."""

    RAG = "rag"
    ORDER = "order"
    CALENDAR = "calendar"
    CRM = "crm"
    UTILITY = "utility"


@dataclass
class ToolDefinition:
    """Definition of a tool available to the agent."""

    name: str
    description: str
    category: ToolCategory
    parameters: dict[str, Any]
    handler: Callable
    timeout_ms: int = 500
    enabled: bool = True


@dataclass
class ToolResult:
    """Result from executing a tool."""

    tool: str
    success: bool
    result: Any
    error: Optional[str] = None
    latency_ms: float = 0.0


# ─── RAG Tools ────────────────────────────────────────────────────────────────


async def search_knowledge_base(
    query: str,
    kb_id: str,
    top_k: int = 5,
) -> ToolResult:
    """
    Search the knowledge base for relevant information.

    Args:
        query: Search query
        kb_id: Knowledge base ID
        top_k: Number of results to return

    Returns:
        ToolResult with search results
    """
    import time

    start = time.perf_counter()

    try:
        # In production, this would call the RAG retriever
        # For now, return empty results
        # from rag.retrievers.hybrid import HybridRetriever
        # retriever = HybridRetriever(kb_id)
        # results = await retriever.search(query, top_k=top_k)

        results = []  # Placeholder

        latency_ms = (time.perf_counter() - start) * 1000

        return ToolResult(
            tool="search_knowledge_base",
            success=True,
            result={
                "documents": results,
                "count": len(results),
            },
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("Knowledge base search failed: %s", e)

        return ToolResult(
            tool="search_knowledge_base",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


# ─── Order Management Tools ───────────────────────────────────────────────────


async def check_order_status(order_id: str) -> ToolResult:
    """
    Check the status of an order.

    Args:
        order_id: Order identifier

    Returns:
        ToolResult with order status
    """
    import time

    start = time.perf_counter()

    if not ORDER_API_URL:
        return ToolResult(
            tool="check_order_status",
            success=False,
            result=None,
            error="Order API not configured",
            latency_ms=0,
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{ORDER_API_URL}/orders/{order_id}",
                headers={"Authorization": f"Bearer {ORDER_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start) * 1000

        return ToolResult(
            tool="check_order_status",
            success=True,
            result=data,
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("Order status check failed: %s", e)

        return ToolResult(
            tool="check_order_status",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


async def list_recent_orders(
    customer_id: str,
    limit: int = 5,
) -> ToolResult:
    """
    List recent orders for a customer.

    Args:
        customer_id: Customer identifier
        limit: Maximum orders to return

    Returns:
        ToolResult with order list
    """
    import time

    start = time.perf_counter()

    if not ORDER_API_URL:
        return ToolResult(
            tool="list_recent_orders",
            success=False,
            result=None,
            error="Order API not configured",
            latency_ms=0,
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{ORDER_API_URL}/customers/{customer_id}/orders",
                params={"limit": limit},
                headers={"Authorization": f"Bearer {ORDER_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start) * 1000

        return ToolResult(
            tool="list_recent_orders",
            success=True,
            result=data,
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("List orders failed: %s", e)

        return ToolResult(
            tool="list_recent_orders",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


# ─── Calendar Tools ───────────────────────────────────────────────────────────


async def check_availability(
    date: str,
    duration_minutes: int = 30,
) -> ToolResult:
    """
    Check calendar availability for a given date.

    Args:
        date: Date to check (YYYY-MM-DD)
        duration_minutes: Duration needed

    Returns:
        ToolResult with available slots
    """
    import time

    start = time.perf_counter()

    if not CALENDAR_API_URL:
        return ToolResult(
            tool="check_availability",
            success=False,
            result=None,
            error="Calendar API not configured",
            latency_ms=0,
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{CALENDAR_API_URL}/availability",
                params={"date": date, "duration": duration_minutes},
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start) * 1000

        return ToolResult(
            tool="check_availability",
            success=True,
            result=data,
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("Availability check failed: %s", e)

        return ToolResult(
            tool="check_availability",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


async def book_appointment(
    date: str,
    time: str,
    duration_minutes: int,
    customer_name: str,
    customer_phone: str,
    notes: str = "",
) -> ToolResult:
    """
    Book an appointment.

    Args:
        date: Appointment date (YYYY-MM-DD)
        time: Appointment time (HH:MM)
        duration_minutes: Duration in minutes
        customer_name: Customer name
        customer_phone: Customer phone
        notes: Optional notes

    Returns:
        ToolResult with booking confirmation
    """
    import time as time_module

    start = time_module.perf_counter()

    if not CALENDAR_API_URL:
        return ToolResult(
            tool="book_appointment",
            success=False,
            result=None,
            error="Calendar API not configured",
            latency_ms=0,
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{CALENDAR_API_URL}/appointments",
                json={
                    "date": date,
                    "time": time,
                    "duration_minutes": duration_minutes,
                    "customer_name": customer_name,
                    "customer_phone": customer_phone,
                    "notes": notes,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time_module.perf_counter() - start) * 1000

        return ToolResult(
            tool="book_appointment",
            success=True,
            result=data,
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time_module.perf_counter() - start) * 1000
        logger.error("Booking failed: %s", e)

        return ToolResult(
            tool="book_appointment",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


# ─── CRM Tools ────────────────────────────────────────────────────────────────


async def get_customer_profile(phone_number: str) -> ToolResult:
    """
    Get customer profile by phone number.

    Args:
        phone_number: Customer phone number

    Returns:
        ToolResult with customer profile
    """
    import time

    start = time.perf_counter()

    if not CRM_API_URL:
        return ToolResult(
            tool="get_customer_profile",
            success=False,
            result=None,
            error="CRM API not configured",
            latency_ms=0,
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{CRM_API_URL}/customers",
                params={"phone": phone_number},
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start) * 1000

        return ToolResult(
            tool="get_customer_profile",
            success=True,
            result=data,
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("Customer lookup failed: %s", e)

        return ToolResult(
            tool="get_customer_profile",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


# ─── Utility Tools ────────────────────────────────────────────────────────────


async def transfer_to_human(
    reason: str,
    summary: str,
    customer_phone: str,
) -> ToolResult:
    """
    Transfer call to human agent.

    Args:
        reason: Reason for transfer
        summary: Conversation summary
        customer_phone: Customer phone number

    Returns:
        ToolResult with transfer status
    """
    import time

    start = time.perf_counter()

    if not HANDOFF_API_URL:
        return ToolResult(
            tool="transfer_to_human",
            success=False,
            result=None,
            error="Handoff API not configured",
            latency_ms=0,
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{HANDOFF_API_URL}/handoff",
                json={
                    "reason": reason,
                    "summary": summary,
                    "customer_phone": customer_phone,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start) * 1000

        return ToolResult(
            tool="transfer_to_human",
            success=True,
            result=data,
            latency_ms=latency_ms,
        )

    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("Transfer failed: %s", e)

        return ToolResult(
            tool="transfer_to_human",
            success=False,
            result=None,
            error=str(e),
            latency_ms=latency_ms,
        )


# ─── Tool Registry ────────────────────────────────────────────────────────────

# All available tools
TOOL_DEFINITIONS: dict[str, ToolDefinition] = {
    "search_knowledge_base": ToolDefinition(
        name="search_knowledge_base",
        description="Search the knowledge base for relevant information",
        category=ToolCategory.RAG,
        parameters={
            "query": {"type": "string", "required": True},
            "kb_id": {"type": "string", "required": True},
            "top_k": {"type": "integer", "default": 5},
        },
        handler=search_knowledge_base,
        timeout_ms=100,
    ),
    "check_order_status": ToolDefinition(
        name="check_order_status",
        description="Check the status of an order by order ID",
        category=ToolCategory.ORDER,
        parameters={
            "order_id": {"type": "string", "required": True},
        },
        handler=check_order_status,
        timeout_ms=500,
        enabled=bool(ORDER_API_URL),
    ),
    "list_recent_orders": ToolDefinition(
        name="list_recent_orders",
        description="List recent orders for a customer",
        category=ToolCategory.ORDER,
        parameters={
            "customer_id": {"type": "string", "required": True},
            "limit": {"type": "integer", "default": 5},
        },
        handler=list_recent_orders,
        timeout_ms=500,
        enabled=bool(ORDER_API_URL),
    ),
    "check_availability": ToolDefinition(
        name="check_availability",
        description="Check calendar availability for scheduling",
        category=ToolCategory.CALENDAR,
        parameters={
            "date": {"type": "string", "required": True},
            "duration_minutes": {"type": "integer", "default": 30},
        },
        handler=check_availability,
        timeout_ms=500,
        enabled=bool(CALENDAR_API_URL),
    ),
    "book_appointment": ToolDefinition(
        name="book_appointment",
        description="Book an appointment",
        category=ToolCategory.CALENDAR,
        parameters={
            "date": {"type": "string", "required": True},
            "time": {"type": "string", "required": True},
            "duration_minutes": {"type": "integer", "required": True},
            "customer_name": {"type": "string", "required": True},
            "customer_phone": {"type": "string", "required": True},
            "notes": {"type": "string", "default": ""},
        },
        handler=book_appointment,
        timeout_ms=500,
        enabled=bool(CALENDAR_API_URL),
    ),
    "get_customer_profile": ToolDefinition(
        name="get_customer_profile",
        description="Get customer profile by phone number",
        category=ToolCategory.CRM,
        parameters={
            "phone_number": {"type": "string", "required": True},
        },
        handler=get_customer_profile,
        timeout_ms=500,
        enabled=bool(CRM_API_URL),
    ),
    "transfer_to_human": ToolDefinition(
        name="transfer_to_human",
        description="Transfer the call to a human agent",
        category=ToolCategory.UTILITY,
        parameters={
            "reason": {"type": "string", "required": True},
            "summary": {"type": "string", "required": True},
            "customer_phone": {"type": "string", "required": True},
        },
        handler=transfer_to_human,
        timeout_ms=500,
        enabled=bool(HANDOFF_API_URL),
    ),
}


def get_available_tools() -> list[ToolDefinition]:
    """Get list of enabled tools."""
    return [tool for tool in TOOL_DEFINITIONS.values() if tool.enabled]


def get_tool_schemas() -> list[dict]:
    """
    Get OpenAI-compatible tool schemas for LLM function calling.

    Returns:
        List of tool schemas in OpenAI format
    """
    schemas = []

    for tool in get_available_tools():
        properties = {}
        required = []

        for param_name, param_def in tool.parameters.items():
            properties[param_name] = {
                "type": param_def["type"],
                "description": f"{param_name} parameter",
            }
            if param_def.get("required", False):
                required.append(param_name)

        schemas.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        })

    return schemas


async def execute_tool(tool_name: str, **kwargs) -> ToolResult:
    """
    Execute a tool by name.

    Args:
        tool_name: Name of the tool to execute
        **kwargs: Tool parameters

    Returns:
        ToolResult with execution result
    """
    tool_def = TOOL_DEFINITIONS.get(tool_name)

    if not tool_def:
        return ToolResult(
            tool=tool_name,
            success=False,
            result=None,
            error=f"Unknown tool: {tool_name}",
        )

    if not tool_def.enabled:
        return ToolResult(
            tool=tool_name,
            success=False,
            result=None,
            error=f"Tool not enabled: {tool_name}",
        )

    return await tool_def.handler(**kwargs)
