import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCertExpiry } from '@/lib/cert';

export async function GET() {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { domain } = await req.json();
  if (!domain) return NextResponse.json({ error: 'Domain is required' }, { status: 400 });

  const cert = await getCertExpiry(domain);

  const { data, error } = await supabase.from('domains').insert({
    domain,
    expiry_date: cert?.expiryDate.toISOString().split('T')[0] ?? null,
    days_remaining: cert?.daysRemaining ?? null,
    last_checked: cert ? new Date().toISOString() : null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
