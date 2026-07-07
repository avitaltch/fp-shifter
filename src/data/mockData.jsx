export const customers = [
  { id: 'c1', first_name: 'נועה', last_name: 'לוי', phone: '050-1234567' },
  { id: 'c2', first_name: 'יעל', last_name: 'כהן', phone: '054-7654321' },
];

export const users = [
  { id: 'u1', first_name: 'דני', last_name: 'מזרחי', role: 'Employee', title: 'מעצב שיער בכיר' },
  { id: 'u2', first_name: 'רונית', last_name: 'גבאי', role: 'Employee', title: 'מתלמדת שיער ולק ג\'ל' },
  { id: 'u3', first_name: 'שי', last_name: 'אדרי', role: 'Employee', title: 'אחראי שיזוף ומניקור' },
  { id: 'u4', first_name: 'אביטל', last_name: 'מנהלת', role: 'Admin', title: 'מנהלת סלון' },
];

export const serviceTypes = [
  { id: 's1', name: 'תספורת', base_price: 150 },
  { id: 's2', name: 'צבע וגוונים', base_price: 350 },
  { id: 's3', name: 'לק ג\'ל', base_price: 120 },
  { id: 's4', name: 'מיטת שיזוף', base_price: 80 },
];

export const employeeSkills = [
  // דני - מעצב שיער בכיר (מהיר)
  { id: 'es1', user_id: 'u1', service_type_id: 's1', duration_minutes: 30 },
  { id: 'es2', user_id: 'u1', service_type_id: 's2', duration_minutes: 90 },
  // רונית - מתלמדת (איטית יותר)
  { id: 'es3', user_id: 'u2', service_type_id: 's1', duration_minutes: 60 },
  { id: 'es4', user_id: 'u2', service_type_id: 's2', duration_minutes: 180 },
  { id: 'es5', user_id: 'u2', service_type_id: 's3', duration_minutes: 60 },
  // שי - ניילס ושיזוף
  { id: 'es6', user_id: 'u3', service_type_id: 's3', duration_minutes: 45 },
  { id: 'es7', user_id: 'u3', service_type_id: 's4', duration_minutes: 20 },
];

export const appointments = [
  { id: 'a1', customer_id: 'c1', visit_date: '2023-10-15', total_price: 550, status: 'Confirmed' },
];

export const appointmentItems = [
  // תור משורשר לנועה לוי: צבע (אצל דני) -> לק ג'ל (אצל שי) -> שיזוף (אצל שי)
  { id: 'ai1', appointment_id: 'a1', service_type_id: 's2', user_id: 'u1', start_time: '10:00', end_time: '11:30', status: 'Scheduled' }, // 90 mins (דני)
  { id: 'ai2', appointment_id: 'a1', service_type_id: 's3', user_id: 'u3', start_time: '11:30', end_time: '12:15', status: 'Scheduled' }, // 45 mins (שי)
  { id: 'ai3', appointment_id: 'a1', service_type_id: 's4', user_id: 'u3', start_time: '12:15', end_time: '12:35', status: 'Scheduled' }, // 20 mins (שי)
];

export const availabilities = [
  { id: 'av1', user_id: 'u1', available_date: '2023-10-15', start_time: '08:00', end_time: '16:00' },
  { id: 'av2', user_id: 'u2', available_date: '2023-10-15', start_time: '10:00', end_time: '18:00' },
  { id: 'av3', user_id: 'u3', available_date: '2023-10-15', start_time: '10:00', end_time: '18:00' },
];
