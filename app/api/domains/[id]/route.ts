import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('domains').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { valid_from, expiry_date, alert_email, renewal_requested, notes } = await req.json();

  const updates: Record<string, unknown> = {};
  if (valid_from !== undefined) updates.valid_from = valid_from || null;
  if (expiry_date !== undefined) {
    updates.expiry_date = expiry_date || null;
    if (expiry_date) {
      const expiry = new Date(expiry_date);
      updates.days_remaining = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }
  if (alert_email !== undefined) updates.alert_email = alert_email || null;
  if (renewal_requested !== undefined) updates.renewal_requested = renewal_requested;
  if (notes !== undefined) updates.notes = notes || null;

  const { data, error } = await supabase
    .from('domains')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
