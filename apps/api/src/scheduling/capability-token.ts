const CAPABILITY_VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function readBearerCapability(
  authorization: string | undefined,
  prefix: 'sm' | 'wo',
): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  const expectedPrefix = `${prefix}_`;
  if (!token.startsWith(expectedPrefix)) return null;
  return CAPABILITY_VALUE_PATTERN.test(token.slice(expectedPrefix.length))
    ? token
    : null;
}
