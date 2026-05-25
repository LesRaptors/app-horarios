import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components';

interface Props {
  orgName: string;
  planName?: string;
  amountCop?: number;
  invoicePdfUrl?: string | null;
}

const LOGO = 'https://www.tushorarios.com/icono-transparente.png';

const formatCop = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

export default function BillingPaymentConfirmedEmail({ orgName, planName, amountCop, invoicePdfUrl }: Props) {
  return (
    <Html lang="es-CO">
      <Head />
      <Preview>Pago confirmado — Tus Horarios</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img src={LOGO} alt="Tus Horarios" width="40" height="40" />
            <Text style={brand}>Tus Horarios</Text>
          </Section>
          <Section style={content}>
            <Heading style={h1}>Recibimos tu pago. Gracias.</Heading>
            <Text style={p}>Hola, {orgName}.</Text>
            <Text style={p}>
              Recibimos tu pago correctamente. Tu suscripción está activa.
            </Text>
            {(planName || amountCop !== undefined) && (
              <Section style={detailBox}>
                {planName && (
                  <Text style={detailRow}>
                    <strong>Plan:</strong> {planName}
                  </Text>
                )}
                {amountCop !== undefined && (
                  <Text style={detailRow}>
                    <strong>Monto:</strong> {formatCop(amountCop)}
                  </Text>
                )}
              </Section>
            )}
            {invoicePdfUrl && (
              <Button style={button} href={invoicePdfUrl}>Descargar factura</Button>
            )}
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
const detailBox = { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px 20px', margin: '0 0 20px' };
const detailRow = { fontSize: '15px', lineHeight: '1.5', color: '#020817', margin: '0 0 8px' };
const button = { backgroundColor: '#2563EB', color: '#FFFFFF', textDecoration: 'none', fontSize: '16px', fontWeight: 600, padding: '14px 32px', borderRadius: '8px', display: 'inline-block', marginTop: '8px' };
const footer = { padding: '24px 40px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' };
const footerText = { fontSize: '13px', color: '#64748B', margin: 0, textAlign: 'center' as const };
