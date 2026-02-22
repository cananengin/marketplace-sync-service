import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerMockRoutes } from '../../src/api/mock-routes';

describe('Mock Marketplace API Routes', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    // Set up test credentials
    process.env.MOCK_ETSY_USER = 'etsy_user';
    process.env.MOCK_ETSY_PASS = 'etsy_pass';
    process.env.MOCK_SHOPIFY_USER = 'shopify_user';
    process.env.MOCK_SHOPIFY_PASS = 'shopify_pass';
    process.env.MOCK_AMAZON_USER = 'amazon_user';
    process.env.MOCK_AMAZON_PASS = 'amazon_pass';

    fastify = Fastify();
    await fastify.register(registerMockRoutes);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  function createBasicAuth(username: string, password: string): string {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  describe('Authentication', () => {
    it('should return 401 for missing authorization header', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        payload: { receipt: 'test123' },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'Unauthorized' });
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('wrong_user', 'wrong_pass'),
        },
        payload: { receipt: 'test123' },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'Unauthorized' });
    });

    it('should accept valid credentials', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'test1' }, // last char is odd digit
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when receipt last 2 digits sum is divisible by 6', async () => {
      // Last 2 chars: "24" -> 2+4=6 -> 6%6=0 -> rate limit
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'test24' },
      });

      expect(response.statusCode).toBe(429);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'rate_limited' });
    });

    it('should not rate limit when last 2 chars are not both digits', async () => {
      // Last 2 chars: "a1" -> not both digits -> no rate limit
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'testa1' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe(true); // '1' is odd digit
    });

    it('should not rate limit when sum is not divisible by 6', async () => {
      // Last 2 chars: "12" -> 1+2=3 -> 3%6!=0 -> no rate limit
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'test12' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe(false); // '2' is even digit
    });
  });

  describe('Success Response', () => {
    it('should return success when last character is odd digit', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'test1', currency: 'EUR' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: true,
        orderId: expect.any(String),
        amount: expect.any(Number),
        currency: 'EUR',
        importedAtUTC: expect.any(String),
      });
      expect(body.amount).toBeGreaterThan(0);
      expect(new Date(body.importedAtUTC).toISOString()).toBe(body.importedAtUTC);
    });

    it('should use USD as default currency when not provided', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/shopify/validate',
        headers: {
          authorization: createBasicAuth('shopify_user', 'shopify_pass'),
        },
        payload: { receipt: 'test3' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe(true);
      expect(body.currency).toBe('USD');
    });

    it('should generate deterministic amount for same receipt', async () => {
      const receipt = 'test123';
      
      const response1 = await fastify.inject({
        method: 'POST',
        url: '/mock/amazon/validate',
        headers: {
          authorization: createBasicAuth('amazon_user', 'amazon_pass'),
        },
        payload: { receipt },
      });

      const response2 = await fastify.inject({
        method: 'POST',
        url: '/mock/amazon/validate',
        headers: {
          authorization: createBasicAuth('amazon_user', 'amazon_pass'),
        },
        payload: { receipt },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
      
      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);
      
      expect(body1.amount).toBe(body2.amount);
      expect(body1.orderId).toBe(body2.orderId);
    });
  });

  describe('Failure Response', () => {
    it('should return failure when last character is even digit', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'test2' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({ status: false });
    });

    it('should return failure when last character is not a digit', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'testa' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({ status: false });
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid marketplace', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/invalid/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: { receipt: 'test1' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'Invalid marketplace' });
    });

    it('should return 400 for missing receipt', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mock/etsy/validate',
        headers: {
          authorization: createBasicAuth('etsy_user', 'etsy_pass'),
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'receipt is required' });
    });
  });
});
