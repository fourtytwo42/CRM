import { NextRequest, NextResponse } from 'next/server';

type HttpHeaders = Record<string, string>;

const NO_STORE_HEADER: HttpHeaders = { 'Cache-Control': 'no-store' };

function mergeHeaders(base: HttpHeaders, extra?: HttpHeaders): HttpHeaders {
  return { ...(base || {}), ...(extra || {}) };
}

function maybeVaryAuth(headers: HttpHeaders, varyAuth?: boolean): HttpHeaders {
  if (!varyAuth) return headers;
  const current = headers['Vary'] || headers['vary'] || '';
  const parts = new Set(
    current
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  parts.add('Authorization');
  const value = Array.from(parts).join(', ');
  const out = { ...headers } as HttpHeaders;
  delete (out as any)['vary'];
  out['Vary'] = value;
  return out;
}

export function jsonOk<T>(data?: T, init?: { status?: number; headers?: HttpHeaders; varyAuth?: boolean }) {
  const headers = maybeVaryAuth(mergeHeaders(NO_STORE_HEADER, init?.headers), init?.varyAuth);
  return NextResponse.json({ ok: true, data }, { status: init?.status, headers });
}

export function jsonError(
  code: string,
  options?: { status?: number; message?: string; headers?: HttpHeaders; varyAuth?: boolean; details?: any }
) {
  const headers = maybeVaryAuth(mergeHeaders(NO_STORE_HEADER, options?.headers), options?.varyAuth);
  return NextResponse.json(
    { ok: false, error: { code, ...(options?.message ? { message: options.message } : {}), ...(options?.details ? { details: options.details } : {}) } },
    { status: options?.status || 400, headers }
  );
}

export function methodNotAllowed(allowed: Array<'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS'|'HEAD'>) {
  return jsonError('METHOD_NOT_ALLOWED', { status: 405, headers: { Allow: allowed.join(', ') } });
}

export const noStoreHeaders = NO_STORE_HEADER;

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  const ip = (forwarded.split(',')[0] || '').trim();
  return ip || 'unknown';
}


