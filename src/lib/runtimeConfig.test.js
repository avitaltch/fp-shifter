import { describe, expect, it } from 'vitest';
import { resolveSupabaseConfig } from './runtimeConfig';

describe('resolveSupabaseConfig', () => {
  it('prefers runtime configuration so one image can target different instances', () => {
    expect(
      resolveSupabaseConfig(
        {
          SUPABASE_URL: 'https://self-hosted.example.com',
          SUPABASE_ANON_KEY: 'runtime-key',
        },
        {
          VITE_SUPABASE_URL: 'https://managed.example.com',
          VITE_SUPABASE_ANON_KEY: 'build-key',
        }
      )
    ).toEqual({
      supabaseUrl: 'https://self-hosted.example.com',
      supabaseAnonKey: 'runtime-key',
    });
  });

  it('falls back to Vite build variables for local development', () => {
    expect(
      resolveSupabaseConfig(undefined, {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: 'local-key',
      })
    ).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'local-key',
    });
  });

  it('fails fast when neither configuration source is complete', () => {
    expect(() => resolveSupabaseConfig({}, {})).toThrow('Missing Supabase configuration');
  });
});
