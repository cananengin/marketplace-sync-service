import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Marketplace } from '@prisma/client';

interface ValidateReceiptBody {
  receipt: string;
  currency?: string;
}

interface ValidateReceiptParams {
  marketplace: Marketplace;
}

interface SuccessResponse {
  status: true;
  orderId: string;
  amount: number;
  currency: string;
  importedAtUTC: string;
}

interface FailureResponse {
  status: false;
}

interface RateLimitResponse {
  error: 'rate_limited';
}

/**
 * Get Basic Auth credentials for a marketplace
 */
function getMarketplaceCredentials(marketplace: Marketplace): { username: string; password: string } | null {
  const envMap: Record<Marketplace, { user: string; pass: string }> = {
    etsy: {
      user: process.env.MOCK_ETSY_USER || '',
      pass: process.env.MOCK_ETSY_PASS || '',
    },
    shopify: {
      user: process.env.MOCK_SHOPIFY_USER || '',
      pass: process.env.MOCK_SHOPIFY_PASS || '',
    },
    amazon: {
      user: process.env.MOCK_AMAZON_USER || '',
      pass: process.env.MOCK_AMAZON_PASS || '',
    },
  };

  const creds = envMap[marketplace];
  if (!creds.user || !creds.pass) {
    return null;
  }

  return { username: creds.user, password: creds.pass };
}

/**
 * Parse Basic Auth header
 */
function parseBasicAuth(authHeader: string | undefined): { username: string; password: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  const base64 = authHeader.substring(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

/**
 * Check if receipt should trigger rate limit
 * Rate limit: receipt son 2 karakterinin sayısal toplamı %6==0 ise
 */
function shouldRateLimit(receipt: string): boolean {
  if (receipt.length < 2) {
    return false;
  }

  const lastTwo = receipt.slice(-2);
  const char1 = parseInt(lastTwo[0], 10);
  const char2 = parseInt(lastTwo[1], 10);

  // If either character is not a digit, don't trigger rate limit
  if (isNaN(char1) || isNaN(char2)) {
    return false;
  }

  const sum = char1 + char2;
  return sum % 6 === 0;
}

/**
 * Check if last character is an odd digit
 */
function isLastCharOddDigit(receipt: string): boolean {
  if (receipt.length === 0) {
    return false;
  }

  const lastChar = receipt[receipt.length - 1];
  const digit = parseInt(lastChar, 10);

  if (isNaN(digit)) {
    return false;
  }

  return digit % 2 === 1;
}

/**
 * Generate deterministic amount from receipt (for testing)
 */
function generateAmount(receipt: string): number {
  // Simple deterministic hash: sum of all character codes, then mod 1000, add 10
  let sum = 0;
  for (let i = 0; i < receipt.length; i++) {
    sum += receipt.charCodeAt(i);
  }
  return (sum % 1000) + 10;
}

/**
 * Generate orderId (simple UUID-like or random string)
 */
function generateOrderId(receipt: string): string {
  // Deterministic orderId based on receipt for testing
  // In real scenario, this would be a random UUID
  const hash = receipt.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  // Convert to positive and format as UUID-like string
  const positiveHash = Math.abs(hash);
  return `${positiveHash.toString(16).padStart(8, '0')}-${(positiveHash * 2).toString(16).padStart(4, '0')}-${(positiveHash * 3).toString(16).padStart(4, '0')}-${(positiveHash * 4).toString(16).padStart(4, '0')}-${(positiveHash * 5).toString(16).padStart(12, '0')}`;
}

export async function registerMockRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: ValidateReceiptParams;
    Body: ValidateReceiptBody;
  }>('/mock/:marketplace/validate', async (request: FastifyRequest<{
    Params: ValidateReceiptParams;
    Body: ValidateReceiptBody;
  }>, reply: FastifyReply) => {
    const { marketplace } = request.params;
    const { receipt, currency } = request.body;

    // Validate marketplace
    if (!['etsy', 'shopify', 'amazon'].includes(marketplace)) {
      return reply.code(400).send({ error: 'Invalid marketplace' });
    }

    // Validate receipt
    if (!receipt || typeof receipt !== 'string') {
      return reply.code(400).send({ error: 'receipt is required' });
    }

    // Check Basic Auth
    const authHeader = request.headers.authorization;
    const providedAuth = parseBasicAuth(authHeader);
    const expectedAuth = getMarketplaceCredentials(marketplace as Marketplace);

    if (!expectedAuth) {
      return reply.code(500).send({ error: 'Marketplace credentials not configured' });
    }

    if (!providedAuth || providedAuth.username !== expectedAuth.username || providedAuth.password !== expectedAuth.password) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Check rate limit
    if (shouldRateLimit(receipt)) {
      return reply.code(429).send({ error: 'rate_limited' } as RateLimitResponse);
    }

    // Check if last character is odd digit
    if (isLastCharOddDigit(receipt)) {
      const orderId = generateOrderId(receipt);
      const amount = generateAmount(receipt);
      const finalCurrency = currency || 'USD';
      const importedAtUTC = new Date().toISOString();

      return reply.code(200).send({
        status: true,
        orderId,
        amount,
        currency: finalCurrency,
        importedAtUTC,
      } as SuccessResponse);
    }

    // Failure case
    return reply.code(200).send({
      status: false,
    } as FailureResponse);
  });
}
