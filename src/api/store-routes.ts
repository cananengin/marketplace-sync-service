import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { StoreService } from '../services/store-service';
import { OrderService } from '../services/order-service';
import { SyncStatusService } from '../services/sync-status-service';

// Validation schemas
const registerStoreSchema = z.object({
  organizationId: z.string().min(1),
  marketplace: z.enum(['etsy', 'shopify', 'amazon']),
  externalStoreId: z.string().min(1),
  storeName: z.string().min(1),
  accessToken: z.string().min(1),
  currency: z.string().length(3),
});

const importOrderSchema = z.object({
  syncToken: z.string().uuid(),
  receipt: z.string().min(1),
});

const syncStatusQuerySchema = z.object({
  syncToken: z.string().uuid(),
});

export async function registerStoreRoutes(fastify: FastifyInstance) {
  const storeService = new StoreService();
  const orderService = new OrderService();
  const syncStatusService = new SyncStatusService();

  // POST /stores/register
  fastify.post<{
    Body: z.infer<typeof registerStoreSchema>;
  }>('/stores/register', async (request: FastifyRequest<{
    Body: z.infer<typeof registerStoreSchema>;
  }>, reply: FastifyReply) => {
    try {
      // Validate request body
      const validatedData = registerStoreSchema.parse(request.body);

      const result = await storeService.registerStore(validatedData);

      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors,
        });
      }
      throw error;
    }
  });

  // POST /orders/import
  fastify.post<{
    Body: z.infer<typeof importOrderSchema>;
  }>('/orders/import', async (request: FastifyRequest<{
    Body: z.infer<typeof importOrderSchema>;
  }>, reply: FastifyReply) => {
    try {
      // Validate request body
      const validatedData = importOrderSchema.parse(request.body);

      const result = await orderService.importOrder(validatedData);

      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors,
        });
      }
      if (error instanceof Error && error.message === 'Store not found') {
        return reply.code(404).send({
          error: 'Store not found',
        });
      }
      throw error;
    }
  });

  // GET /stores/sync-status
  fastify.get<{
    Querystring: z.infer<typeof syncStatusQuerySchema>;
  }>('/stores/sync-status', async (request: FastifyRequest<{
    Querystring: z.infer<typeof syncStatusQuerySchema>;
  }>, reply: FastifyReply) => {
    try {
      // Validate query parameters
      const validatedQuery = syncStatusQuerySchema.parse(request.query);

      const result = await syncStatusService.getSyncStatusByToken(validatedQuery.syncToken);

      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors,
        });
      }
      if (error instanceof Error && error.message === 'Store not found') {
        return reply.code(404).send({
          error: 'Store not found',
        });
      }
      throw error;
    }
  });
}
