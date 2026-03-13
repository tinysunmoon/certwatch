import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCertExpiry } from '@/lib/cert';
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

  // If manual expiry provided, use it; otherwise auto-fetch from cert
  let expiryDate: string | null = manualExpiry ?? null;
  let daysRemaining: number | null = null;
  let lastChecked: string | null = null;

  if (expiryDate) {
    const expiry = new Date(expiryDate);
    daysRemaining = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    lastChecked = new Date().toISOString();
  } else {
    const cert = await getCertExpiry(domain);
    if (cert) {
      expiryDate = cert.expiryDate.toISOString().split('T')[0];
      daysRemaining = cert.daysRemaining;
      lastChecked = new Date().toISOString();
    }
  }

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
