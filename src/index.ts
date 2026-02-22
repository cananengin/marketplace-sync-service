import Fastify from 'fastify';
import { registerMockRoutes } from './api/mock-routes';
import { registerStoreRoutes } from './api/store-routes';
import { registerWebhookRoutes } from './api/webhook-routes';
import { registerErrorHandler } from './api/error-handler';

async function buildApp() {
  const fastify = Fastify({
    logger: true,
  });

  // Register error handler first
  await fastify.register(registerErrorHandler);

  // Register routes
  await fastify.register(registerMockRoutes);
  await fastify.register(registerStoreRoutes);
  await fastify.register(registerWebhookRoutes);

  return fastify;
}

async function start() {
  try {
    const app = await buildApp();
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  start();
}

export { buildApp, start };
