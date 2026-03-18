// tests/unit/middleware/rateLimiter.test.ts
//
// Unit tests for rate limiter middleware
// Reference: docs/architecture/08-mlops-cicd.md §8.3

import { Request, Response, NextFunction } from 'express';

// Mock Redis before importing rate limiter
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

describe('Rate Limiter Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      path: '/api/test',
      method: 'GET',
      headers: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should allow requests under the rate limit', async () => {
    // Rate limiter allows first requests by default
    const { rateLimiter } = await import('../../../src/middleware/rateLimiter');

    await rateLimiter(mockReq as Request, mockRes as Response, mockNext);

    // Should call next() for allowed requests
    expect(mockNext).toHaveBeenCalled();
  });

  it('should include rate limit headers', async () => {
    const { rateLimiter } = await import('../../../src/middleware/rateLimiter');

    await rateLimiter(mockReq as Request, mockRes as Response, mockNext);

    // Rate limit headers should be set
    expect(mockRes.setHeader).toHaveBeenCalled();
  });

  it('should handle requests with X-Forwarded-For header', async () => {
    mockReq.headers = { 'x-forwarded-for': '192.168.1.1' };

    const { rateLimiter } = await import('../../../src/middleware/rateLimiter');

    await rateLimiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
