#!/bin/sh
set -eu

: "${APP_SUPABASE_URL:?APP_SUPABASE_URL is required}"
: "${APP_SUPABASE_ANON_KEY:?APP_SUPABASE_ANON_KEY is required}"

# Values are emitted into JavaScript, so accept only the character sets used by
# HTTP(S) base URLs and Supabase publishable/JWT keys.
if ! printf '%s' "$APP_SUPABASE_URL" | grep -Eq '^https?://[A-Za-z0-9._:/-]+$'; then
  echo "APP_SUPABASE_URL must be an HTTP(S) base URL without query parameters" >&2
  exit 1
fi

if ! printf '%s' "$APP_SUPABASE_ANON_KEY" | grep -Eq '^[A-Za-z0-9._-]+$'; then
  echo "APP_SUPABASE_ANON_KEY contains unsupported characters" >&2
  exit 1
fi

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = Object.freeze({
  SUPABASE_URL: "$APP_SUPABASE_URL",
  SUPABASE_ANON_KEY: "$APP_SUPABASE_ANON_KEY"
});
EOF
