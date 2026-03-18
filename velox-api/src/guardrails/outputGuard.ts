// src/guardrails/outputGuard.ts
//
// Output validation and safety filtering.
//
// Reference: docs/architecture/06-application-layer.md §6.3
//
// Checks:
//   1. Toxic/harmful content detection
//   2. Hallucination markers
//   3. Sensitive data leakage
//   4. Output format validation

import { logger } from '../utils/logger';

export interface OutputValidationResult {
  isValid: boolean;
  filtered: boolean;
  reason?: string;
  safetyScore: number; // 0-100 (100 = completely safe)
  filteredOutput?: string;
}

// Patterns indicating harmful content
const HARMFUL_PATTERNS = [
  // Violence
  /\b(kill|murder|assassinate|harm)\s+(yourself|someone|people)/i,
  /how\s+to\s+(make|build)\s+(a\s+)?(bomb|weapon|explosive)/i,

  // Self-harm
  /\b(suicide|self[_\s-]?harm)\b/i,

  // Illegal activities
  /how\s+to\s+(hack|break\s+into|steal)/i,
  /\b(illegal|illicit)\s+(drug|substance)/i,

  // Explicit content markers
  /\[EXPLICIT\]/i,
  /\[NSFW\]/i,
];

// Patterns indicating potential hallucination
const HALLUCINATION_MARKERS = [
  /I\s+(don't|do\s+not)\s+have\s+(access|information)/i,
  /I\s+cannot\s+(verify|confirm)/i,
  /I'm\s+(not\s+sure|uncertain)/i,
  /this\s+may\s+(not\s+be|be\s+in)accurate/i,
  /I\s+made\s+(this|that)\s+up/i,
];

// Patterns for system prompt leakage
const LEAKAGE_PATTERNS = [
  /my\s+(system\s+)?prompt\s+(is|says)/i,
  /I\s+(was|am)\s+instructed\s+to/i,
  /my\s+instructions\s+(say|are)/i,
  /\[SYSTEM\]/i,
  /```system/i,
];

// Patterns for PII in output (should not be echoed back)
const OUTPUT_PII_PATTERNS = [
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // SSN
  /\b\d{16}\b/, // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
];

export class OutputGuard {
  private maxOutputLength: number;

  constructor(options?: { maxOutputLength?: number }) {
    this.maxOutputLength = options?.maxOutputLength ?? 2000;
  }

  /**
   * Validate LLM output for safety issues.
   */
  validate(output: string): OutputValidationResult {
    if (!output || !output.trim()) {
      return {
        isValid: true,
        filtered: false,
        safetyScore: 100,
        filteredOutput: output,
      };
    }

    let safetyScore = 100;
    const issues: string[] = [];

    // Check for harmful content
    for (const pattern of HARMFUL_PATTERNS) {
      if (pattern.test(output)) {
        logger.warn({ pattern: pattern.source }, 'Harmful content detected in output');
        return {
          isValid: false,
          filtered: true,
          reason: 'Output contains potentially harmful content',
          safetyScore: 0,
          filteredOutput: "I'm sorry, but I can't help with that request.",
        };
      }
    }

    // Check for system prompt leakage
    for (const pattern of LEAKAGE_PATTERNS) {
      if (pattern.test(output)) {
        logger.warn('System prompt leakage detected in output');
        safetyScore -= 30;
        issues.push('system_leakage');
      }
    }

    // Check for hallucination markers
    let hallucinationCount = 0;
    for (const pattern of HALLUCINATION_MARKERS) {
      if (pattern.test(output)) {
        hallucinationCount++;
      }
    }
    if (hallucinationCount > 1) {
      safetyScore -= hallucinationCount * 10;
      issues.push('potential_hallucination');
    }

    // Check for PII in output
    for (const pattern of OUTPUT_PII_PATTERNS) {
      if (pattern.test(output)) {
        logger.warn('PII detected in output - masking');
        safetyScore -= 20;
        issues.push('pii_in_output');
      }
    }

    // Truncate if too long
    let filteredOutput = output;
    if (output.length > this.maxOutputLength) {
      filteredOutput = output.slice(0, this.maxOutputLength) + '...';
      safetyScore -= 5;
    }

    // Mask any PII found in output
    filteredOutput = this.maskPii(filteredOutput);

    return {
      isValid: safetyScore >= 50,
      filtered: filteredOutput !== output,
      reason: issues.length > 0 ? issues.join(', ') : undefined,
      safetyScore: Math.max(0, safetyScore),
      filteredOutput,
    };
  }

  /**
   * Mask PII patterns in output.
   */
  private maskPii(text: string): string {
    return text
      // Mask SSN-like patterns
      .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '***-**-****')
      // Mask credit card-like patterns
      .replace(/\b\d{16}\b/g, '****-****-****-****')
      // Mask email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email protected]');
  }
}

export const outputGuard = new OutputGuard();
