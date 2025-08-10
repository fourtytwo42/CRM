import { NextRequest, NextResponse } from 'next/server';

// Method guard for routes that only implement specific verbs: respond 405 for unsupported methods.
// Note: Next automatically 405s for missing handlers in App Router, but this provides explicit control
// and ensures Cache-Control is consistently set on API responses.

export function middleware(req: NextRequest) {
  // Allow all; per-route handlers determine support. This file is a placeholder in case
  // we opt into global API behaviors in the future (e.g., security headers).
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};


