// import { Marketplace } from '@prisma/client';
// import { RateLimitError, AuthError, MarketplaceError } from '../infrastructure/errors';

// export interface ValidateReceiptRequest {
//   marketplace: Marketplace;
//   receipt: string;
//   currency?: string;
//   credentialsOverride?: {
//     username: string;
//     password: string;
//   };
// }

// export interface ValidateReceiptSuccessResponse {
//   status: true;
//   orderId: string;
//   amount: number;
//   currency: string;
//   importedAtUTC: string;
// }

// export interface ValidateReceiptFailureResponse {
//   status: false;
// }

// export type ValidateReceiptResponse = ValidateReceiptSuccessResponse | ValidateReceiptFailureResponse;

// /**
//  * Get Basic Auth credentials for a marketplace
//  */
// function getMarketplaceCredentials(marketplace: Marketplace): { username: string; password: string } {
//   const envMap: Record<Marketplace, { user: string; pass: string }> = {
//     etsy: {
//       user: process.env.MOCK_ETSY_USER || '',
//       pass: process.env.MOCK_ETSY_PASS || '',
//     },
//     shopify: {
//       user: process.env.MOCK_SHOPIFY_USER || '',
//       pass: process.env.MOCK_SHOPIFY_PASS || '',
//     },
//     amazon: {
//       user: process.env.MOCK_AMAZON_USER || '',
//       pass: process.env.MOCK_AMAZON_PASS || '',
//     },
//   };

//   const creds = envMap[marketplace];
//   if (!creds.user || !creds.pass) {
//     throw new Error(`Marketplace credentials not configured for ${marketplace}`);
//   }

//   return { username: creds.user, password: creds.pass };
// }

// /**
//  * Create Basic Auth header value
//  */
// function createBasicAuthHeader(username: string, password: string): string {
//   const credentials = Buffer.from(`${username}:${password}`).toString('base64');
//   return `Basic ${credentials}`;
// }

// export class MockMarketplaceService {
//   private baseUrl: string;

//   constructor(baseUrl: string = process.env.MOCK_API_BASE_URL || 'http://localhost:3000') {
//     this.baseUrl = baseUrl;
//   }

//   /**
//    * Validate receipt with marketplace mock API
//    */
//   async validateReceipt(request: ValidateReceiptRequest): Promise<ValidateReceiptResponse> {
//     const { marketplace, receipt, currency, credentialsOverride } = request;

//     // Get credentials for the marketplace (use override if provided, otherwise from env)
//     const credentials = credentialsOverride || getMarketplaceCredentials(marketplace);

//     // Create Basic Auth header
//     const authHeader = createBasicAuthHeader(credentials.username, credentials.password);

//     // Make request
//     const url = `${this.baseUrl}/mock/${marketplace}/validate`;
//     const response = await fetch(url, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': authHeader,
//       },
//       body: JSON.stringify({ receipt, currency }),
//     });

//     // Handle rate limit
//     if (response.status === 429) {
//       const errorData = await response.json().catch(() => ({}));
//       throw new RateLimitError('Rate limit exceeded', errorData);
//     }

//     // Handle auth errors
//     if (response.status === 401 || response.status === 403) {
//       const errorData = await response.json().catch(() => ({}));
//       throw new AuthError('Authentication failed', errorData);
//     }

//     // Handle other errors
//     if (!response.ok) {
//       const errorData = await response.json().catch(() => ({}));
//       throw new MarketplaceError(
//         `Marketplace API error: ${response.statusText}`,
//         response.status,
//         errorData
//       );
//     }

//     // Parse success response
//     const data = await response.json() as ValidateReceiptResponse;
//     return data;
//   }
// }

import { Marketplace } from '@prisma/client';
import { RateLimitError, AuthError, MarketplaceError } from '../infrastructure/errors';

export interface ValidateReceiptRequest {
  marketplace: Marketplace;
  receipt: string;
  currency?: string;
  credentialsOverride?: {
    username: string;
    password: string;
  };
}

export interface ValidateReceiptSuccessResponse {
  status: true;
  orderId: string;
  amount: number;
  currency: string;
  importedAtUTC: string;
}

export interface ValidateReceiptFailureResponse {
  status: false;
}

export type ValidateReceiptResponse = ValidateReceiptSuccessResponse | ValidateReceiptFailureResponse;

/**
 * Get Basic Auth credentials for a marketplace
 */
function getMarketplaceCredentials(marketplace: Marketplace): { username: string; password: string } {
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
    throw new Error(`Marketplace credentials not configured for ${marketplace}`);
  }

  return { username: creds.user, password: creds.pass };
}

/**
 * Create Basic Auth header value
 */
function createBasicAuthHeader(username: string, password: string): string {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

export class MockMarketplaceService {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.MOCK_API_BASE_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Validate receipt with marketplace mock API
   */
  async validateReceipt(request: ValidateReceiptRequest): Promise<ValidateReceiptResponse> {
    const { marketplace, receipt, currency, credentialsOverride } = request;

    // Get credentials for the marketplace (use override if provided, otherwise from env)
    const credentials = credentialsOverride || getMarketplaceCredentials(marketplace);

    // Create Basic Auth header
    const authHeader = createBasicAuthHeader(credentials.username, credentials.password);

    // Build request URL
    const url = `${this.baseUrl}/mock/${marketplace}/validate`;

    // Debug: show where we are trying to call
    console.log(
      JSON.stringify({
        event: 'fetch_start',
        baseUrl: this.baseUrl,
        url,
        marketplace,
        receipt,
      })
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ receipt, currency }),
      });
    } catch (err) {
      // Debug: show low-level cause (ENOTFOUND, ECONNREFUSED, ETIMEDOUT, etc.)
      const e = err as any;
      console.log(
        JSON.stringify({
          event: 'fetch_failed',
          baseUrl: this.baseUrl,
          url,
          marketplace,
          receipt,
          message: e?.message,
          name: e?.name,
          cause: e?.cause
            ? {
                name: e.cause.name,
                message: e.cause.message,
                code: e.cause.code,
              }
            : undefined,
        })
      );
      throw err;
    }

    // Debug: HTTP response received
    console.log(
      JSON.stringify({
        event: 'fetch_response',
        url,
        marketplace,
        receipt,
        status: response.status,
        ok: response.ok,
      })
    );

    // Handle rate limit
    if (response.status === 429) {
      const errorData = await response.json().catch(() => ({}));
      throw new RateLimitError('Rate limit exceeded', errorData);
    }

    // Handle auth errors
    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      throw new AuthError('Authentication failed', errorData);
    }

    // Handle other errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new MarketplaceError(`Marketplace API error: ${response.statusText}`, response.status, errorData);
    }

    // Parse success response
    const data = (await response.json()) as ValidateReceiptResponse;
    return data;
  }
}
