import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './runtimeConfig';

const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Invite / recovery emails redirect here with tokens in the URL; the
    // client must pick them up so LoginPage can show "set password".
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
