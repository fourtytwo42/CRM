import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { getImapPollerStatus, ensureImapPollerRunning } from '../../poller';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  console.log('[SSE] GET request received');
  
  try {
    // SSE can't send auth headers, so accept token via query param
    const token = req.nextUrl.searchParams.get('token');
    console.log('[SSE] Token from query param:', token ? 'present' : 'missing');
    
    if (!token) {
      console.log('[SSE] No token provided, returning 403');
      return new Response('missing token', { status: 403 });
    }
    
    // Verify the token directly instead of using requireAdmin
    try {
      console.log('[SSE] Verifying token...');
      console.log('[SSE] Token length:', token.length);
      console.log('[SSE] Token preview:', token.substring(0, 20) + '...');
      
      const { verifyAccessToken } = await import('@/lib/auth');
      const claims = await verifyAccessToken(token);
      console.log('[SSE] Token verification result:', claims ? 'valid' : 'invalid');
      if (claims) {
        console.log('[SSE] Claims:', { sub: claims.sub, iat: claims.iat, exp: claims.exp });
      }
      
      if (!claims || !claims.sub) {
        console.log('[SSE] Invalid token claims, returning 403');
        return new Response('invalid token', { status: 403 });
      }
      
      // Check if user is admin
      console.log('[SSE] Checking user role for ID:', claims.sub);
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const user = db.prepare('SELECT role FROM users WHERE id = ?').get(Number(claims.sub)) as { role?: string } | undefined;
      console.log('[SSE] User role check result:', user?.role);
      
      if (!user || user.role !== 'admin') {
        console.log('[SSE] User not admin, returning 403');
        return new Response('not admin', { status: 403 });
      }
      
      console.log('[SSE] Authentication successful, user is admin');
    } catch (error) {
      console.log('[SSE] Auth error:', error);
      console.log('[SSE] Auth error details:', (error as any)?.message, (error as any)?.stack);
      return new Response('auth failed', { status: 403 });
    }
  } catch (error) {
    console.log('[SSE] General error:', error);
    return new Response('forbidden', { status: 403 });
  }

  console.log('[SSE] Starting IMAP poller...');
  try { 
    ensureImapPollerRunning(); 
    console.log('[SSE] IMAP poller ensured running');
  } catch (error) {
    console.log('[SSE] Error ensuring IMAP poller:', error);
  }

  // Test the getImapPollerStatus function
  try {
    console.log('[SSE] Testing getImapPollerStatus...');
    const testStatus = getImapPollerStatus();
    console.log('[SSE] Test status result:', testStatus);
  } catch (error) {
    console.log('[SSE] Error testing getImapPollerStatus:', error);
  }

  console.log('[SSE] Creating ReadableStream...');
  const stream = new ReadableStream({
    start(controller) {
      console.log('[SSE] Stream started, setting up...');
      
      const encoder = new TextEncoder();
      const send = (data: any) => {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        console.log('[SSE] Sending data:', data);
        controller.enqueue(encoder.encode(payload));
      };

      // Initial payload
      try {
        console.log('[SSE] Getting initial poller status...');
        const status = getImapPollerStatus();
        console.log('[SSE] Initial status:', status);
        send({ ok: true, poller: { intervalSec: status.intervalSec, remainingSec: status.remainingSec } });
      } catch (error) {
        console.log('[SSE] Error getting initial status:', error);
        // Send fallback data if status fails
        send({ ok: true, poller: { intervalSec: 60, remainingSec: 60 } });
      }

      // Tick every second with server-derived remaining time
      console.log('[SSE] Setting up interval timer...');
      const tickId = setInterval(() => {
        try {
          const status = getImapPollerStatus();
          send({ ok: true, poller: { intervalSec: status.intervalSec, remainingSec: status.remainingSec } });
        } catch (error) {
          console.log('[SSE] Error in interval tick:', error);
          // Send fallback data if status fails
          send({ ok: true, poller: { intervalSec: 60, remainingSec: 60 } });
        }
      }, 1000);

      // On close, cleanup
      const close = () => {
        console.log('[SSE] Stream closing, cleaning up...');
        clearInterval(tickId);
        try { controller.close(); } catch (error) {
          console.log('[SSE] Error closing controller:', error);
        }
      };

      // Handle client abort
      try {
        // @ts-ignore
        req.signal?.addEventListener('abort', close);
        console.log('[SSE] Abort listener attached');
      } catch (error) {
        console.log('[SSE] Error attaching abort listener:', error);
      }
      
      console.log('[SSE] Stream setup complete');
    },
    cancel() {
      console.log('[SSE] Stream cancelled');
    },
  });

  console.log('[SSE] Returning stream response');
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
    },
  });
}


