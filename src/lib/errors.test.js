import { describe, it, expect } from 'vitest';
import { friendlyError } from './errors';

// Every code raised by supabase/functions.sql or lib/api must map to Hebrew.
const CASES = [
  ['SLOT_TAKEN', 'השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.'],
  ['SLOT_IN_PAST', 'לא ניתן לקבוע תור בזמן שכבר עבר.'],
  ['INVALID_NAME', 'נא להזין שם פרטי ושם משפחה.'],
  ['INVALID_PHONE', 'מספר הטלפון אינו תקין.'],
  ['INVALID_EMAIL', 'כתובת האימייל אינה תקינה.'],
  ['NO_SERVICES', 'יש לבחור לפחות שירות אחד.'],
  ['UNKNOWN_SERVICE', 'אחד השירותים שנבחרו אינו זמין עוד. יש לרענן את הדף.'],
  ['SHIFT_TAKEN', 'המשמרת כבר שובצה לעובד אחר.'],
  ['SHIFT_NOT_YOURS', 'המשמרת אינה משויכת אליך.'],
  ['SHIFT_CONFLICT', 'יש לך כבר שיבוץ חופף באותו הזמן.'],
  ['NOT_QUALIFIED', 'המשמרת דורשת מיומנות שאינה משויכת אליך.'],
  ['NOT_AVAILABLE', 'אין לך חלון זמינות שמכסה את המשמרת הזו.'],
  ['PAST_MIDNIGHT', 'השילוב שנבחר חורג מעבר לחצות. יש לבחור שעה מוקדמת יותר.'],
  ['APPOINTMENT_NOT_FOUND', 'התור לא נמצא או שכבר בוטל.'],
  ['USER_NOT_FOUND', 'המשתמש לא נמצא במערכת.'],
  ['CANNOT_CHANGE_OWN_ROLE', 'לא ניתן לשנות את התפקיד של עצמך.'],
  ['FORBIDDEN_COLUMNS', 'אין הרשאה לעדכן שדות אלו.'],
  ['FORBIDDEN', 'אין לך הרשאה לבצע פעולה זו.'],
  ['Invalid login credentials', 'אימייל או סיסמה שגויים.'],
];

describe('friendlyError', () => {
  it.each(CASES)('maps %s to its Hebrew message', (code, hebrew) => {
    expect(friendlyError(new Error(code))).toBe(hebrew);
  });

  it('matches a code embedded in a longer Postgres error message', () => {
    expect(friendlyError(new Error('P0001: SLOT_TAKEN'))).toBe(
      'השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.'
    );
  });

  it('returns the provided fallback for unknown errors', () => {
    expect(friendlyError(new Error('weird'), 'נפילה מותאמת.')).toBe('נפילה מותאמת.');
  });

  it('returns the default fallback when none is provided', () => {
    expect(friendlyError(new Error('weird'))).toBe('אירעה שגיאה. יש לנסות שוב.');
  });

  it('tolerates a missing / empty message', () => {
    expect(friendlyError({})).toBe('אירעה שגיאה. יש לנסות שוב.');
    expect(friendlyError(null)).toBe('אירעה שגיאה. יש לנסות שוב.');
  });
});
