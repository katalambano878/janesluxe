import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readStockPeriods, salesTotals, soldByProduct } from '@/lib/stock-periods';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Accra is UTC+0 all year, so a calendar day is a plain UTC range. */
function dayStart(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function dayAfter(day: string): string {
  const next = new Date(dayStart(day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/**
 * Everything sold in a range, product by product.
 * ?period=current (default) | all | <closed period id>, or ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const params = request.nextUrl.searchParams;
  const periods = await readStockPeriods();
  const fromDay = params.get('from') || '';
  const toDay = params.get('to') || '';
  const period = params.get('period') || 'current';

  let from: string | null = null;
  let to: string | null = null;
  let selected = period;

  if (fromDay || toDay) {
    if ((fromDay && !DAY.test(fromDay)) || (toDay && !DAY.test(toDay))) {
      return NextResponse.json({ error: 'Choose valid dates.' }, { status: 400 });
    }
    if (fromDay && toDay && fromDay > toDay) {
      return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
    }
    from = fromDay ? dayStart(fromDay) : null;
    to = toDay ? dayAfter(toDay) : null;
    selected = 'custom';
  } else if (period === 'all') {
    selected = 'all';
  } else if (period === 'current') {
    from = periods.currentStart;
  } else {
    const closed = periods.history.find((p) => p.id === period);
    if (!closed) return NextResponse.json({ error: 'That stock period was not found.' }, { status: 404 });
    from = closed.start;
    to = closed.end;
  }

  const [totals, products] = await Promise.all([salesTotals(from, to), soldByProduct(from, to)]);

  return NextResponse.json({
    selected,
    range: { from, to },
    totals,
    products,
    currentStart: periods.currentStart,
    history: [...periods.history].reverse(),
  });
}