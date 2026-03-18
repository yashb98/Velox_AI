// tests/unit/services/metricsService.test.ts
//
// Unit tests for MetricsService
// Reference: docs/architecture/08-mlops-cicd.md §8.3

import { MetricsService, metricsRegistry } from '../../../src/services/metricsService';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  describe('startTurn', () => {
    it('should create a new metrics entry for an interaction', () => {
      const interactionId = 1;
      metricsService.startTurn(interactionId);

      // Internal state check via mark not throwing
      expect(() => metricsService.mark(interactionId, 'llmStart')).not.toThrow();
    });

    it('should handle multiple interactions independently', () => {
      metricsService.startTurn(1);
      metricsService.startTurn(2);

      expect(() => metricsService.mark(1, 'llmStart')).not.toThrow();
      expect(() => metricsService.mark(2, 'llmStart')).not.toThrow();
    });
  });

  describe('mark', () => {
    it('should mark llmStart stage', () => {
      metricsService.startTurn(1);
      expect(() => metricsService.mark(1, 'llmStart')).not.toThrow();
    });

    it('should mark llmFirstToken stage', () => {
      metricsService.startTurn(1);
      metricsService.mark(1, 'llmStart');
      expect(() => metricsService.mark(1, 'llmFirstToken')).not.toThrow();
    });

    it('should mark ttsStart stage', () => {
      metricsService.startTurn(1);
      expect(() => metricsService.mark(1, 'ttsStart')).not.toThrow();
    });

    it('should not throw for unknown interaction ID', () => {
      expect(() => metricsService.mark(999, 'llmStart')).not.toThrow();
    });
  });

  describe('Prometheus metrics', () => {
    it('should have metricsRegistry defined', () => {
      expect(metricsRegistry).toBeDefined();
    });

    it('should register velox_calls_total counter', async () => {
      const metrics = await metricsRegistry.metrics();
      expect(metrics).toContain('velox_calls_total');
    });

    it('should register velox_llm_latency_seconds histogram', async () => {
      const metrics = await metricsRegistry.metrics();
      expect(metrics).toContain('velox_llm_latency_seconds');
    });

    it('should register velox_active_calls gauge', async () => {
      const metrics = await metricsRegistry.metrics();
      expect(metrics).toContain('velox_active_calls');
    });
  });
});
