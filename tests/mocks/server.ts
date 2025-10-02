import { setupServer } from 'msw/node';
import { authHandlers } from './handlers/auth';
import { creditHandlers } from './handlers/credit';
import { paymentHandlers } from './handlers/payment';
import { externalHandlers } from './handlers/external';
import { notificationHandlers } from './handlers/notification';

// Configure MSW server with all handlers
export const server = setupServer(
  ...authHandlers,
  ...creditHandlers,
  ...paymentHandlers,
  ...notificationHandlers,
  ...externalHandlers
);

// Export server events for debugging
if (process.env.NODE_ENV === 'test' && process.env.DEBUG_MSW) {
  server.events.on('request:start', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url);
  });

  server.events.on('request:match', ({ request }) => {
    console.log('MSW matched:', request.method, request.url);
  });

  server.events.on('request:unhandled', ({ request }) => {
    console.warn('MSW unhandled:', request.method, request.url);
  });
}