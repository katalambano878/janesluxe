import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const user = gate.auth.user;
  const role = gate.auth.role;
  const admin = role === 'admin';

  const { rows } = await query(
    `SELECT id, user_id, staff_name, staff_email, amount::float AS amount, description, spent_on, created_at
       FROM staff_expenses
      WHERE ($1::boolean OR user_id = $2)
      ORDER BY spent_on DESC, created_at DESC
      LIMIT 300`,
    [admin, user.id]
  );
  return NextResponse.json({ expenses: rows, canSeeAll: admin });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const user = gate.auth.user;
  const member = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.email || 'Admin',
    role: gate.auth.role,
  };

  const body = await request.json().catch(() => ({}));
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 400) : '';
  const amount = Number(body.amount);
  const spentOn =
    typeof body.spentOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.spentOn)
      ? body.spentOn
      : new Date().toISOString().slice(0, 10);

  if (!description) return NextResponse.json({ error: 'Write what the money was used for.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: 'Enter the amount in cedis.' }, { status: 400 });
  }

  const { rows } = await query(
    `INSERT INTO staff_expenses (user_id, staff_name, staff_email, amount, description, spent_on)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [member.id, member.name, member.email, Math.round(amount * 100) / 100, description, spentOn]
  );
  return NextResponse.json({ id: rows[0]?.id, message: 'Expense recorded.' });
}