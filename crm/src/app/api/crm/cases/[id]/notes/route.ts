import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(()=>null) as { body?: string } | null;
  const text = String(body?.body || '').trim(); if (!text) return jsonError('VALIDATION', { status: 400 });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO notes (body, created_at, created_by_user_id, agent_user_id, customer_id, campaign_id, case_id) VALUES (?, ?, ?, ?, NULL, NULL, ?)`)
    .run(text, now, me.id, me.id, Number(params.id));
  return jsonOk();
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


