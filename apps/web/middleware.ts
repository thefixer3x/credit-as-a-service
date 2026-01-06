import { NextRequest, NextResponse } from 'next/server';

// Microfrontends middleware
// Note: runMicrofrontendsMiddleware requires @vercel/microfrontends to be
// properly configured with withMicrofrontends in next.config
// For now, using a simple pass-through middleware until full setup is complete

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Add any custom middleware logic here
  // Once microfrontends is fully configured, replace with:
  // import { runMicrofrontendsMiddleware } from '@vercel/microfrontends/next/middleware';
  // const response = await runMicrofrontendsMiddleware(request);
  // if (response) return response;

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
