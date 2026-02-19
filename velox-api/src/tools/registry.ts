// src/tools/registry.ts
//
// 4.5 — Added 4 missing FastMCP tool implementations:
//   book_appointment, search_faq, get_customer_profile, trigger_human_handoff

import { logger } from "../utils/logger";

// ─── Mock data stores ────────────────────────────────────────────────────────
// These are in-memory stubs for development / demo. In production each tool
// would call the real downstream API / database.

const MOCK_ORDERS: Record<string, string> = {
  "123": "Shipped - Arriving Tuesday",
  "456": "Processing",
  "999": "Cancelled",
};

const MOCK_STOCK: Record<string, number> = {
  laptop: 5,
  mouse: 0,
  keyboard: 12,
  headset: 3,
  monitor: 8,
};

// Simple appointment slot store — slot key is "YYYY-MM-DD HH:MM"
const BOOKED_SLOTS = new Set<string>();

const MOCK_FAQ: Array<{ keywords: string[]; answer: string }> = [
  {
    keywords: ["return", "refund", "money back"],
    answer:
      "You can return any item within 30 days of purchase. Visit our website or call us to initiate a return. Refunds are processed within 5–7 business days.",
  },
  {
    keywords: ["shipping", "delivery", "how long"],
    answer:
      "Standard shipping takes 3–5 business days. Express shipping (1–2 days) is available at checkout for an additional fee.",
  },
  {
    keywords: ["warranty", "guarantee", "broken"],
    answer:
      "All products come with a 1-year manufacturer warranty. For defects, please contact support with your order number and a description of the issue.",
  },
  {
    keywords: ["password", "login", "account", "access"],
    answer:
      "To reset your password, click 'Forgot Password' on the login page. You will receive an email with reset instructions within a few minutes.",
  },
  {
    keywords: ["cancel", "cancellation", "stop subscription"],
    answer:
      "You can cancel your subscription at any time from the Account Settings page. Your access continues until the end of the current billing cycle.",
  },
];

const MOCK_CUSTOMERS: Record<
  string,
  { name: string; tier: string; status: string; email: string }
> = {
  "CUST-98765": {
    name: "Alice Johnson",
    tier: "Gold",
    status: "Active",
    email: "alice@example.com",
  },
  "CUST-11111": {
    name: "Bob Smith",
    tier: "Silver",
    status: "Active",
    email: "bob@example.com",
  },
  "CUST-22222": {
    name: "Carol White",
    tier: "Bronze",
    status: "Suspended",
    email: "carol@example.com",
  },
};

// Maps phone numbers → customer IDs for phone-based lookup
const PHONE_TO_CUSTOMER: Record<string, string> = {
  "+14155552671": "CUST-98765",
  "+14155559999": "CUST-11111",
};

// ─── Tool registry ────────────────────────────────────────────────────────────

export const toolRegistry = {
  // ── Existing tools ─────────────────────────────────────────────────────────

  check_order_status: async (args: { order_id: string }) => {
    logger.info(`Tool: check_order_status(${args.order_id})`);
    const status = MOCK_ORDERS[args.order_id] ?? "Order not found";
    return { status };
  },

  check_item_stock: async (args: { item_name: string }) => {
    logger.info(`Tool: check_item_stock(${args.item_name})`);
    const qty = MOCK_STOCK[args.item_name.toLowerCase()];
    if (qty === undefined) return { available: false, quantity: 0, message: "Unknown item" };
    return {
      available: qty > 0,
      quantity: qty,
      message: qty > 0 ? `${qty} units in stock` : "Out of stock",
    };
  },

  // ── 4.5 — New tool implementations ─────────────────────────────────────────

  /**
   * book_appointment — reserves a slot and returns a confirmation number.
   * In production this would POST to a calendar / scheduling API.
   */
  book_appointment: async (args: {
    customer_name: string;
    date: string;
    time: string;
    service_type?: string;
  }) => {
    logger.info(
      `Tool: book_appointment(${args.customer_name}, ${args.date} ${args.time})`
    );

    const slotKey = `${args.date} ${args.time}`;
    if (BOOKED_SLOTS.has(slotKey)) {
      return {
        success: false,
        message: `The slot on ${args.date} at ${args.time} is already booked. Please choose a different time.`,
      };
    }

    BOOKED_SLOTS.add(slotKey);
    const confirmationNumber = `APT-${Date.now().toString(36).toUpperCase()}`;

    return {
      success: true,
      confirmation_number: confirmationNumber,
      message: `Appointment confirmed for ${args.customer_name} on ${args.date} at ${args.time}${args.service_type ? ` (${args.service_type})` : ""}. Reference: ${confirmationNumber}.`,
    };
  },

  /**
   * search_faq — simple keyword-match FAQ lookup.
   * In production this would call the RAGService with the FAQ knowledge base.
   */
  search_faq: async (args: { question: string }) => {
    logger.info(`Tool: search_faq("${args.question.substring(0, 60)}")`);

    const queryLower = args.question.toLowerCase();
    const match = MOCK_FAQ.find((entry) =>
      entry.keywords.some((kw) => queryLower.includes(kw))
    );

    if (match) {
      return { found: true, answer: match.answer };
    }

    return {
      found: false,
      answer:
        "I couldn't find a specific FAQ answer for that question. " +
        "Would you like me to connect you with a human agent who can help?",
    };
  },

  /**
   * get_customer_profile — looks up by customer_id or phone_number.
   * In production this would query the CRM / user database.
   */
  get_customer_profile: async (args: {
    customer_id?: string;
    phone_number?: string;
  }) => {
    logger.info(
      `Tool: get_customer_profile(id=${args.customer_id}, phone=${args.phone_number})`
    );

    let customerId = args.customer_id;

    // Fall back to phone-number lookup if no direct ID given
    if (!customerId && args.phone_number) {
      customerId = PHONE_TO_CUSTOMER[args.phone_number];
    }

    if (!customerId) {
      return { found: false, message: "No customer ID or phone number provided." };
    }

    const profile = MOCK_CUSTOMERS[customerId];
    if (!profile) {
      return { found: false, message: `No customer found for ID: ${customerId}` };
    }

    return {
      found: true,
      customer_id: customerId,
      name: profile.name,
      membership_tier: profile.tier,
      account_status: profile.status,
      email: profile.email,
    };
  },

  /**
   * trigger_human_handoff — signals the call should be transferred.
   * In production this would POST to the Twilio Conference / Transfer API.
   */
  trigger_human_handoff: async (args: { reason: string; priority?: string }) => {
    logger.info(
      `Tool: trigger_human_handoff(reason="${args.reason}", priority=${args.priority ?? "normal"})`
    );

    const isUrgent = args.priority === "urgent";
    const estimatedWait = isUrgent ? "under 2 minutes" : "3–5 minutes";

    return {
      success: true,
      handoff_initiated: true,
      priority: args.priority ?? "normal",
      estimated_wait: estimatedWait,
      message:
        `I'm connecting you to a live agent now. Estimated wait time is ${estimatedWait}. ` +
        `Reason for transfer: ${args.reason}. Please hold.`,
    };
  },
};
