export class MarketplaceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'MarketplaceError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RateLimitError extends MarketplaceError {
  constructor(message: string = 'Rate limit exceeded', response?: unknown) {
    super(message, 429, response);
    this.name = 'RateLimitError';
  }
}

export class AuthError extends MarketplaceError {
  constructor(message: string = 'Authentication failed', response?: unknown) {
    super(message, 401, response);
    this.name = 'AuthError';
  }
}
