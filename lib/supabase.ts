import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Domain = {
  id: string;
  domain: string;
  expiry_date: string | null;
  days_remaining: number | null;
  last_checked: string | null;
  created_at: string;
};
