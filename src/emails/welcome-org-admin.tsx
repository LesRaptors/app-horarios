import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface Props {
  firstName: string;
  orgName: string;
  trialEndsAt: string;
  setPasswordUrl: string;
}

const LOGO = "https://www.tushorarios.com/icono-transparente.png";

export default function WelcomeOrgAdminEmail({
  firstName,
  orgName,
  trialEndsAt,
  setPasswordUrl,
}: Props) {
  const trialDate = new Date(trialEndsAt).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <Html lang="es-CO">
      <Head />
      <Preview>Bienvenido a Tus Horarios — empezá tu trial de 30 días</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img src={LOGO} alt="Tus Horarios" width="40" height="40" />
            <Text style={brand}>Tus Horarios</Text>
          </Section>
          <Section style={content}>
            <Heading style={h1}>¡Bienvenido, {firstName}!</Heading>
            <Text style={p}>
              Acabamos de crear la cuenta de <strong>{orgName}</strong>. Tenés{" "}
              <strong>30 días gratis</strong> para configurar tu sistema de turnos.
            </Text>
            <Text style={p}>
              <strong>Tu trial termina:</strong> {trialDate}
            </Text>
            <Heading style={h2}>¿Qué hago ahora?</Heading>
            <Text style={p}>
              <strong>1.</strong> Hacé clic en el botón abajo para establecer tu contraseña.<br />
              <strong>2.</strong> Te guiaremos por un wizard de 6 pasos para configurar tu equipo.<br />
              <strong>3.</strong> En 10 minutos tendrás tu primer cuadro de turnos.
            </Text>
            <Button style={button} href={setPasswordUrl}>Establecer mi contraseña</Button>
            <Text style={small}>
              ¿Dudas? Respondé este correo o escribinos a hola@tushorarios.com. Estamos para ayudarte.
            </Text>
          </Section>
          <Section style={footer}>
            <Text style={footerText}>Tus Horarios — Programación de turnos para empresas en Colombia.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#F1F5F9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
const container = {
  maxWidth: "600px",
  margin: "40px auto",
  backgroundColor: "#FFFFFF",
  borderRadius: "12px",
  border: "1px solid #E2E8F0",
  overflow: "hidden" as const,
};
const header = { padding: "32px 40px 24px", borderBottom: "1px solid #E2E8F0" };
const brand = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#020817",
  display: "inline-block",
  marginLeft: "10px",
  verticalAlign: "middle" as const,
};
const content = { padding: "32px 40px" };
const h1 = { fontSize: "24px", fontWeight: 700, color: "#020817", margin: "0 0 16px" };
const h2 = { fontSize: "18px", fontWeight: 700, color: "#020817", margin: "24px 0 12px" };
const p = { fontSize: "16px", lineHeight: "1.6", color: "#020817", margin: "0 0 16px" };
const small = { fontSize: "14px", lineHeight: "1.5", color: "#475569", margin: "24px 0 0" };
const button = {
  backgroundColor: "#2563EB",
  color: "#FFFFFF",
  textDecoration: "none",
  fontSize: "16px",
  fontWeight: 600,
  padding: "14px 32px",
  borderRadius: "8px",
  display: "inline-block",
  marginTop: "8px",
};
const footer = { padding: "24px 40px", backgroundColor: "#F8FAFC", borderTop: "1px solid #E2E8F0" };
const footerText = {
  fontSize: "13px",
  color: "#64748B",
  margin: 0,
  textAlign: "center" as const,
};
