import { NextRequest, NextResponse } from 'next/server';

// Twilio will request this URL on answer; respond with <Hangup/>
export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET(_req: NextRequest) {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}


