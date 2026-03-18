// tests/unit/services/billingService.test.ts
//
// Unit tests for BillingService
// Reference: docs/architecture/08-mlops-cicd.md §8.3

import { BillingService } from '../../../src/services/billingService';
import { PrismaClient } from '@prisma/client';

// Get mocked Prisma instance
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('BillingService', () => {
  let billingService: BillingService;

  beforeEach(() => {
    billingService = new BillingService();
    jest.clearAllMocks();
  });

  describe('hasMinutes', () => {
    it('should return true when org has sufficient balance', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-1',
        credit_balance: 100,
      });

      const result = await billingService.hasMinutes('org-1', 10);
      expect(result).toBe(true);
    });

    it('should return false when org has insufficient balance', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-1',
        credit_balance: 5,
      });

      const result = await billingService.hasMinutes('org-1', 10);
      expect(result).toBe(false);
    });

    it('should return false when org not found', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await billingService.hasMinutes('nonexistent', 10);
      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );

      const result = await billingService.hasMinutes('org-1', 10);
      expect(result).toBe(false);
    });

    it('should default to 1 minute if not specified', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-1',
        credit_balance: 1,
      });

      const result = await billingService.hasMinutes('org-1');
      expect(result).toBe(true);
    });
  });

  describe('deductMinutes', () => {
    it('should return false when org has insufficient balance', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-1',
        credit_balance: 5,
        version: 1,
      });

      const result = await billingService.deductMinutes('org-1', 10, 'conv-1');
      expect(result).toBe(false);
    });

    it('should return false when org not found', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await billingService.deductMinutes('nonexistent', 10, 'conv-1');
      expect(result).toBe(false);
    });

    it('should use optimistic locking with version check', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-1',
        credit_balance: 100,
        version: 5,
      });

      // Simulate successful update
      (mockPrisma.$executeRaw as jest.Mock).mockResolvedValue(1);
      (mockPrisma.transaction.create as jest.Mock).mockResolvedValue({});

      const result = await billingService.deductMinutes('org-1', 10, 'conv-1');
      expect(result).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should retry on optimistic lock conflict', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-1',
        credit_balance: 100,
        version: 5,
      });

      // First attempt fails (lock conflict), second succeeds
      (mockPrisma.$executeRaw as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      (mockPrisma.transaction.create as jest.Mock).mockResolvedValue({});

      const result = await billingService.deductMinutes('org-1', 10, 'conv-1');
      expect(result).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBillingInfo', () => {
    it('should throw when org not found', async () => {
      (mockPrisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(billingService.getBillingInfo('nonexistent')).rejects.toThrow(
        'Organization not found'
      );
    });
  });
});
