// Maps RPC/API error codes (raised in supabase/functions.sql and lib/api.js)
// to Hebrew user-facing messages.
const MESSAGES = {
  SLOT_TAKEN: 'השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.',
  SLOT_IN_PAST: 'לא ניתן לקבוע תור בזמן שכבר עבר.',
  INVALID_NAME: 'נא להזין שם פרטי ושם משפחה.',
  INVALID_PHONE: 'מספר הטלפון אינו תקין.',
  INVALID_EMAIL: 'כתובת האימייל אינה תקינה.',
  NO_SERVICES: 'יש לבחור לפחות שירות אחד.',
  UNKNOWN_SERVICE: 'אחד השירותים שנבחרו אינו זמין עוד. יש לרענן את הדף.',
  SHIFT_TAKEN: 'המשמרת כבר שובצה לעובד אחר.',
  SHIFT_NOT_YOURS: 'המשמרת אינה משויכת אליך.',
  FORBIDDEN: 'אין לך הרשאה לבצע פעולה זו.',
  'Invalid login credentials': 'אימייל או סיסמה שגויים.',
};

export function friendlyError(err, fallback = 'אירעה שגיאה. יש לנסות שוב.') {
  const raw = err?.message || '';
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return message;
  }
  return fallback;
}
