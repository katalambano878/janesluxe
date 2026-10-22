import { NextRequest, NextResponse } from 'next/server';
import { claimGuestOrders, getUserById, verifyAccessToken } from '@/lib/db/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const verified = await verifyAccessToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const user = await getUserById(verified.userId);
  if (!user?.email) {
    return NextResponse.json({ error: 'Account email missing' }, { status: 400 });
  }

  const claimed = await claimGuestOrders(user.id, user.email);
  return NextResponse.json({ claimed });
}
