import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components';

interface Props {
  orgName: string;
  planName?: string;
  daysUntilEnd: number;
  paymentUrl: string;
}

const LOGO = 'https://www.tushorarios.com/icono-transparente.png';

export default function BillingTrialEndingEmail({ orgName, planName, daysUntilEnd, paymentUrl }: Props) {
  return (
    <Html lang="es-CO">
      <Head />
      <Preview>{`Tu período de prueba vence en ${daysUntilEnd} días — Tus Horarios`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img src={LOGO} alt="Tus Horarios" width="40" height="40" />
            <Text style={brand}>Tus Horarios</Text>
          </Section>
          <Section style={content}>
            <Heading style={h1}>Tu período de prueba vence pronto</Heading>
            <Text style={p}>Hola, {orgName}.</Text>
            <Text style={p}>
              Tu período de prueba{planName ? ` del plan ${planName}` : ''} vence en <strong>{daysUntilEnd} {daysUntilEnd === 1 ? 'día' : 'días'}</strong>. Agrega un método de pago para seguir usando Tus Horarios sin interrupciones.
            </Text>
            <Text style={p}>
              Si no agregas un método de pago antes de que venza el período de prueba, tu acceso quedará suspendido.
            </Text>
            <Button style={button} href={paymentUrl}>Agregar método de pago</Button>
          </Section>
          <Section style={footer}>
            <Text style={footerText}>Tus Horarios — Programación de turnos para empresas en Colombia.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#F1F5F9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };
const container = { maxWidth: '600px', margin: '40px auto', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' };
const header = { padding: '32px 40px 24px', borderBottom: '1px solid #E2E8F0' };
const brand = { fontSize: '20px', fontWeight: 700, color: '#020817', display: 'inline-block', marginLeft: '10px', verticalAlign: 'middle' };
const content = { padding: '32px 40px' };
const h1 = { fontSize: '24px', fontWeight: 700, color: '#020817', margin: '0 0 16px' };
const p = { fontSize: '16px', lineHeight: '1.6', color: '#020817', margin: '0 0 16px' };
const button = { backgroundColor: '#2563EB', color: '#FFFFFF', textDecoration: 'none', fontSize: '16px', fontWeight: 600, padding: '14px 32px', borderRadius: '8px', display: 'inline-block', marginTop: '8px' };
const footer = { padding: '24px 40px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' };
const footerText = { fontSize: '13px', color: '#64748B', margin: 0, textAlign: 'center' as const };
