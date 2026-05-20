import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resend, FROM_NOREPLY, FROM_HOLA } from '@/lib/resend';
import { demoRequestSchema } from '@/lib/landing/schema';
import { checkRateLimit } from '@/lib/landing/rate-limit';
import DemoRequestConfirmationEmail from '@/emails/demo-request-confirmation';
import DemoRequestNotificationEmail from '@/emails/demo-request-notification';

export const runtime = 'nodejs';

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds ?? 3600) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Honeypot — si el campo `website` está lleno, fingimos éxito (sin alertar al bot).
  if (parsed.data.website && parsed.data.website.length > 0) {
    console.warn('[demo-requests] honeypot triggered from', ip);
    return NextResponse.json({ ok: true });
  }

  const { nombre, email, empresa, telefono, sector, mensaje } = parsed.data;
  const userAgent = request.headers.get('user-agent') ?? null;

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('demo_requests')
    .insert({
      nombre,
      email,
      empresa,
      telefono,
      sector,
      mensaje: mensaje || null,
      ip_address: (ip === 'unknown' ? null : ip) as unknown,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('[demo-requests] insert failed', error);
    return NextResponse.json({ error: 'No pudimos guardar tu solicitud. Intenta de nuevo.' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  const results = await Promise.allSettled([
    resend.emails.send({
      from: `Tus Horarios <${FROM_NOREPLY}>`,
      to: email,
      replyTo: FROM_HOLA,
      subject: 'Recibimos tu solicitud de demo de Tus Horarios',
      react: DemoRequestConfirmationEmail({ nombre, empresa }),
    }),
    resend.emails.send({
      from: `Tus Horarios <${FROM_HOLA}>`,
      to: ['suv411@hotmail.com', FROM_HOLA],
      replyTo: email,
      subject: `Nueva solicitud de demo — ${empresa}`,
      react: DemoRequestNotificationEmail({
        id: row.id,
        nombre, email, empresa, telefono, sector, mensaje,
        supabaseUrl,
      }),
    }),
  ]);

  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      console.error(`[demo-requests] email ${idx === 0 ? 'confirmation' : 'notification'} failed`, r.reason);
    }
  });

  return NextResponse.json({ ok: true, id: row.id });
}
