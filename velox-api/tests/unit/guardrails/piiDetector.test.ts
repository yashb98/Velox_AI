// tests/unit/guardrails/piiDetector.test.ts
//
// Unit tests for PII detection
// Reference: docs/architecture/06-application-layer.md §6.3

import { PiiDetector } from '../../../src/guardrails/piiDetector';

describe('PiiDetector', () => {
  let detector: PiiDetector;

  beforeEach(() => {
    detector = new PiiDetector();
  });

  describe('SSN Detection', () => {
    it('should detect SSN with dashes', () => {
      const matches = detector.detect('My SSN is 123-45-6789');
      expect(matches.length).toBe(1);
      expect(matches[0].type).toBe('ssn');
    });

    it('should detect SSN with spaces', () => {
      const matches = detector.detect('SSN: 123 45 6789');
      expect(matches.length).toBe(1);
      expect(matches[0].type).toBe('ssn');
    });

    it('should detect SSN without separators', () => {
      const matches = detector.detect('Number: 123456789');
      expect(matches.length).toBe(1);
    });
  });

  describe('Credit Card Detection', () => {
    it('should detect 16-digit credit card numbers', () => {
      const matches = detector.detect('Card: 4111111111111111');
      expect(matches.length).toBe(1);
      expect(matches[0].type).toBe('credit_card');
    });

    it('should detect credit cards with dashes', () => {
      const matches = detector.detect('Card: 4111-1111-1111-1111');
      expect(matches.length).toBe(1);
    });

    it('should detect credit cards with spaces', () => {
      const matches = detector.detect('Card: 4111 1111 1111 1111');
      expect(matches.length).toBe(1);
    });
  });

  describe('Email Detection', () => {
    it('should detect email addresses', () => {
      const matches = detector.detect('Email: john.doe@example.com');
      expect(matches.length).toBe(1);
      expect(matches[0].type).toBe('email');
    });

    it('should detect multiple emails', () => {
      const matches = detector.detect('Contact john@example.com or jane@example.org');
      expect(matches.length).toBe(2);
    });
  });

  describe('Phone Number Detection', () => {
    it('should detect US phone numbers with dashes', () => {
      const matches = detector.detect('Call me at 555-123-4567');
      expect(matches.length).toBe(1);
      expect(matches[0].type).toBe('phone');
    });

    it('should detect phone numbers with parentheses', () => {
      const matches = detector.detect('Phone: (555) 123-4567');
      expect(matches.length).toBe(1);
    });
  });

  describe('IP Address Detection', () => {
    it('should detect IPv4 addresses', () => {
      const matches = detector.detect('Server IP: 192.168.1.100');
      expect(matches.length).toBe(1);
      expect(matches[0].type).toBe('ip_address');
    });
  });

  describe('PII Masking', () => {
    it('should mask SSNs', () => {
      const result = detector.mask('SSN: 123-45-6789');
      expect(result).toBe('SSN: ***-**-****');
    });

    it('should mask emails', () => {
      const result = detector.mask('Email: john.doe@example.com');
      expect(result).toContain('jo***@');
    });

    it('should mask multiple PII types', () => {
      const result = detector.mask('SSN: 123-45-6789, Email: john@example.com');
      expect(result).not.toContain('123-45-6789');
      expect(result).not.toContain('john@example.com');
    });
  });

  describe('containsPii', () => {
    it('should return true when PII is present', () => {
      expect(detector.containsPii('My SSN is 123-45-6789')).toBe(true);
    });

    it('should return false when no PII is present', () => {
      expect(detector.containsPii('Hello, how are you?')).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('should return count by PII type', () => {
      const summary = detector.getSummary('SSN: 123-45-6789, Email: john@example.com');
      expect(summary.ssn).toBe(1);
      expect(summary.email).toBe(1);
    });
  });
});
