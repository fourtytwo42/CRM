import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const body = await req.json().catch(() => null) as {
    title?: string;
    description?: string;
    priority?: 'low'|'normal'|'high'|'urgent';
    due_date?: string|null;
    campaign_id?: number|null;
    customer_id?: number|null;
  };
  const title = String(body?.title || '').trim();
  if (!title) return jsonError('VALIDATION', { status: 400, message: 'Title required' });
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (title, description, status, priority, due_date, created_at, created_by_user_id, assigned_to_user_id, campaign_id, customer_id)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    title,
    body?.description || null,
    body?.priority || 'normal',
    body?.due_date || null,
    now,
    me.id,
    Number(params.id),
    body?.campaign_id ?? null,
    body?.customer_id ?? null
  );
  return jsonOk();
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


