import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from '@react-email/components';

interface Props {
  id: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string;
  sector: string;
  mensaje?: string;
  supabaseUrl: string;
}

export default function DemoRequestNotificationEmail({ id, nombre, email, empresa, telefono, sector, mensaje, supabaseUrl }: Props) {
  const editorUrl = `${supabaseUrl}/project/ugkvuinkynvtuiutwlkd/editor/demo_requests?filter=id::uuid::eq.${id}`;

  return (
    <Html lang="es-CO">
      <Head />
      <Preview>Nueva solicitud de demo — {empresa}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>Nueva solicitud de demo</Heading>
          <Section style={card}>
            <Row label="Empresa" value={empresa} />
            <Row label="Nombre" value={nombre} />
            <Row label="Email" value={email} />
            <Row label="Teléfono" value={telefono} />
            <Row label="Sector" value={sector} />
            {mensaje ? (
              <>
                <Hr style={hr} />
                <Text style={label}>Mensaje:</Text>
                <Text style={p}>{mensaje}</Text>
              </>
            ) : null}
          </Section>
          <Section style={{ marginTop: '24px' }}>
            <Link href={editorUrl} style={linkBtn}>→ Abrir en Supabase</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ marginBottom: '8px' }}>
      <Text style={labelInline}>{label}: </Text>
      <Text style={valueInline}>{value}</Text>
    </Section>
  );
}

const body = { backgroundColor: '#F1F5F9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: '20px' };
const container = { maxWidth: '600px', margin: '20px auto', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '32px' };
const h1 = { fontSize: '20px', fontWeight: 700, color: '#020817', margin: '0 0 24px' };
const card = { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px' };
const label = { fontSize: '13px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 4px' };
const labelInline = { fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'inline' };
const valueInline = { fontSize: '14px', color: '#020817', display: 'inline' };
const p = { fontSize: '14px', lineHeight: '1.6', color: '#020817', margin: '0', whiteSpace: 'pre-wrap' as const };
const hr = { border: 'none', borderTop: '1px solid #E2E8F0', margin: '16px 0' };
const linkBtn = { color: '#2563EB', fontSize: '14px', fontWeight: 600, textDecoration: 'none' };
