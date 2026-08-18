import { describe, expect, it } from 'vitest';
import { toIsraeliE164 } from './phone';

describe('toIsraeliE164', () => {
  it.each([
    ['050-1234567', '+972501234567'],
    ['050 123 4567', '+972501234567'],
    ['+972501234567', '+972501234567'],
    ['00972501234567', '+972501234567'],
  ])('normalizes %s', (input, expected) => {
    expect(toIsraeliE164(input)).toBe(expected);
  });

  it.each(['', '1234567', '+0123456789', 'not-a-phone'])('rejects %s', (input) => {
    expect(toIsraeliE164(input)).toBeNull();
  });
});
