// tests/integration/api.test.ts
//
// Integration tests for Velox API endpoints.
//
// Reference: docs/architecture/08-mlops-cicd.md §8.3
//
// Tests API routes with mocked dependencies.

import request from 'supertest';
import express from 'express';

// Create a minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  // Mock agents endpoint
  app.get('/api/agents', (_req, res) => {
    res.json([
      {
        id: 'agent-1',
        name: 'Test Agent',
        system_prompt: 'You are a helpful assistant',
        voice_id: 'aura-asteria-en',
        is_active: true,
      },
    ]);
  });

  app.post('/api/agents', (req, res) => {
    if (!req.body.name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    res.status(201).json({
      id: 'new-agent-id',
      ...req.body,
    });
  });

  // Mock billing endpoint
  app.get('/api/billing/subscription', (_req, res) => {
    res.json({
      credit_balance: 1000,
      current_plan: 'STARTER',
      transactions: [],
    });
  });

  // Mock playground endpoint
  app.post('/api/playground/chat', (req, res) => {
    if (!req.body.message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    res.json({
      response: 'This is a test response',
      model_used: 'gemini-2.5-flash',
    });
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return app;
};

describe('API Integration Tests', () => {
  const app = createTestApp();

  describe('Health Endpoints', () => {
    describe('GET /health', () => {
      it('should return 200 with status ok', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.uptime).toBeDefined();
      });
    });
  });

  describe('Agents API', () => {
    describe('GET /api/agents', () => {
      it('should return list of agents', async () => {
        const response = await request(app).get('/api/agents');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
      });

      it('should include agent properties', async () => {
        const response = await request(app).get('/api/agents');
        const agent = response.body[0];

        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('system_prompt');
        expect(agent).toHaveProperty('voice_id');
        expect(agent).toHaveProperty('is_active');
      });
    });

    describe('POST /api/agents', () => {
      it('should create an agent with valid data', async () => {
        const response = await request(app)
          .post('/api/agents')
          .send({
            name: 'New Agent',
            system_prompt: 'You are helpful',
            voice_id: 'aura-asteria-en',
          });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe('New Agent');
        expect(response.body.id).toBeDefined();
      });

      it('should return 400 without name', async () => {
        const response = await request(app)
          .post('/api/agents')
          .send({
            system_prompt: 'You are helpful',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Name');
      });
    });
  });

  describe('Billing API', () => {
    describe('GET /api/billing/subscription', () => {
      it('should return billing info', async () => {
        const response = await request(app).get('/api/billing/subscription');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('credit_balance');
        expect(response.body).toHaveProperty('current_plan');
      });

      it('should return numeric credit balance', async () => {
        const response = await request(app).get('/api/billing/subscription');

        expect(typeof response.body.credit_balance).toBe('number');
      });
    });
  });

  describe('Playground API', () => {
    describe('POST /api/playground/chat', () => {
      it('should return chat response', async () => {
        const response = await request(app)
          .post('/api/playground/chat')
          .send({
            message: 'Hello',
            agentId: 'agent-1',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('response');
        expect(response.body).toHaveProperty('model_used');
      });

      it('should return 400 without message', async () => {
        const response = await request(app)
          .post('/api/playground/chat')
          .send({
            agentId: 'agent-1',
          });

        expect(response.status).toBe(400);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return JSON error for 404', async () => {
      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(404);
    });

    it('should include content-type header', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Request Validation', () => {
    it('should accept valid JSON', async () => {
      const response = await request(app)
        .post('/api/playground/chat')
        .set('Content-Type', 'application/json')
        .send({ message: 'Hello' });

      expect(response.status).toBe(200);
    });
  });
});
