import { WebhookEndpoint } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import { generateUuidV7 } from '../infrastructure/database/uuid-v7';

const WEBHOOK_EVENTS = ['sync.started', 'sync.completed', 'sync.failed'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(s: string): s is WebhookEventType {
  return WEBHOOK_EVENTS.includes(s as WebhookEventType);
}

export class WebhookEndpointRepository {
  private prisma = getPrismaClient();

  async listActiveByOrgAndEvent(
    organizationId: string,
    event: string
  ): Promise<WebhookEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        event,
        isActive: true,
      },
    });
  }

  async upsertEndpoint(data: {
    organizationId: string;
    event: string;
    targetUrl: string;
  }): Promise<WebhookEndpoint> {
    const id = generateUuidV7();
    const now = new Date();
    return this.prisma.webhookEndpoint.upsert({
      where: {
        organizationId_event_targetUrl: {
          organizationId: data.organizationId,
          event: data.event,
          targetUrl: data.targetUrl,
        },
      },
      create: {
        id,
        organizationId: data.organizationId,
        event: data.event,
        targetUrl: data.targetUrl,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        targetUrl: data.targetUrl,
        isActive: true,
        updatedAt: now,
      },
    });
  }

  async listByOrganization(organizationId: string): Promise<WebhookEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: [{ event: 'asc' }, { targetUrl: 'asc' }],
    });
  }
}
