// src/guardrails/costGuard.ts
//
// Cost control guardrails for LLM usage.
//
// Reference: docs/architecture/09-cost-architecture.md §9.1
//
// Prevents:
//   1. Excessive token usage per request
//   2. Budget overruns per organization
//   3. Abuse through repeated expensive queries

import { logger } from '../utils/logger';

export interface CostCheckResult {
  allowed: boolean;
  reason?: string;
  estimatedCost: number;
  remainingBudget?: number;
}

interface CostConfig {
  maxInputTokens: number;
  maxOutputTokens: number;
  costPerInputToken: number; // USD per 1M tokens
  costPerOutputToken: number; // USD per 1M tokens
  maxCostPerRequest: number; // USD
  dailyBudgetPerOrg: number; // USD
}

const DEFAULT_CONFIG: CostConfig = {
  maxInputTokens: 8000,
  maxOutputTokens: 2000,
  costPerInputToken: 0.075, // Gemini Flash input
  costPerOutputToken: 0.30, // Gemini Flash output
  maxCostPerRequest: 0.10, // $0.10 per request max
  dailyBudgetPerOrg: 50.0, // $50/day per org
};

// Simple in-memory tracking (in production, use Redis)
const orgDailyUsage: Map<string, { date: string; cost: number }> = new Map();

export class CostGuard {
  private config: CostConfig;

  constructor(config?: Partial<CostConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate cost for a request before processing.
   */
  estimateCost(inputTokens: number, expectedOutputTokens: number = 500): number {
    const inputCost = (inputTokens / 1_000_000) * this.config.costPerInputToken;
    const outputCost = (expectedOutputTokens / 1_000_000) * this.config.costPerOutputToken;
    return inputCost + outputCost;
  }

  /**
   * Check if a request should be allowed based on cost constraints.
   */
  async checkRequest(
    orgId: string,
    inputTokens: number,
    expectedOutputTokens: number = 500
  ): Promise<CostCheckResult> {
    // Check input token limit
    if (inputTokens > this.config.maxInputTokens) {
      logger.warn({ orgId, inputTokens }, 'Request exceeds max input tokens');
      return {
        allowed: false,
        reason: `Input exceeds maximum of ${this.config.maxInputTokens} tokens`,
        estimatedCost: 0,
      };
    }

    // Estimate cost
    const estimatedCost = this.estimateCost(inputTokens, expectedOutputTokens);

    // Check per-request cost limit
    if (estimatedCost > this.config.maxCostPerRequest) {
      logger.warn({ orgId, estimatedCost }, 'Request exceeds max cost per request');
      return {
        allowed: false,
        reason: `Estimated cost $${estimatedCost.toFixed(4)} exceeds limit of $${this.config.maxCostPerRequest}`,
        estimatedCost,
      };
    }

    // Check daily budget
    const today = new Date().toISOString().split('T')[0];
    const usage = orgDailyUsage.get(orgId);
    const dailySpent = usage?.date === today ? usage.cost : 0;
    const remainingBudget = this.config.dailyBudgetPerOrg - dailySpent;

    if (estimatedCost > remainingBudget) {
      logger.warn({ orgId, dailySpent, estimatedCost }, 'Daily budget exceeded');
      return {
        allowed: false,
        reason: `Daily budget exhausted. Spent: $${dailySpent.toFixed(2)}, Limit: $${this.config.dailyBudgetPerOrg}`,
        estimatedCost,
        remainingBudget,
      };
    }

    return {
      allowed: true,
      estimatedCost,
      remainingBudget: remainingBudget - estimatedCost,
    };
  }

  /**
   * Record actual cost after a request completes.
   */
  recordUsage(orgId: string, actualCost: number): void {
    const today = new Date().toISOString().split('T')[0];
    const usage = orgDailyUsage.get(orgId);

    if (usage?.date === today) {
      usage.cost += actualCost;
    } else {
      orgDailyUsage.set(orgId, { date: today, cost: actualCost });
    }

    logger.info({ orgId, actualCost, dailyTotal: orgDailyUsage.get(orgId)?.cost }, 'Cost recorded');
  }

  /**
   * Get current usage for an organization.
   */
  getUsage(orgId: string): { date: string; cost: number; remainingBudget: number } {
    const today = new Date().toISOString().split('T')[0];
    const usage = orgDailyUsage.get(orgId);
    const dailyCost = usage?.date === today ? usage.cost : 0;

    return {
      date: today,
      cost: dailyCost,
      remainingBudget: this.config.dailyBudgetPerOrg - dailyCost,
    };
  }

  /**
   * Simple token estimation (rough approximation).
   * For accurate counts, use a proper tokenizer.
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}

export const costGuard = new CostGuard();
