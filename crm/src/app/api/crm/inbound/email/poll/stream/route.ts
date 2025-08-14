import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { getImapPollerStatus, ensureImapPollerRunning } from '../../poller';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // SSE can't send auth headers, so accept token via query param
    const token = req.nextUrl.searchParams.get('token');
    if (token) {
      // Create a mock request with the auth header for requireAdmin
      const mockReq = {
        ...req,
        headers: new Headers(req.headers),
      };
      mockReq.headers.set('authorization', `Bearer ${token}`);
      await requireAdmin(mockReq as NextRequest);
    } else {
      await requireAdmin(req);
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


