// src/guardrails/guardrailsService.ts
//
// Unified guardrails service that orchestrates all safety checks.
//
// Reference: docs/architecture/06-application-layer.md §6.3
//
// Usage in orchestrator:
//   const result = await guardrailsService.validateInput(userMessage, orgId);
//   if (!result.allowed) {
//     return result.fallbackResponse;
//   }

import { logger } from '../utils/logger';
import { InputGuard, InputValidationResult } from './inputGuard';
import { OutputGuard, OutputValidationResult } from './outputGuard';
import { PiiDetector } from './piiDetector';
import { CostGuard, CostCheckResult } from './costGuard';

export interface GuardrailsConfig {
  enableInputValidation: boolean;
  enableOutputValidation: boolean;
  enablePiiDetection: boolean;
  enableCostGuards: boolean;
  logViolations: boolean;
}

interface InputCheckResult {
  allowed: boolean;
  sanitizedInput: string;
  validation: InputValidationResult;
  costCheck?: CostCheckResult;
  fallbackResponse?: string;
}

interface OutputCheckResult {
  allowed: boolean;
  filteredOutput: string;
  validation: OutputValidationResult;
}

const DEFAULT_CONFIG: GuardrailsConfig = {
  enableInputValidation: true,
  enableOutputValidation: true,
  enablePiiDetection: true,
  enableCostGuards: true,
  logViolations: true,
};

export class GuardrailsService {
  private config: GuardrailsConfig;
  private inputGuard: InputGuard;
  private outputGuard: OutputGuard;
  private piiDetector: PiiDetector;
  private costGuard: CostGuard;

  constructor(config?: Partial<GuardrailsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.inputGuard = new InputGuard();
    this.outputGuard = new OutputGuard();
    this.piiDetector = new PiiDetector();
    this.costGuard = new CostGuard();
  }

  /**
   * Validate user input through all enabled guardrails.
   */
  async validateInput(
    input: string,
    orgId: string,
    options?: { skipCostCheck?: boolean }
  ): Promise<InputCheckResult> {
    let sanitizedInput = input;

    // 1. Input validation (prompt injection, etc.)
    if (this.config.enableInputValidation) {
      const validation = this.inputGuard.validate(input);

      if (validation.blocked) {
        if (this.config.logViolations) {
          logger.warn(
            { orgId, reason: validation.reason, riskScore: validation.riskScore },
            'Input blocked by guardrails'
          );
        }

        return {
          allowed: false,
          sanitizedInput: '',
          validation,
          fallbackResponse: this.getInputBlockedResponse(validation.reason),
        };
      }

      sanitizedInput = validation.sanitizedInput ?? input;
    }

    // 2. PII detection and masking (optional - can mask instead of block)
    if (this.config.enablePiiDetection) {
      const containsPii = this.piiDetector.containsPii(sanitizedInput);
      if (containsPii) {
        logger.info({ orgId }, 'PII detected in input - masking');
        sanitizedInput = this.piiDetector.mask(sanitizedInput);
      }
    }

    // 3. Cost check
    let costCheck: CostCheckResult | undefined;
    if (this.config.enableCostGuards && !options?.skipCostCheck) {
      const estimatedTokens = this.costGuard.estimateTokens(sanitizedInput);
      costCheck = await this.costGuard.checkRequest(orgId, estimatedTokens);

      if (!costCheck.allowed) {
        if (this.config.logViolations) {
          logger.warn({ orgId, reason: costCheck.reason }, 'Request blocked by cost guard');
        }

        return {
          allowed: false,
          sanitizedInput,
          validation: {
            isValid: true,
            blocked: false,
            riskScore: 0,
          },
          costCheck,
          fallbackResponse: "I'm sorry, but your usage limit has been reached. Please try again later or upgrade your plan.",
        };
      }
    }

    return {
      allowed: true,
      sanitizedInput,
      validation: {
        isValid: true,
        blocked: false,
        riskScore: 0,
        sanitizedInput,
      },
      costCheck,
    };
  }

  /**
   * Validate LLM output through all enabled guardrails.
   */
  validateOutput(output: string): OutputCheckResult {
    let filteredOutput = output;

    // 1. Output validation (harmful content, etc.)
    if (this.config.enableOutputValidation) {
      const validation = this.outputGuard.validate(output);

      if (!validation.isValid) {
        if (this.config.logViolations) {
          logger.warn(
            { reason: validation.reason, safetyScore: validation.safetyScore },
            'Output filtered by guardrails'
          );
        }

        return {
          allowed: false,
          filteredOutput: validation.filteredOutput ?? this.getSafeResponse(),
          validation,
        };
      }

      filteredOutput = validation.filteredOutput ?? output;
    }

    // 2. Additional PII masking in output
    if (this.config.enablePiiDetection) {
      filteredOutput = this.piiDetector.mask(filteredOutput);
    }

    return {
      allowed: true,
      filteredOutput,
      validation: {
        isValid: true,
        filtered: filteredOutput !== output,
        safetyScore: 100,
        filteredOutput,
      },
    };
  }

  /**
   * Record cost after a successful request.
   */
  recordCost(orgId: string, inputTokens: number, outputTokens: number): void {
    if (this.config.enableCostGuards) {
      const cost = this.costGuard.estimateCost(inputTokens, outputTokens);
      this.costGuard.recordUsage(orgId, cost);
    }
  }

  /**
   * Get a safe fallback response when input is blocked.
   */
  private getInputBlockedResponse(reason?: string): string {
    if (reason?.includes('prompt injection')) {
      return "I'm here to help with your questions. How can I assist you today?";
    }
    if (reason?.includes('length')) {
      return "Your message is quite long. Could you please summarize your question?";
    }
    return "I'm sorry, but I wasn't able to process that request. Could you rephrase your question?";
  }

  /**
   * Get a safe fallback response when output is filtered.
   */
  private getSafeResponse(): string {
    return "I apologize, but I'm not able to provide that information. Is there something else I can help you with?";
  }
}

export const guardrailsService = new GuardrailsService();
