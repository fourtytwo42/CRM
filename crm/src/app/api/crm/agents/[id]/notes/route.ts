import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { body?: string };
  const text = String(body?.body || '').trim();
  if (!text) return jsonError('VALIDATION', { status: 400, message: 'Body required' });
  const db = getDb();
  db.prepare('INSERT INTO notes (body, created_at, created_by_user_id, agent_user_id) VALUES (?, ?, ?, ?)')
    .run(text, new Date().toISOString(), me.id, Number(params.id));
  return jsonOk();
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }

