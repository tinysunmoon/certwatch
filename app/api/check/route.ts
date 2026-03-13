import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCertExpiry } from '@/lib/cert';
import { ALERT_THRESHOLDS, sendAlertEmail } from '@/lib/email';

export async function POST() {
  const { data: domains, error } = await supabase.from('domains').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const domain of domains ?? []) {
    const cert = await getCertExpiry(domain.domain);
    if (!cert) {
      results.push({ domain: domain.domain, status: 'error' });
      continue;
    }

    const { expiryDate, daysRemaining } = cert;

    await supabase.from('domains').update({
      expiry_date: expiryDate.toISOString().split('T')[0],
      days_remaining: daysRemaining,
      last_checked: new Date().toISOString(),
    }).eq('id', domain.id);

    // Send alert only at exact thresholds (avoids daily spam)
    if (ALERT_THRESHOLDS.includes(daysRemaining)) {
      await sendAlertEmail(domain.domain, expiryDate.toISOString().split('T')[0], daysRemaining, domain.alert_email);
    }

    results.push({ domain: domain.domain, daysRemaining, status: 'ok' });
  }

  return NextResponse.json({ checked: results.length, results });
}

// For Vercel Cron
export async function GET() {
  return POST();
}
