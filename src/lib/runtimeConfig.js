/**
 * Resolve public browser configuration.
 *
 * A container writes window.__APP_CONFIG__ when it starts, which lets one
 * immutable image move between environments. Vite variables remain as the
 * local-development and backwards-compatible build-time fallback.
 */
export function resolveSupabaseConfig(
  runtimeConfig = globalThis.__APP_CONFIG__,
  buildConfig = import.meta.env
) {
  const supabaseUrl = runtimeConfig?.SUPABASE_URL || buildConfig?.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    runtimeConfig?.SUPABASE_ANON_KEY || buildConfig?.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase configuration: set APP_SUPABASE_URL and APP_SUPABASE_ANON_KEY at runtime, or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time'
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}
