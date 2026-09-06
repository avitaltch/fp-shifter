/**
 * Resolve public browser configuration.
 *
 * A container writes window.__APP_CONFIG__ when it starts, which lets one
 * immutable image move between environments. Vite variables remain as the
 * local-development and backwards-compatible build-time fallback.
 */
/** Resolve the self-hosted NestJS base URL. */
export function resolveApiConfig(
  runtimeConfig = globalThis.__APP_CONFIG__,
  buildConfig = import.meta.env
) {
  const configuredUrl = runtimeConfig?.API_URL || buildConfig?.VITE_API_URL;
  if (!configuredUrl) {
    throw new Error(
      'Missing API configuration: set APP_API_URL at runtime or VITE_API_URL at build time'
    );
  }

  let parsed;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error('Invalid API configuration: API_URL must be an absolute HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'Invalid API configuration: API_URL must be an absolute HTTP(S) URL without credentials, query, or fragment'
    );
  }

  return { apiBaseUrl: parsed.href.replace(/\/+$/, '') };
}
