import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('store_settings')
      .select('value')
      .eq('key', 'maintenance_countdown_minutes')
      .single();

    // Value is stored as JSONB — could be a JSON-encoded string like "30" or a number
    let raw: unknown = data?.value;
    if (typeof raw === 'string') raw = raw.replace(/"/g, '');
    const minutes = raw != null ? parseInt(String(raw), 10) : 30;

    return NextResponse.json({
      countdownMinutes: isNaN(minutes) ? 30 : Math.max(1, minutes),
    });
  } catch {
    return NextResponse.json({ countdownMinutes: 30 });
  }
}
