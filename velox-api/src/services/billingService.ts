// velox-api/src/services/billingService.ts

import { PrismaClient } from '@prisma/client';
import { stripe, STRIPE_PLANS } from '../config/stripe';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class BillingService {
  /**
   * Create a Stripe checkout session for subscription
   */
  async createCheckoutSession(
    orgId: string,
    planType: 'STARTER' | 'PRO' | 'ENTERPRISE',
    successUrl: string,
    cancelUrl: string
  ) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
      });

      if (!org) {
        throw new Error('Organization not found');
      }

      const plan = STRIPE_PLANS[planType];

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: orgId,
        customer_email: org.billing_email || undefined,
        metadata: {
          org_id: orgId,
          plan_type: planType,
        },
      });

      logger.info(`Checkout session created for org ${orgId}: ${session.id}`);

      return session;
    } catch (error) {
      logger.error({ error }, 'Failed to create checkout session');
      throw error;
    }
  }

  /**
   * Handle successful subscription payment
   * Credits minutes to the organization
   */
  async handleSubscriptionSuccess(
    orgId: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    planType: string
  ) {
    try {
      const plan = STRIPE_PLANS[planType as keyof typeof STRIPE_PLANS];
      
      if (!plan) {
        throw new Error(`Unknown plan type: ${planType}`);
      }

      // Credit minutes to organization
      const org = await prisma.organization.update({
        where: { id: orgId },
        data: {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          current_plan: planType,
          credit_balance: {
            increment: plan.minutes,
          },
        },
      });

      logger.info(`Credited ${plan.minutes} minutes to org ${orgId}. New balance: ${org.credit_balance}`);

      // Create transaction record
      await prisma.transaction.create({
        data: {
          org_id: orgId,
          type: 'CREDIT',
          amount: plan.minutes,
          description: `${plan.name} subscription - ${plan.minutes} minutes`,
          balance_after: org.credit_balance,
        },
      });

      return org;
    } catch (error) {
      logger.error({ error }, 'Failed to handle subscription success');
      throw error;
    }
  }

  /**
   * Deduct minutes from organization balance using optimistic locking.
   *
   * Uses a read-then-CAS pattern:
   *  1. Read current version + balance
   *  2. Attempt UPDATE WHERE version = $read_version AND credit_balance >= minutes
   *  3. If 0 rows affected, another process won the race — retry up to MAX_RETRIES
   *
   * This prevents revenue leakage under concurrent call load where multiple
   * billingInterval ticks could otherwise both read the same balance and both
   * decrement past zero.
   *
   * Returns true if deduction succeeded, false if balance was insufficient.
   */
  async deductMinutes(orgId: string, minutes: number, conversationId: string): Promise<boolean> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Step 1: Read current version and balance
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { credit_balance: true, version: true },
      });

      if (!org || org.credit_balance < minutes) {
        logger.warn(
          { orgId, required: minutes, balance: org?.credit_balance ?? 0 },
          'Insufficient credit balance — deduction skipped'
        );
        return false;
      }

      // Step 2: Conditional update — only commits if no other writer changed version
      const affected: number = await prisma.$executeRaw`
        UPDATE organizations
        SET credit_balance = credit_balance - ${minutes},
            version        = version + 1,
            updated_at     = now()
        WHERE id             = ${orgId}
          AND version        = ${org.version}
          AND credit_balance >= ${minutes}
      `;

      if (affected > 0) {
        // Step 3: Record the ledger entry
        const newBalance = org.credit_balance - minutes;
        await prisma.transaction.create({
          data: {
            org_id: orgId,
            type: 'DEBIT',
            amount: minutes,
            description: `Call usage — conversation ${conversationId}`,
            balance_after: newBalance,
            conversation_id: conversationId,
          },
        });

        logger.info(
          { orgId, minutes, newBalance, attempt },
          'Minutes deducted successfully'
        );
        return true;
      }

      // Step 4: version changed — another process updated concurrently, retry
      logger.warn({ orgId, attempt }, 'Optimistic lock conflict — retrying deduction');
    }

    logger.error({ orgId, minutes }, 'deductMinutes: max retries exceeded — possible race condition');
    return false;
  }

  /**
   * Check if organization has sufficient balance
   */
  async hasMinutes(orgId: string, requiredMinutes: number = 1): Promise<boolean> {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { credit_balance: true },
      });

      return (org?.credit_balance || 0) >= requiredMinutes;
    } catch (error) {
      logger.error({ error }, 'Failed to check balance');
      return false;
    }
  }

  /**
   * Get organization billing info
   */
  async getBillingInfo(orgId: string) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          credit_balance: true,
          current_plan: true,
          stripe_customer_id: true,
          stripe_subscription_id: true,
        },
      });

      if (!org) {
        throw new Error('Organization not found');
      }

      // Get recent transactions
      const transactions = await prisma.transaction.findMany({
        where: { org_id: orgId },
        orderBy: { created_at: 'desc' },
        take: 10,
      });

      // Get Stripe subscription if exists
      let subscription = null;
      if (org.stripe_subscription_id) {
        subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      }

      return {
        credit_balance: org.credit_balance,
        current_plan: org.current_plan,
        transactions,
        subscription,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get billing info');
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(orgId: string) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { stripe_subscription_id: true },
      });

      if (!org?.stripe_subscription_id) {
        throw new Error('No active subscription');
      }

      await stripe.subscriptions.cancel(org.stripe_subscription_id);

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          stripe_subscription_id: null,
          current_plan: null,
        },
      });

      logger.info(`Cancelled subscription for org ${orgId}`);
    } catch (error) {
      logger.error({ error }, 'Failed to cancel subscription');
      throw error;
    }
  }
}

export const billingService = new BillingService();