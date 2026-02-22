import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { WebhookEndpointRepository } from '../repositories/webhook-endpoint-repository';
const webhookEventEnum = z.enum(['sync.started', 'sync.completed', 'sync.failed']);

const registerWebhookSchema = z.object({
  organizationId: z.string().min(1),
  event: webhookEventEnum,
  targetUrl: z
    .string()
    .min(1)
    .refine(
      (url) => {
        try {
          const u = new URL(url);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'targetUrl must be a valid http or https URL' }
    ),
});

const listWebhooksQuerySchema = z.object({
  organizationId: z.string().min(1),
});

export async function registerWebhookRoutes(fastify: FastifyInstance) {
  const webhookRepo = new WebhookEndpointRepository();

  fastify.post<{
    Body: z.infer<typeof registerWebhookSchema>;
  }>('/webhooks/register', async (request: FastifyRequest<{
    Body: z.infer<typeof registerWebhookSchema>;
  }>, reply: FastifyReply) => {
    try {
      const validated = registerWebhookSchema.parse(request.body);
      const endpoint = await webhookRepo.upsertEndpoint({
        organizationId: validated.organizationId,
        event: validated.event,
        targetUrl: validated.targetUrl,
      });
      return reply.code(200).send({
        id: endpoint.id,
        organizationId: endpoint.organizationId,
        event: endpoint.event,
        targetUrl: endpoint.targetUrl,
        isActive: endpoint.isActive,
      });
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

  fastify.get<{
    Querystring: z.infer<typeof listWebhooksQuerySchema>;
  }>('/webhooks', async (request: FastifyRequest<{
    Querystring: z.infer<typeof listWebhooksQuerySchema>;
  }>, reply: FastifyReply) => {
    try {
      const validated = listWebhooksQuerySchema.parse(request.query);
      const endpoints = await webhookRepo.listByOrganization(validated.organizationId);
      return reply.code(200).send(
        endpoints.map((ep) => ({
          id: ep.id,
          organizationId: ep.organizationId,
          event: ep.event,
          targetUrl: ep.targetUrl,
          isActive: ep.isActive,
        }))
      );
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
}
