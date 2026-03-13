import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCertExpiry } from '@/lib/cert';
import { ALERT_THRESHOLDS, sendAlertEmail } from '@/lib/email';

const MAX_RETRIES = 2;

async function fetchWithRetry(domain: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const cert = await getCertExpiry(domain);
    if (cert) return cert;
  }
  return null;
}

export async function POST() {
  const { data: domains, error } = await supabase.from('domains').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const domain of domains ?? []) {
    const cert = await fetchWithRetry(domain.domain);

    if (!cert) {
      // Keep existing expiry data, just record the error
      await supabase.from('domains').update({
        last_checked: new Date().toISOString(),
        check_error: 'Could not reach domain — TLS check failed',
      }).eq('id', domain.id);
      results.push({ domain: domain.domain, status: 'error' });
      continue;
    }

    const { expiryDate, daysRemaining } = cert;

    await supabase.from('domains').update({
      expiry_date: expiryDate.toISOString().split('T')[0],
      days_remaining: daysRemaining,
      last_checked: new Date().toISOString(),
      check_error: null,
    }).eq('id', domain.id);

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
