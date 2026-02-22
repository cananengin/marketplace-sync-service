import { CallbackOutbox, CallbackOutboxStatus } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import { generateUuidV7 } from '../infrastructure/database/uuid-v7';

export class CallbackOutboxRepository {
  private prisma = getPrismaClient();

  async createOutboxEvent(data: {
    organizationId: string;
    storeId: string;
    event: string;
    data: Record<string, unknown>;
  }): Promise<CallbackOutbox> {
    const id = generateUuidV7();
    const now = new Date();
    const timestamp = now.toISOString();
    const payload = {
      eventId: id,
      event: data.event,
      timestamp,
      organizationId: data.organizationId,
      storeId: data.storeId,
      data: data.data,
    };
    return this.prisma.callbackOutbox.create({
      data: {
        id,
        organizationId: data.organizationId,
        storeId: data.storeId,
        event: data.event,
        payload: payload as object,
        status: CallbackOutboxStatus.pending,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async findById(id: string): Promise<CallbackOutbox | null> {
    return this.prisma.callbackOutbox.findUnique({
      where: { id },
    });
  }

  async getProcessableOutboxBatch(limit: number): Promise<CallbackOutbox[]> {
    const now = new Date();
    return this.prisma.callbackOutbox.findMany({
      where: {
        status: CallbackOutboxStatus.pending,
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markSuccess(id: string): Promise<CallbackOutbox> {
    return this.prisma.callbackOutbox.update({
      where: { id },
      data: {
        status: CallbackOutboxStatus.success,
        updatedAt: new Date(),
      },
    });
  }

  async markRetry(
    id: string,
    attempt: number,
    nextRetryAt: Date,
    lastError: string
  ): Promise<CallbackOutbox> {
    return this.prisma.callbackOutbox.update({
      where: { id },
      data: {
        attempt,
        nextRetryAt,
        lastError,
        updatedAt: new Date(),
      },
    });
  }

  async markFailed(id: string, lastError: string): Promise<CallbackOutbox> {
    return this.prisma.callbackOutbox.update({
      where: { id },
      data: {
        status: CallbackOutboxStatus.failed,
        lastError,
        updatedAt: new Date(),
      },
    });
  }
}
