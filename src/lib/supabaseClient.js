import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.warn('Warning: NEXT_PUBLIC_SUPABASE_URL is not defined in environment variables.');
}

// Client-side public client (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side admin client (uses service role key to bypass RLS for scraping updates)
export const supabaseAdmin = createClient(
  supabaseUrl, 
  supabaseServiceKey || supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);
