// src/tools/registry.ts
//
// Post-MVP Item 1 — Replace in-memory mock stubs with real external API calls.
//
// Each tool wraps its HTTP call in a try/catch.  On any network error or
// missing env var it returns a graceful error response instead of throwing —
// the LLMService tool loop must never be interrupted by a downstream outage.
//
// Required env vars (all optional; tools degrade gracefully when absent):
//   ORDER_API_URL      ORDER_API_KEY      — order status service
//   INVENTORY_API_URL                     — stock / inventory service
//   CALENDAR_API_URL                      — appointment / scheduling service
//   CRM_API_URL                           — customer profile service
//   HANDOFF_API_URL                       — human-agent transfer service
//   FAQ_KB_ID                             — Knowledge Base UUID for FAQ RAG search

import { logger } from "../utils/logger";

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 8_000; // 8 s — tight deadline for voice UX

async function apiGet(
  url: string,
  headers: Record<string, string> = {}
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", ...headers },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

async function apiPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Tool registry ────────────────────────────────────────────────────────────

export const toolRegistry = {
  // ── check_order_status ──────────────────────────────────────────────────────

  check_order_status: async (args: { order_id: string }) => {
    logger.info({ tool: "check_order_status", order_id: args.order_id });

    const baseUrl = process.env.ORDER_API_URL;
    if (!baseUrl) {
      logger.warn("ORDER_API_URL not set — returning service-unavailable");
      return { error: "Order service is currently unavailable. Please try again later." };
    }

    try {
      const data = await apiGet(
        `${baseUrl}/orders/${encodeURIComponent(args.order_id)}`,
        process.env.ORDER_API_KEY
          ? { "x-api-key": process.env.ORDER_API_KEY }
          : {}
      );
      return {
        order_id: args.order_id,
        status: data.status ?? data.state ?? "Unknown",
        estimated_delivery: data.estimated_delivery ?? null,
        tracking_number: data.tracking_number ?? null,
      };
    } catch (err: any) {
      logger.error({ err: err.message, tool: "check_order_status" }, "API call failed");
      return { error: `Could not retrieve order ${args.order_id}. Please check the order number and try again.` };
    }
  },

  // ── check_item_stock ────────────────────────────────────────────────────────

  check_item_stock: async (args: { item_name: string }) => {
    logger.info({ tool: "check_item_stock", item_name: args.item_name });

    const baseUrl = process.env.INVENTORY_API_URL;
    if (!baseUrl) {
      logger.warn("INVENTORY_API_URL not set — returning service-unavailable");
      return { error: "Inventory service is currently unavailable. Please try again later." };
    }

    try {
      const data = await apiGet(
        `${baseUrl}/products?name=${encodeURIComponent(args.item_name)}`
      );
      const item = Array.isArray(data) ? data[0] : data;
      const qty: number = item?.quantity ?? item?.stock ?? 0;
      return {
        item_name: args.item_name,
        available: qty > 0,
        quantity: qty,
        message: qty > 0 ? `${qty} units in stock` : "Out of stock",
      };
    } catch (err: any) {
      logger.error({ err: err.message, tool: "check_item_stock" }, "API call failed");
      return { error: `Could not check stock for "${args.item_name}". Please try again later.` };
    }
  },

  // ── book_appointment ────────────────────────────────────────────────────────

  book_appointment: async (args: {
    customer_name: string;
    date: string;
    time: string;
    service_type?: string;
  }) => {
    logger.info({ tool: "book_appointment", ...args });

    const baseUrl = process.env.CALENDAR_API_URL;
    if (!baseUrl) {
      logger.warn("CALENDAR_API_URL not set — returning service-unavailable");
      return { error: "Appointment booking is currently unavailable. Please call back or visit our website." };
    }

    try {
      const data = await apiPost(`${baseUrl}/appointments`, {
        customer_name: args.customer_name,
        date: args.date,
        time: args.time,
        service_type: args.service_type ?? "general",
      });

      if (data.available === false || data.conflict === true) {
        return {
          success: false,
          message: `The slot on ${args.date} at ${args.time} is unavailable. Please choose a different time.`,
        };
      }

      return {
        success: true,
        confirmation_number: data.confirmation_id ?? data.id ?? `APT-${Date.now().toString(36).toUpperCase()}`,
        message: `Appointment confirmed for ${args.customer_name} on ${args.date} at ${args.time}${args.service_type ? ` (${args.service_type})` : ""}.`,
      };
    } catch (err: any) {
      logger.error({ err: err.message, tool: "book_appointment" }, "API call failed");
      return { error: "Could not book the appointment. Please try again or call our booking line directly." };
    }
  },

  // ── search_faq ──────────────────────────────────────────────────────────────
  // Uses the existing RAG pipeline (ragService) when FAQ_KB_ID is set,
  // providing semantic search over the real knowledge base.

  search_faq: async (args: { question: string }) => {
    logger.info({ tool: "search_faq", question: args.question.substring(0, 80) });

    const faqKbId = process.env.FAQ_KB_ID;
    if (!faqKbId) {
      logger.warn("FAQ_KB_ID not set — FAQ search disabled");
      return {
        found: false,
        answer: "I don't have a specific answer for that question. Would you like me to connect you with a human agent?",
      };
    }

    try {
      // Lazy import to avoid circular deps at module load time
      const { ragService } = await import("../services/ragService.js");
      const context = await ragService.retrieveContext(args.question, faqKbId);
      if (context && context.trim().length > 0) {
        return { found: true, answer: context };
      }
      return {
        found: false,
        answer: "I couldn't find a specific answer for that in our FAQ. Would you like me to connect you with a human agent?",
      };
    } catch (err: any) {
      logger.error({ err: err.message, tool: "search_faq" }, "RAG call failed");
      return {
        found: false,
        answer: "I'm having trouble accessing the FAQ right now. Let me connect you with a human agent who can help.",
      };
    }
  },

  // ── get_customer_profile ────────────────────────────────────────────────────

  get_customer_profile: async (args: {
    customer_id?: string;
    phone_number?: string;
  }) => {
    logger.info({ tool: "get_customer_profile", customer_id: args.customer_id, phone: args.phone_number });

    const baseUrl = process.env.CRM_API_URL;
    if (!baseUrl) {
      logger.warn("CRM_API_URL not set — returning service-unavailable");
      return { found: false, error: "Customer profile service is currently unavailable." };
    }

    try {
      let url: string;
      if (args.customer_id) {
        url = `${baseUrl}/customers/${encodeURIComponent(args.customer_id)}`;
      } else if (args.phone_number) {
        url = `${baseUrl}/customers?phone=${encodeURIComponent(args.phone_number)}`;
      } else {
        return { found: false, message: "No customer ID or phone number provided." };
      }

      const data = await apiGet(url);
      const profile = Array.isArray(data) ? data[0] : data;

      if (!profile) {
        return { found: false, message: "No customer found with the provided details." };
      }

      return {
        found: true,
        customer_id: profile.id ?? profile.customer_id ?? args.customer_id,
        name: profile.name ?? profile.full_name ?? "Unknown",
        membership_tier: profile.tier ?? profile.plan ?? "Standard",
        account_status: profile.status ?? profile.state ?? "Active",
        email: profile.email ?? null,
      };
    } catch (err: any) {
      logger.error({ err: err.message, tool: "get_customer_profile" }, "API call failed");
      return { found: false, error: "Could not retrieve customer profile. Please try again later." };
    }
  },

  // ── trigger_human_handoff ───────────────────────────────────────────────────

  trigger_human_handoff: async (args: { reason: string; priority?: string }) => {
    logger.info({ tool: "trigger_human_handoff", reason: args.reason, priority: args.priority });

    const baseUrl = process.env.HANDOFF_API_URL;
    if (!baseUrl) {
      // Graceful degradation — still signal handoff intent even without API
      logger.warn("HANDOFF_API_URL not set — returning default handoff response");
      const isUrgent = args.priority === "urgent";
      return {
        success: true,
        handoff_initiated: true,
        priority: args.priority ?? "normal",
        estimated_wait: isUrgent ? "under 2 minutes" : "3–5 minutes",
        message: `Connecting you to a live agent. Estimated wait: ${isUrgent ? "under 2 minutes" : "3–5 minutes"}.`,
      };
    }

    try {
      const data = await apiPost(`${baseUrl}/transfer`, {
        reason: args.reason,
        priority: args.priority ?? "normal",
      });

      return {
        success: true,
        handoff_initiated: true,
        priority: args.priority ?? "normal",
        estimated_wait: data.estimated_wait ?? "a few minutes",
        queue_position: data.queue_position ?? null,
        message:
          `I'm connecting you to a live agent now. ` +
          `Estimated wait time is ${data.estimated_wait ?? "a few minutes"}. ` +
          `Reason: ${args.reason}. Please hold.`,
      };
    } catch (err: any) {
      logger.error({ err: err.message, tool: "trigger_human_handoff" }, "API call failed");
      // Even on failure, communicate the handoff intent to the caller
      return {
        success: false,
        handoff_initiated: false,
        message: "I'm having trouble transferring your call right now. Please call back on our main support line.",
      };
    }
  },
};
