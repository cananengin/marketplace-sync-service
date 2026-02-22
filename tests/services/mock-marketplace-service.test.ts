import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerMockRoutes } from '../../src/api/mock-routes';
import { MockMarketplaceService } from '../../src/services/mock-marketplace-service';
import { RateLimitError, AuthError, MarketplaceError } from '../../src/infrastructure/errors';
import { Marketplace } from '@prisma/client';

describe('MockMarketplaceService', () => {
  let fastify: ReturnType<typeof Fastify>;
  let service: MockMarketplaceService;
  const port = 3001;

  beforeAll(async () => {
    // Set up test credentials
    process.env.MOCK_ETSY_USER = 'etsy_user';
    process.env.MOCK_ETSY_PASS = 'etsy_pass';
    process.env.MOCK_SHOPIFY_USER = 'shopify_user';
    process.env.MOCK_SHOPIFY_PASS = 'shopify_pass';
    process.env.MOCK_AMAZON_USER = 'amazon_user';
    process.env.MOCK_AMAZON_PASS = 'amazon_pass';

    // Start Fastify server
    fastify = Fastify();
    await fastify.register(registerMockRoutes);
    await fastify.listen({ port, host: '127.0.0.1' });

    // Create service with test server URL
    service = new MockMarketplaceService(`http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Success Cases', () => {
    it('should return success response for valid receipt with odd last digit', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.etsy,
        receipt: 'test1',
        currency: 'EUR',
      });

      expect(response.status).toBe(true);
      if (response.status) {
        expect(response.orderId).toBeDefined();
        expect(response.amount).toBeGreaterThan(0);
        expect(response.currency).toBe('EUR');
        expect(response.importedAtUTC).toBeDefined();
        expect(new Date(response.importedAtUTC).toISOString()).toBe(response.importedAtUTC);
      }
    });

    it('should use USD as default currency when not provided', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.shopify,
        receipt: 'test3',
      });

      expect(response.status).toBe(true);
      if (response.status) {
        expect(response.currency).toBe('USD');
      }
    });

    it('should return deterministic amount and orderId for same receipt', async () => {
      const receipt = 'test123';
      
      const response1 = await service.validateReceipt({
        marketplace: Marketplace.amazon,
        receipt,
      });

      const response2 = await service.validateReceipt({
        marketplace: Marketplace.amazon,
        receipt,
      });

      expect(response1.status).toBe(true);
      expect(response2.status).toBe(true);
      
      if (response1.status && response2.status) {
        expect(response1.amount).toBe(response2.amount);
        expect(response1.orderId).toBe(response2.orderId);
      }
    });
  });

  describe('Failure Cases', () => {
    it('should return failure response for receipt with even last digit', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.etsy,
        receipt: 'test2',
      });

      expect(response.status).toBe(false);
    });

    it('should return failure response for receipt with non-digit last character', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.etsy,
        receipt: 'testa',
      });

      expect(response.status).toBe(false);
    });
  });

  describe('Rate Limit Error', () => {
    it('should throw RateLimitError when rate limited', async () => {
      // Last 2 chars: "24" -> 2+4=6 -> 6%6=0 -> rate limit
      await expect(
        service.validateReceipt({
          marketplace: Marketplace.etsy,
          receipt: 'test24',
        })
      ).rejects.toThrow(RateLimitError);

      try {
        await service.validateReceipt({
          marketplace: Marketplace.etsy,
          receipt: 'test24',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).statusCode).toBe(429);
      }
    });
  });

  describe('Auth Error', () => {
    it('should throw AuthError for invalid credentials', async () => {
      // Use credentialsOverride to test with wrong credentials
      // without changing process.env (which would affect the mock API routes)
      await expect(
        service.validateReceipt({
          marketplace: Marketplace.etsy,
          receipt: 'test1',
          credentialsOverride: {
            username: 'wrong_user',
            password: 'wrong_pass',
          },
        })
      ).rejects.toThrow(AuthError);

      // Verify it's an instance of AuthError
      try {
        await service.validateReceipt({
          marketplace: Marketplace.etsy,
          receipt: 'test1',
          credentialsOverride: {
            username: 'wrong_user',
            password: 'wrong_pass',
          },
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).statusCode).toBe(401);
      }
    });
  });

  describe('Different Marketplaces', () => {
    it('should work with Etsy', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.etsy,
        receipt: 'etsy1',
      });

      expect(response.status).toBe(true);
    });

    it('should work with Shopify', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.shopify,
        receipt: 'shopify3',
      });

      expect(response.status).toBe(true);
    });

    it('should work with Amazon', async () => {
      const response = await service.validateReceipt({
        marketplace: Marketplace.amazon,
        receipt: 'amazon5',
      });

      expect(response.status).toBe(true);
    });
  });
});
