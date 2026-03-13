import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'tinysunmoon@gmail.com';

// Thresholds in days — alert if days_remaining is AT OR BELOW any threshold
// and hasn't been alerted at that tier yet (handled by caller for daily cron)
export const ALERT_THRESHOLDS = [30, 14, 7];

export function shouldAlert(daysRemaining: number): boolean {
  // Alert if exactly at a threshold (daily cron avoids spam)
  // OR below the lowest threshold (catches domains already critical when added)
  return ALERT_THRESHOLDS.includes(daysRemaining) || daysRemaining < ALERT_THRESHOLDS[ALERT_THRESHOLDS.length - 1];
}

export async function sendAlertEmail(domain: string, expiryDate: string, daysRemaining: number, recipientEmail?: string | null) {
  const urgency = daysRemaining <= 0 ? '🚨 EXPIRED' : daysRemaining <= 7 ? '🔴 Critical' : '⚠️ Warning';
  const expiry = new Date(expiryDate);

  await resend.emails.send({
    from: 'CertWatch <onboarding@resend.dev>',
    to: recipientEmail || ALERT_EMAIL,
    subject: `${urgency}: SSL Certificate for ${domain} (${daysRemaining} days left)`,
    html: `
      <h2>SSL Certificate Expiry Alert</h2>
      <p>The SSL certificate for <strong>${domain}</strong> is expiring soon.</p>
      <ul>
        <li><strong>Domain:</strong> ${domain}</li>
        <li><strong>Expiry Date:</strong> ${expiry.toDateString()}</li>
        <li><strong>Days Remaining:</strong> ${daysRemaining}</li>
      </ul>
      <p>Please contact the responsible team to request certificate renewal before it expires.</p>
    `,
  });
}
