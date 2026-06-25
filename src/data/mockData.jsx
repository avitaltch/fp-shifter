import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';

export const dashboardStats = [
  { label: 'עובדים במשמרת היום', value: 12, icon: <Users />, type: '' },
  { label: 'משמרות חסרות', value: 2, icon: <AlertCircle />, type: 'danger' },
  { label: 'משמרות מאוישות', value: 34, icon: <CheckCircle2 />, type: 'success' },
];

export const upcomingShifts = [
  { id: 1, role: 'מלצר אחראי', time: '16:00 - 00:00', status: 'missing', employee: 'חסר עובד' },
  { id: 2, role: 'ברמן', time: '18:00 - 02:00', status: 'staffed', employee: 'דניאל כהן' },
  { id: 3, role: 'מארחת', time: '19:00 - 23:00', status: 'staffed', employee: 'נועה לוי' },
];

export const weeklySchedule = {
  'ראשון': [
    { id: 1, role: 'בוקר', time: '08:00 - 16:00', employee: 'דנה ר.' },
    { id: 2, role: 'ערב', time: '16:00 - 00:00', employee: 'אבי כ.' },
  ],
  'שני': [
    { id: 3, role: 'בוקר', time: '08:00 - 16:00', employee: 'רועי ל.' },
    { id: 4, role: 'ערב', time: '16:00 - 00:00', employee: 'פנוי', missing: true },
  ],
  'שלישי': [
    { id: 5, role: 'בוקר', time: '08:00 - 16:00', employee: 'שירה א.' },
  ],
};

export const scheduleDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
