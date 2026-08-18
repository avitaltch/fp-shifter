import { Injectable } from '@nestjs/common';
import type {
  ClaimedNotificationJob,
  RenderedNotification,
} from './notification.types';

@Injectable()
export class NotificationRendererService {
  render(job: ClaimedNotificationJob): RenderedNotification {
    const visitTime = formatVisitTime(
      job.payload.appointmentStartsAt,
      job.payload.timezone,
    );
    const serviceNames = job.payload.services
      .map((service) => service.serviceName)
      .join(', ');
    const greeting = `${job.payload.customerFirstName},`;

    switch (job.kind) {
      case 'BookingConfirmation':
        return {
          subject: `התור שלך ב-${job.payload.businessName} אושר`,
          body: `${greeting} התור שלך ל-${serviceNames} נקבע ל-${visitTime}.`,
        };
      case 'Reminder7d':
        return reminder('תזכורת לשבוע הבא', greeting, serviceNames, visitTime);
      case 'Reminder24h':
        return reminder('תזכורת לתור מחר', greeting, serviceNames, visitTime);
      case 'Reminder1h':
        return reminder('התור שלך בעוד שעה', greeting, serviceNames, visitTime);
      case 'CustomerCancellation':
        return {
          subject: `התור שלך ב-${job.payload.businessName} בוטל`,
          body: `${greeting} התור ל-${serviceNames} שהיה מתוכנן ל-${visitTime} בוטל.`,
        };
      case 'ManagerCompoundVisit':
        return {
          subject: 'נקבע תור עם מעבר בין נותני שירות',
          body: `נקבע תור ל-${job.payload.customerFirstName} ב-${visitTime}: ${handoffPlan(job)}.`,
        };
      case 'ManagerCancellation':
        return {
          subject: 'תור בוטל ונפתח זמן ביומן',
          body: `התור של ${job.payload.customerFirstName} ל-${serviceNames} ב-${visitTime} בוטל.`,
        };
      case 'WaitlistAvailability':
        return {
          subject: 'התפנה זמן לתור שביקשת',
          body: `${greeting} התפנה זמן ל-${serviceNames} ב-${visitTime}.${job.payload.actionPath ? ` לאישור: ${job.payload.actionPath}` : ''}`,
        };
      case 'WaitlistAccepted':
        return {
          subject: 'התור מרשימת ההמתנה אושר',
          body: `${greeting} התור ל-${serviceNames} ב-${visitTime} אושר.`,
        };
      case 'ManagerReassignment':
        return {
          subject: 'שיבוץ נותן שירות השתנה',
          body: `השיבוץ לתור של ${job.payload.customerFirstName} ב-${visitTime} השתנה.`,
        };
    }
  }
}

function reminder(
  subject: string,
  greeting: string,
  services: string,
  visitTime: string,
): RenderedNotification {
  return {
    subject,
    body: `${greeting} מזכירים לך את התור ל-${services} ב-${visitTime}.`,
  };
}

function handoffPlan(job: ClaimedNotificationJob): string {
  return job.payload.services
    .map((service) => {
      const time = new Intl.DateTimeFormat('he-IL', {
        timeZone: job.payload.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(service.startsAt));
      return `${time} ${service.serviceName}${
        service.providerName ? ` — ${service.providerName}` : ''
      }`;
    })
    .join('; ');
}

function formatVisitTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: timezone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(instant));
}
