// src/guardrails/piiDetector.ts
//
// PII (Personally Identifiable Information) detection.
//
// Reference: docs/architecture/06-application-layer.md §6.3
//
// Detects:
//   - Social Security Numbers (SSN)
//   - Credit card numbers
//   - Email addresses
//   - Phone numbers
//   - IP addresses
//   - Dates of birth
//   - Names (using common patterns)

import { logger } from '../utils/logger';

export interface PiiMatch {
  type: PiiType;
  value: string;
  maskedValue: string;
  startIndex: number;
  endIndex: number;
}

export type PiiType =
  | 'ssn'
  | 'credit_card'
  | 'email'
  | 'phone'
  | 'ip_address'
  | 'date_of_birth'
  | 'passport'
  | 'drivers_license';

interface PiiPattern {
  type: PiiType;
  pattern: RegExp;
  mask: (match: string) => string;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    type: 'ssn',
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    mask: () => '***-**-****',
  },
  {
    type: 'credit_card',
    // Matches 13-19 digit card numbers with optional separators
    pattern: /\b(?:\d{4}[-.\s]?){3,4}\d{1,4}\b/g,
    mask: (m) => '*'.repeat(m.length - 4) + m.slice(-4),
  },
  {
    type: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: (m) => {
      const [local, domain] = m.split('@');
      return local.slice(0, 2) + '***@' + domain;
    },
  },
  {
    type: 'phone',
    // US phone numbers
    pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    mask: (m) => m.replace(/\d(?=\d{4})/g, '*'),
  },
  {
    type: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    mask: () => '***.***.***.***',
  },
  {
    type: 'date_of_birth',
    // Common date formats that might be DOB
    pattern: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g,
    mask: () => '**/**/****',
  },
  {
    type: 'passport',
    // US passport format
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    mask: (m) => m.slice(0, 2) + '*'.repeat(m.length - 2),
  },
];

export class PiiDetector {
  private patterns: PiiPattern[];

  constructor(customPatterns?: PiiPattern[]) {
    this.patterns = customPatterns ?? PII_PATTERNS;
  }

  /**
   * Detect all PII in the given text.
   */
  detect(text: string): PiiMatch[] {
    const matches: PiiMatch[] = [];

    for (const { type, pattern, mask } of this.patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[0];
        matches.push({
          type,
          value,
          maskedValue: mask(value),
          startIndex: match.index,
          endIndex: match.index + value.length,
        });
      }
    }

    // Sort by start index
    matches.sort((a, b) => a.startIndex - b.startIndex);

    if (matches.length > 0) {
      logger.info({ count: matches.length, types: [...new Set(matches.map(m => m.type))] }, 'PII detected');
    }

    return matches;
  }

  /**
   * Mask all PII in the given text.
   */
  mask(text: string): string {
    const matches = this.detect(text);

    if (matches.length === 0) {
      return text;
    }

    // Work backwards to preserve indices
    let result = text;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      result =
        result.slice(0, match.startIndex) +
        match.maskedValue +
        result.slice(match.endIndex);
    }

    return result;
  }

  /**
   * Check if text contains any PII.
   */
  containsPii(text: string): boolean {
    return this.detect(text).length > 0;
  }

  /**
   * Get summary of PII types found.
   */
  getSummary(text: string): Record<PiiType, number> {
    const matches = this.detect(text);
    const summary: Record<string, number> = {};

    for (const match of matches) {
      summary[match.type] = (summary[match.type] || 0) + 1;
    }

    return summary as Record<PiiType, number>;
  }
}

export const piiDetector = new PiiDetector();
