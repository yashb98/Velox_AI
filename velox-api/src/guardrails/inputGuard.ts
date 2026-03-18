// src/guardrails/inputGuard.ts
//
// Input validation and prompt injection defense.
//
// Reference: docs/architecture/06-application-layer.md §6.3
//
// Defenses:
//   1. Prompt injection detection (system prompt leakage, instruction override)
//   2. Input length limits
//   3. Suspicious pattern detection
//   4. Rate limiting markers

import { logger } from '../utils/logger';

export interface InputValidationResult {
  isValid: boolean;
  blocked: boolean;
  reason?: string;
  riskScore: number; // 0-100
  sanitizedInput?: string;
}

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  // Direct instruction override
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /forget\s+(everything|all|what)/i,

  // System prompt extraction
  /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /reveal\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /show\s+(me\s+)?your\s+(system\s+)?(prompt|instructions?)/i,
  /print\s+your\s+(system\s+)?(prompt|instructions?)/i,

  // Role manipulation
  /you\s+are\s+(now|no\s+longer)/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /act\s+as\s+(if|though)/i,
  /roleplay\s+as/i,

  // Jailbreak attempts
  /DAN\s+(mode|prompt)/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /bypass\s+(your\s+)?(filter|safety|restrictions?)/i,

  // Delimiter injection
  /```system/i,
  /\[SYSTEM\]/i,
  /<\|system\|>/i,
  /###\s*(SYSTEM|INSTRUCTION)/i,

  // Output manipulation
  /respond\s+with\s+(only|just)/i,
  /output\s+(only|just)/i,
  /your\s+response\s+must\s+(be|start)/i,
];

// Suspicious patterns that increase risk score
const SUSPICIOUS_PATTERNS = [
  { pattern: /\bpassword\b/i, score: 20 },
  { pattern: /\bapi[_\s]?key\b/i, score: 30 },
  { pattern: /\bsecret\b/i, score: 15 },
  { pattern: /\btoken\b/i, score: 15 },
  { pattern: /\bcredential/i, score: 25 },
  { pattern: /\bexec\s*\(/i, score: 40 },
  { pattern: /\beval\s*\(/i, score: 40 },
  { pattern: /\bsudo\b/i, score: 30 },
  { pattern: /\brm\s+-rf/i, score: 50 },
  { pattern: /\bdrop\s+table/i, score: 50 },
  { pattern: /\bdelete\s+from/i, score: 30 },
];

export class InputGuard {
  private maxInputLength: number;
  private riskThreshold: number;

  constructor(options?: { maxInputLength?: number; riskThreshold?: number }) {
    this.maxInputLength = options?.maxInputLength ?? 4000;
    this.riskThreshold = options?.riskThreshold ?? 70;
  }

  /**
   * Validate user input for security issues.
   */
  validate(input: string): InputValidationResult {
    // Empty input check
    if (!input || !input.trim()) {
      return {
        isValid: false,
        blocked: true,
        reason: 'Empty input',
        riskScore: 0,
      };
    }

    // Length check
    if (input.length > this.maxInputLength) {
      logger.warn({ inputLength: input.length }, 'Input exceeds max length');
      return {
        isValid: false,
        blocked: true,
        reason: `Input exceeds maximum length of ${this.maxInputLength} characters`,
        riskScore: 50,
      };
    }

    // Prompt injection detection
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn({ pattern: pattern.source }, 'Prompt injection attempt detected');
        return {
          isValid: false,
          blocked: true,
          reason: 'Potential prompt injection detected',
          riskScore: 100,
        };
      }
    }

    // Calculate risk score from suspicious patterns
    let riskScore = 0;
    for (const { pattern, score } of SUSPICIOUS_PATTERNS) {
      if (pattern.test(input)) {
        riskScore += score;
      }
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    // Block if risk score exceeds threshold
    if (riskScore >= this.riskThreshold) {
      logger.warn({ riskScore }, 'Input blocked due to high risk score');
      return {
        isValid: false,
        blocked: true,
        reason: 'Input flagged for suspicious content',
        riskScore,
      };
    }

    // Sanitize input (basic)
    const sanitizedInput = this.sanitize(input);

    return {
      isValid: true,
      blocked: false,
      riskScore,
      sanitizedInput,
    };
  }

  /**
   * Sanitize input by removing potentially dangerous characters.
   */
  private sanitize(input: string): string {
    return input
      // Remove null bytes
      .replace(/\0/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const inputGuard = new InputGuard();
