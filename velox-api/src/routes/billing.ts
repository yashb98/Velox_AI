// velox-api/src/routes/billing.ts

import { Router, Request, Response, NextFunction } from 'express';
import { billingService } from '../services/billingService';
import { logger } from '../utils/logger';

const router = Router();

// ─── Internal API Secret Validation ──────────────────────────────────────────
const VOICE_INTERNAL_SECRET = process.env.VOICE_INTERNAL_SECRET || 'dev-voice-secret';

function validateInternalSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-internal-secret'];
  if (secret !== VOICE_INTERNAL_SECRET) {
    logger.warn('Invalid internal API secret attempt');
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Create checkout session
router.post('/checkout', async (req, res) => {
  try {
    const { orgId, planType, successUrl, cancelUrl } = req.body;

    const session = await billingService.createCheckoutSession(
      orgId,
      planType,
      successUrl,
      cancelUrl
    );

    res.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    logger.error({ error }, 'Failed to create checkout session');
    res.status(500).json({ error: error.message });
  }
});

// Get billing info
router.get('/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const billingInfo = await billingService.getBillingInfo(orgId);
    res.json(billingInfo);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get billing info');
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
router.post('/:orgId/cancel', async (req, res) => {
  try {
    const { orgId } = req.params;
    await billingService.cancelSubscription(orgId);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, 'Failed to cancel subscription');
    res.status(500).json({ error: error.message });
  }
});

// ─── Internal Billing Endpoints (Voice Service) ─────────────────────────────
// These endpoints are called by the voice service for billing operations.
// Protected by X-Internal-Secret header validation.

// Check if organization has sufficient balance
router.post('/internal/billing/check', validateInternalSecret, async (req, res) => {
  try {
    const { orgId, requiredMinutes = 1 } = req.body;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    const hasBalance = await billingService.hasMinutes(orgId, requiredMinutes);
    const billingInfo = await billingService.getBillingInfo(orgId);

    res.json({
      hasBalance,
      currentBalance: billingInfo.credit_balance,
      requiredMinutes,
    });
  } catch (error: any) {
    logger.error({ error }, 'Internal billing check failed');
    res.status(500).json({ error: error.message });
  }
});

// Deduct minutes from organization balance
router.post('/internal/billing/deduct', validateInternalSecret, async (req, res) => {
  try {
    const { orgId, minutes, conversationId } = req.body;

    if (!orgId || minutes === undefined || !conversationId) {
      return res.status(400).json({
        error: 'orgId, minutes, and conversationId are required'
      });
    }

    const success = await billingService.deductMinutes(orgId, minutes, conversationId);

    if (success) {
      const billingInfo = await billingService.getBillingInfo(orgId);
      res.json({
        success: true,
        newBalance: billingInfo.credit_balance,
      });
    } else {
      res.json({
        success: false,
        error: 'Insufficient balance or deduction failed',
        newBalance: 0,
      });
    }
  } catch (error: any) {
    logger.error({ error }, 'Internal billing deduct failed');
    res.status(500).json({ error: error.message });
  }
});

// Handle end-of-call billing reconciliation
router.post('/internal/billing/call-end', validateInternalSecret, async (req, res) => {
  try {
    const { orgId, conversationId, durationSeconds } = req.body;

    if (!orgId || !conversationId) {
      return res.status(400).json({
        error: 'orgId and conversationId are required'
      });
    }

    // Calculate actual minutes (ceiling)
    const actualMinutes = Math.ceil((durationSeconds || 0) / 60);

    logger.info(
      { orgId, conversationId, durationSeconds, actualMinutes },
      'Call end billing reconciliation'
    );

    // Note: The 30-second ticker already deducted during the call.
    // This endpoint is mainly for logging and any final adjustments.
    // No additional deduction needed here as ticker already handled it.

    const billingInfo = await billingService.getBillingInfo(orgId);

    res.json({
      success: true,
      newBalance: billingInfo.credit_balance,
      actualMinutes,
    });
  } catch (error: any) {
    logger.error({ error }, 'Internal call-end billing failed');
    res.status(500).json({ error: error.message });
  }
});

export default router;