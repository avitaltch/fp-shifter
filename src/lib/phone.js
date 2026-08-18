const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/** Normalize an Israeli local or already-international phone number to E.164. */
export function toIsraeliE164(value) {
  const compact = String(value || '').replace(/[\s().-]/g, '');
  let normalized = compact;
  if (compact.startsWith('00')) normalized = `+${compact.slice(2)}`;
  else if (compact.startsWith('0')) normalized = `+972${compact.slice(1)}`;

  return E164_PATTERN.test(normalized) ? normalized : null;
}
