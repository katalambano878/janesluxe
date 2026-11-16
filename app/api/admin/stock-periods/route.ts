import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readStockPeriods, salesTotals, writeStockPeriods } from '@/lib/stock-periods';

export const dynamic = 'force-dynamic';

async function payload(role: string) {
  const periods = await readStockPeriods();
  const current = await salesTotals(periods.currentStart, null);
  return {
    currentStart: periods.currentStart,
    current,
    history: [...periods.history].reverse(),
    canManage: role === 'admin',
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const role = gate.auth.role ?? 'staff';
  return NextResponse.json(await payload(role));
}

/** Close the current period and start a new one from now. Owner only. */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const user = gate.auth.user;
  const role = gate.auth.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only the store owner can start a new stock period.' }, { status: 403 });
  }
  const member = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.email || 'Admin',
    role,
  };

  const periods = await readStockPeriods();
  const end = new Date().toISOString();
  const totals = await salesTotals(periods.currentStart, end);
  const closed = {
    id: randomUUID(),
    start: periods.currentStart,
    end,
    revenue: totals.revenue,
    orders: totals.orders,
    itemsSold: totals.itemsSold,
    closedBy: member.name,
  };
  await writeStockPeriods({ currentStart: end, history: [...periods.history, closed] });

  return NextResponse.json({
    ...(await payload(role)),
    message: 'New stock period started. The last period is saved under Past stock periods.',
  });
}

/** Undo the latest "start new period": the last closed period becomes the current one again. Owner only. */
export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const role = gate.auth.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only the store owner can change stock periods.' }, { status: 403 });
  }

  const periods = await readStockPeriods();
  const last = periods.history[periods.history.length - 1];
  if (!last) return NextResponse.json({ error: 'There is no past stock period to reopen.' }, { status: 400 });

  await writeStockPeriods({ currentStart: last.start, history: periods.history.slice(0, -1) });

  return NextResponse.json({
    ...(await payload(role)),
    message: 'The last stock period is open again. Its sales are back in the current figures.',
  });
}