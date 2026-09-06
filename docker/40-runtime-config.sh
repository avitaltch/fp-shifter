#!/bin/sh
set -eu

: "${APP_API_URL:?APP_API_URL is required}"

# Values are emitted into JavaScript, so only accept a simple HTTP(S) base URL.
if ! printf '%s' "$APP_API_URL" | grep -Eq '^https?://[A-Za-z0-9._:/-]+$'; then
  echo "APP_API_URL must be an HTTP(S) base URL without query parameters" >&2
  exit 1
fi

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = Object.freeze({
  API_URL: "$APP_API_URL"
});
EOF
