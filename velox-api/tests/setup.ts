// tests/setup.ts — Jest test setup and global mocks
//
// Reference: docs/architecture/08-mlops-cicd.md §8.3

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/velox_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
process.env.CLERK_SECRET_KEY = 'test-clerk-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.ADMIN_API_KEY = 'test-admin-key';

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    agent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    knowledgeBase: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    knowledgeChunk: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    hset: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn(),
    hincrby: jest.fn(),
    expire: jest.fn(),
    quit: jest.fn(),
  }));
});

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  jest.clearAllMocks();
});
