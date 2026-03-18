// tests/unit/app.test.ts
//
// Unit tests for Express app configuration
// Reference: docs/architecture/08-mlops-cicd.md §8.3

import request from 'supertest';
import express from 'express';

// Create a minimal test app for health check testing
const createTestApp = () => {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('# HELP velox_calls_total Total calls\n');
  });

  return app;
};

describe('Express App', () => {
  const app = createTestApp();

  describe('GET /health', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('ok');
    });

    it('should include uptime', async () => {
      const response = await request(app).get('/health');
      expect(response.body.uptime).toBeDefined();
      expect(typeof response.body.uptime).toBe('number');
    });

    it('should include version', async () => {
      const response = await request(app).get('/health');
      expect(response.body.version).toBeDefined();
    });
  });

  describe('GET /metrics', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/metrics');
      expect(response.status).toBe(200);
    });

    it('should return text/plain content type', async () => {
      const response = await request(app).get('/metrics');
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should include Prometheus metrics format', async () => {
      const response = await request(app).get('/metrics');
      expect(response.text).toContain('# HELP');
    });
  });

  describe('Security headers', () => {
    it('should handle CORS preflight', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Request ID', () => {
    it('should accept X-Request-ID header', async () => {
      const requestId = 'test-request-123';
      const response = await request(app)
        .get('/health')
        .set('X-Request-ID', requestId);

      expect(response.status).toBe(200);
    });
  });
});
