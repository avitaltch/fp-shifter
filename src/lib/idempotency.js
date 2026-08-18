/** Generate a cryptographically random UUID v4 for a mutation attempt. */
export function createIdempotencyKey(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') {
    return cryptoImpl.randomUUID();
  }
  if (typeof cryptoImpl?.getRandomValues !== 'function') {
    throw new Error('Secure random UUID generation is unavailable');
  }

  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

/** Reuse a key only while the exact mutation payload remains unchanged. */
export function idempotencyAttempt(previousAttempt, payload, createKey) {
  const fingerprint = JSON.stringify(payload);
  if (previousAttempt?.fingerprint === fingerprint) return previousAttempt;
  return {
    fingerprint,
    idempotencyKey: (createKey || createIdempotencyKey)(),
  };
}
