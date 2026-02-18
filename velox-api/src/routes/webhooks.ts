// velox-api/src/routes/webhooks.ts
//
// Stripe webhook receiver.
// IMPORTANT: This router uses express.raw() (NOT express.json()) so that Stripe
// can verify the HMAC signature on the raw request body. It must be registered
// in app.ts BEFORE the global express.json() middleware is applied.

import express, { Router } from "express";
import Stripe from "stripe";
import { stripe } from "../config/stripe";
import { billingService } from "../services/billingService";
import { logger } from "../utils/logger";

const router = Router();

router.post(
  "/",
  // Raw body is required for Stripe webhook signature verification
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
      logger.warn("Stripe webhook received without signature header");
      return res.status(400).send("Missing stripe-signature header");
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      logger.error("STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook");
      return res.status(500).send("Server configuration error");
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook signature verification failed");
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    logger.info({ type: event.type, id: event.id }, "Stripe webhook received");

    try {
      switch (event.type) {
        // Fired when a customer completes Stripe Checkout (first subscription payment)
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const { org_id, plan_type } = session.metadata ?? {};

          if (!org_id || !plan_type) {
            logger.error(
              { sessionId: session.id },
              "checkout.session.completed missing org_id or plan_type metadata"
            );
            break;
          }

          await billingService.handleSubscriptionSuccess(
            org_id,
            session.customer as string,
            session.subscription as string,
            plan_type
          );

          logger.info(
            { orgId: org_id, plan: plan_type },
            "Subscription activated — credits applied"
          );
          break;
        }

        // Fired on every successful renewal invoice
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;

          // In Stripe API v20+, invoice.parent holds the subscription reference
          const subscriptionId =
            invoice.parent?.type === "subscription_details"
              ? (invoice.parent.subscription_details?.subscription as string | undefined)
              : undefined;

          if (!subscriptionId) break;

          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const { org_id, plan_type } = sub.metadata ?? {};

          if (!org_id || !plan_type) {
            logger.warn(
              { subscriptionId: sub.id },
              "invoice.payment_succeeded subscription missing org metadata"
            );
            break;
          }

          await billingService.handleSubscriptionSuccess(
            org_id,
            invoice.customer as string,
            sub.id,
            plan_type
          );

          logger.info(
            { orgId: org_id, plan: plan_type },
            "Subscription renewed — credits re-applied"
          );
          break;
        }

        // Fired when a subscription is cancelled (by the customer or via dunning)
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const { org_id } = sub.metadata ?? {};

          if (!org_id) {
            logger.warn(
              { subscriptionId: sub.id },
              "customer.subscription.deleted missing org_id metadata"
            );
            break;
          }

          await billingService.cancelSubscription(org_id);
          logger.info({ orgId: org_id }, "Subscription cancelled");
          break;
        }

        default:
          // Unhandled event types are fine — Stripe sends many event types
          logger.debug({ type: event.type }, "Unhandled Stripe event type");
      }
    } catch (err) {
      logger.error(
        { err, eventType: event.type },
        "Error processing Stripe webhook event"
      );
      // Return 500 so Stripe retries delivery
      return res.status(500).json({ error: "Webhook handler error" });
    }

    // Acknowledge receipt — Stripe considers anything other than 2xx a failure and retries
    res.json({ received: true });
  }
);

export default router;
