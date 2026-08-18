const CAPABILITY_PATTERNS = {
  sm: /^sm_[A-Za-z0-9_-]{43}$/,
  wo: /^wo_[A-Za-z0-9_-]{43}$/,
};

export function readFragmentCapability(hash, prefix) {
  const token = new URLSearchParams(String(hash || '').replace(/^#/, '')).get(
    'token'
  );
  return token && CAPABILITY_PATTERNS[prefix]?.test(token) ? token : null;
}
