// src/tools/definitions.ts
//
// 4.5 — Added 4 missing FastMCP tools:
//   book_appointment, search_faq, get_customer_profile, trigger_human_handoff

// Using 'any' type to avoid ESM/CommonJS import conflicts.
// The actual tool implementations are in registry.ts.
export const tools: any[] = [
  // ── Existing tools ────────────────────────────────────────────────────────
  {
    name: "check_order_status",
    description: "Look up the current status of a customer's order using their Order ID.",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The order ID (e.g., ORD-12345)",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "check_item_stock",
    description: "Check if an item is available in the warehouse.",
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description: "The name of the product to check availability for",
        },
      },
      required: ["item_name"],
    },
  },

  // ── 4.5 — New tools ───────────────────────────────────────────────────────

  {
    name: "book_appointment",
    description:
      "Book an appointment for a customer at a specified date and time. " +
      "Returns a confirmation number or an error if the slot is unavailable.",
    parameters: {
      type: "object",
      properties: {
        customer_name: {
          type: "string",
          description: "Full name of the customer making the booking",
        },
        date: {
          type: "string",
          description: "Appointment date in YYYY-MM-DD format (e.g., 2026-03-15)",
        },
        time: {
          type: "string",
          description: "Appointment time in HH:MM 24-hour format (e.g., 14:30)",
        },
        service_type: {
          type: "string",
          description:
            "Type of service or appointment (e.g., 'consultation', 'delivery', 'support')",
        },
      },
      required: ["customer_name", "date", "time"],
    },
  },

  {
    name: "search_faq",
    description:
      "Search the company FAQ knowledge base for an answer to a customer's question. " +
      "Returns the most relevant FAQ entry and its answer.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The customer's question to look up in the FAQ",
        },
      },
      required: ["question"],
    },
  },

  {
    name: "get_customer_profile",
    description:
      "Retrieve a customer's profile information including their name, account status, " +
      "membership tier, and contact preferences using their customer ID or phone number.",
    parameters: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "The unique customer ID (e.g., CUST-98765)",
        },
        phone_number: {
          type: "string",
          description:
            "The customer's phone number as an alternative lookup (e.g., +14155552671)",
        },
      },
      // Either customer_id OR phone_number must be supplied
    },
  },

  {
    name: "trigger_human_handoff",
    description:
      "Escalate the current call to a live human agent when the AI cannot resolve the " +
      "customer's issue. Use this when the customer is frustrated, requests a human, or " +
      "when the query is outside the AI's scope. Returns an estimated wait time.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Brief reason for escalation (e.g., 'billing dispute', 'customer request', " +
            "'complex technical issue')",
        },
        priority: {
          type: "string",
          enum: ["normal", "urgent"],
          description:
            "'urgent' for angry/distressed customers or safety issues, 'normal' otherwise",
        },
      },
      required: ["reason"],
    },
  },
];
