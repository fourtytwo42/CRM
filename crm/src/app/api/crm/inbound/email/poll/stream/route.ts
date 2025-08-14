import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { getImapPollerStatus, ensureImapPollerRunning } from '../../poller';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // SSE can't send auth headers, so accept token via query param
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return new Response('missing token', { status: 403 });
    }
    
    // Verify the token directly instead of using requireAdmin
    try {
      const { verifyAccessToken } = await import('@/lib/auth');
      const claims = await verifyAccessToken(token);
      if (!claims || !claims.sub) {
        return new Response('invalid token', { status: 403 });
      }
      
      // Check if user is admin
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const user = db.prepare('SELECT role FROM users WHERE id = ?').get(Number(claims.sub)) as { role?: string } | undefined;
      if (!user || user.role !== 'admin') {
        return new Response('not admin', { status: 403 });
      }
    } catch {
      return new Response('auth failed', { status: 403 });
    }
  } catch {
    return new Response('forbidden', { status: 403 });
  }

  try { ensureImapPollerRunning(); } catch {}

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: any) => {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      // Initial payload
      try {
        const status = getImapPollerStatus();
        send({ ok: true, poller: { intervalSec: status.intervalSec, remainingSec: status.remainingSec } });
      } catch {}

      // Tick every second with server-derived remaining time
      const tickId = setInterval(() => {
        try {
          const status = getImapPollerStatus();
          send({ ok: true, poller: { intervalSec: status.intervalSec, remainingSec: status.remainingSec } });
        } catch {}
      }, 1000);

      // On close, cleanup
      const close = () => {
        clearInterval(tickId);
        try { controller.close(); } catch {}
      };

      // Handle client abort
      // @ts-ignore
      req.signal?.addEventListener('abort', close);
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
    },
  });
}


