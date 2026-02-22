import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RateLimitError, AuthError, MarketplaceError } from '../infrastructure/errors';

export async function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler(async (error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    // Handle custom marketplace errors
    if (error instanceof RateLimitError) {
      return reply.code(429).send({
        error: 'rate_limited',
        message: error.message,
      });
    }

    if (error instanceof AuthError) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: error.message,
      });
    }

    if (error instanceof MarketplaceError) {
      return reply.code(error.statusCode).send({
        error: 'marketplace_error',
        message: error.message,
      });
    }

    // Handle validation errors (Zod)
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: 'validation_error',
        message: error.message,
      });
    }

    // Default error handler
    fastify.log.error(error);
    return reply.code(500).send({
      error: 'internal_server_error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  });
}
