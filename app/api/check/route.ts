import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCertExpiry } from '@/lib/cert';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'tinysunmoon@gmail.com';
const ALERT_THRESHOLDS = [30, 14, 7];

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

    // Send alert email if at a threshold
    if (ALERT_THRESHOLDS.includes(daysRemaining)) {
      await resend.emails.send({
        from: 'CertWatch <onboarding@resend.dev>',
        to: ALERT_EMAIL,
        subject: `⚠️ SSL Certificate Expiring: ${domain.domain} (${daysRemaining} days left)`,
        html: `
          <h2>SSL Certificate Expiry Alert</h2>
          <p>The SSL certificate for <strong>${domain.domain}</strong> is expiring soon.</p>
          <ul>
            <li><strong>Domain:</strong> ${domain.domain}</li>
            <li><strong>Expiry Date:</strong> ${expiryDate.toDateString()}</li>
            <li><strong>Days Remaining:</strong> ${daysRemaining}</li>
          </ul>
          <p>Please contact the responsible team to request certificate renewal before it expires.</p>
        `,
      });
    }

    results.push({ domain: domain.domain, daysRemaining, status: 'ok' });
  }

  return NextResponse.json({ checked: results.length, results });
}

// For Vercel Cron
export async function GET() {
  return POST();
}
