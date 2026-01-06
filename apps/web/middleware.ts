import { createMicrofrontendsMiddleware } from '@vercel/microfrontends/next/middleware';

export default createMicrofrontendsMiddleware();

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
