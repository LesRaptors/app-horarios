import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_NOREPLY = process.env.RESEND_FROM_NOREPLY ?? 'noreply@tushorarios.com';
export const FROM_HOLA = process.env.RESEND_FROM_HOLA ?? 'hola@tushorarios.com';
export const FROM_NOTIF = process.env.RESEND_FROM_NOTIF ?? 'notificaciones@tushorarios.com';
