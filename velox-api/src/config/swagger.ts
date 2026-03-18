// src/config/swagger.ts
//
// OpenAPI/Swagger configuration for Velox API
//
// Reference: docs/architecture/06-application-layer.md §6.1
//
// Generates interactive API documentation at /api-docs

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Velox AI API',
      version: '1.0.0',
      description: `
Enterprise-grade AI Voice Agent Platform API.

## Overview
Velox AI enables you to build, deploy, and manage intelligent AI voice agents that can handle real phone calls.

## Authentication
All protected endpoints require a valid Clerk JWT token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting
- Public endpoints: 100 requests/minute
- Authenticated endpoints: 1000 requests/minute per organization

## Error Responses
All errors follow this format:
\`\`\`json
{
  "error": "Error message",
  "reqId": "request-uuid"
}
\`\`\`
      `,
      contact: {
        name: 'Velox AI Support',
        email: 'support@velox.ai',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Local development',
      },
      {
        url: 'https://api.velox.ai',
        description: 'Production',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Clerk JWT token',
        },
        adminAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Admin-Key',
          description: 'Admin API key for internal endpoints',
        },
      },
      schemas: {
        Agent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Customer Support Agent' },
            system_prompt: { type: 'string' },
            voice_id: { type: 'string', example: 'aura-asteria-en' },
            phone_number: { type: 'string', nullable: true },
            tools_enabled: { type: 'array', items: { type: 'string' } },
            llm_config: { type: 'object' },
            is_active: { type: 'boolean' },
            kb_id: { type: 'string', format: 'uuid', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            twilio_sid: { type: 'string' },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'COMPLETED', 'FAILED', 'ABANDONED'],
            },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time', nullable: true },
            cost_accrued: { type: 'number' },
            sentiment_score: { type: 'number', nullable: true },
            agent_id: { type: 'string', format: 'uuid' },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['user', 'assistant', 'system', 'tool'] },
            content: { type: 'string' },
            tokens: { type: 'integer' },
            latency_ms: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        BillingInfo: {
          type: 'object',
          properties: {
            credit_balance: { type: 'integer', description: 'Minutes available' },
            current_plan: { type: 'string', nullable: true },
            transactions: {
              type: 'array',
              items: { $ref: '#/components/schemas/Transaction' },
            },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['CREDIT', 'DEBIT'] },
            amount: { type: 'integer' },
            description: { type: 'string' },
            balance_after: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            kb_id: { type: 'string', format: 'uuid' },
            chunk_count: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            reqId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Service health endpoints' },
      { name: 'Agents', description: 'AI agent management' },
      { name: 'Conversations', description: 'Call history and messages' },
      { name: 'Billing', description: 'Subscription and usage' },
      { name: 'Documents', description: 'Knowledge base management' },
      { name: 'Playground', description: 'Test agent interactions' },
      { name: 'Admin', description: 'Internal admin endpoints' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
