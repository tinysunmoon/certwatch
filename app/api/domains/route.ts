import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { shouldAlert, sendAlertEmail } from '@/lib/email';

export async function GET() {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { domain, valid_from, expiry_date: manualExpiry, alert_email } = await req.json();
  if (!domain) return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
  if (!valid_from) return NextResponse.json({ error: 'Valid From date is required' }, { status: 400 });
  if (!manualExpiry) return NextResponse.json({ error: 'Expiry Date is required' }, { status: 400 });
  if (!alert_email) return NextResponse.json({ error: 'Alert Email is required' }, { status: 400 });

  // Duplicate detection
  const { data: existing } = await supabase.from('domains').select('id').eq('domain', domain.trim().toLowerCase()).single();
  if (existing) return NextResponse.json({ error: `${domain} is already being tracked` }, { status: 409 });

  const expiryDate: string = manualExpiry;
  const expiry = new Date(expiryDate);
  const daysRemaining = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const lastChecked = new Date().toISOString();

  const { data, error } = await supabase.from('domains').insert({
    domain,
    valid_from: valid_from ?? null,
    expiry_date: expiryDate,
    days_remaining: daysRemaining,
    last_checked: lastChecked,
    alert_email: alert_email ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Immediately alert if cert is already at or below a threshold
  if (expiryDate && daysRemaining !== null && shouldAlert(daysRemaining)) {
    await sendAlertEmail(domain, expiryDate, daysRemaining, alert_email);
  }

  return NextResponse.json(data);
}
