"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ConceptDef {
  id: string;
  title: string;
  body: string;
}

const CONCEPTS: ConceptDef[] = [
  {
    id: "salary",
    title: "Salario base",
    body: `Es el valor pactado en tu contrato de trabajo. En Colombia se calcula sobre 30 días al mes, independientemente de que el mes tenga 28, 29, 30 o 31 días. Sobre el salario base se calculan todos los aportes a seguridad social y prestaciones sociales. El salario mínimo mensual legal vigente (SMMLV) para 2026 es $1.423.500.`,
  },
  {
    id: "transport",
    title: "Auxilio de transporte",
    body: `Es un beneficio legal obligatorio para empleados cuyo salario no supere dos salarios mínimos (2 SMMLV). Para 2026 el valor es $249.095 al mes. El auxilio se incluye en el devengado pero NO se tiene en cuenta para calcular prestaciones sociales como cesantías, prima o vacaciones. Tampoco hace parte de la base para aportes a salud y pensión.`,
  },
  {
    id: "surcharge_night",
    title: "Recargo nocturno",
    body: `Aplica cuando trabajas en horario nocturno, es decir entre las 9:00 PM (21:00) y las 6:00 AM. La ley colombiana (Art. 168 del Código Sustantivo del Trabajo) establece un recargo del 35% sobre el valor de la hora ordinaria. Por ejemplo, si tu hora ordinaria vale $10.000, la hora nocturna vale $13.500.`,
  },
  {
    id: "surcharge_sunday",
    title: "Recargo dominical",
    body: `Trabajar en domingo da derecho a un recargo del 75% sobre el valor de la hora ordinaria. Si además trabajas en horario nocturno ese domingo, los porcentajes se acumulan. El empleado también puede acordar un día de descanso compensatorio en lugar del recargo económico, según lo establece el Código Sustantivo del Trabajo.`,
  },
  {
    id: "surcharge_holiday",
    title: "Recargo festivo",
    body: `Los días festivos reconocidos en Colombia (regulados por la Ley 51 de 1983 y otras normas) tienen el mismo tratamiento que los domingos: recargo del 75% sobre la hora ordinaria. Los festivos colombianos incluyen Año Nuevo, Reyes, Día del Trabajo, Ascensión, Corpus Christi, Sagrado Corazón, San Pedro y San Pablo, Independencia, Batalla de Boyacá, Asunción, Día de la Raza, Todos los Santos, Independencia de Cartagena, Inmaculada Concepción, Navidad y Semana Santa.`,
  },
  {
    id: "overtime_day",
    title: "Hora extra diurna",
    body: `Son las horas trabajadas por encima de la jornada ordinaria (máximo 8 horas diarias o 46 semanales según la jornada reducida gradual de la Ley 2101 de 2021) en el horario diurno (6:00 AM a 9:00 PM). El recargo es del 25% sobre el valor de la hora ordinaria. Ejemplo: si la hora vale $10.000, la extra diurna vale $12.500.`,
  },
  {
    id: "overtime_night",
    title: "Hora extra nocturna",
    body: `Horas adicionales trabajadas por encima de la jornada ordinaria en el horario nocturno (9:00 PM a 6:00 AM). El recargo es del 75% sobre el valor de la hora ordinaria. Son las horas extra mejor pagadas. Ejemplo: si la hora vale $10.000, la extra nocturna vale $17.500.`,
  },
  {
    id: "health_employee",
    title: "Aporte a salud — empleado (4%)",
    body: `Cotización obligatoria al sistema de salud (EPS). El empleado aporta el 4% sobre el Ingreso Base de Cotización (IBC), que en general es el salario. El empleador aporta el 8% adicional. Con estos aportes tienes derecho a atención médica, hospitalaria y a tus beneficiarios afiliados como beneficiarios del sistema de salud.`,
  },
  {
    id: "pension_employee",
    title: "Aporte a pensión — empleado (4%)",
    body: `Cotización obligatoria al fondo de pensiones (AFP o Colpensiones). El empleado aporta el 4% y el empleador aporta el 12%. El total (16%) se acumula en tu cuenta individual de pensión (en fondos privados) o en el régimen de prima media (Colpensiones). Con el tiempo, este ahorro financia tu pensión de vejez, invalidez o sobrevivencia.`,
  },
  {
    id: "solidarity_pension",
    title: "Solidaridad pensional",
    body: `Aplica para empleados que ganan más de 4 SMMLV. Es un aporte adicional del 1% al Fondo de Solidaridad Pensional, destinado a subsidiar pensiones de personas con bajos ingresos. Para salarios superiores a 16 SMMLV, el aporte adicional puede llegar hasta el 2%. Este descuento no lo compensa el empleador.`,
  },
  {
    id: "income_tax",
    title: "Retención en la fuente",
    body: `Si tus ingresos laborales superan cierto umbral mensual (determinado por la tabla de retención en la fuente vigente), la empresa debe retener un anticipo del impuesto de renta. Se descuenta directamente de la nómina. Los meses donde no llegas al umbral no hay retención. Los valores retenidos se descuentan de tu declaración de renta anual o te son devueltos si pagaste en exceso.`,
  },
  {
    id: "vacation_pay",
    title: "Pago de vacaciones",
    body: `Cada año de trabajo acumulas 15 días hábiles de vacaciones remuneradas. Cuando las tomas, recibes el equivalente al salario que ganarías esos días. Este pago sustituye tu salario durante el período de vacaciones. Si llevas menos de un año, tienes derecho proporcional (por ejemplo, 6 meses = 7,5 días).`,
  },
  {
    id: "prima",
    title: "Prima de servicios",
    body: `Prestación social equivalente a 15 días de salario por cada semestre trabajado. Se paga dos veces al año: en junio (por el primer semestre) y en diciembre (por el segundo semestre). Si llevas menos de un semestre, recibes la parte proporcional. La empresa provisiona una parte cada mes para tener el dinero disponible cuando corresponda pagarla.`,
  },
  {
    id: "cesantias_interest",
    title: "Intereses sobre cesantías",
    body: `Cada año en febrero, la empresa debe pagarte el 12% anual sobre el saldo de cesantías acumulado en el año inmediatamente anterior. Es un rendimiento mínimo legal sobre tus cesantías. Se paga directamente a ti, no al fondo de cesantías. Por ejemplo, si tienes $1.200.000 en cesantías, los intereses serían $144.000 anuales.`,
  },
  {
    id: "cesantias",
    title: "Cesantías",
    body: `Un mes de salario por cada año trabajado, calculado sobre el último salario devengado. La empresa los provisiona mes a mes y los consigna a tu fondo de cesantías elegido a más tardar el 14 de febrero de cada año. Puedes retirarlos anticipadamente para: compra, construcción o mejora de vivienda propia; pago de estudios del empleado o sus hijos; o cuando termina el contrato de trabajo.`,
  },
  {
    id: "embargo",
    title: "Embargo judicial",
    body: `Es un descuento ordenado por un juez, que retiene parte de tu salario para pagar una deuda reconocida judicialmente. La ley protege tu salario: solo puede embargarse lo que supere el salario mínimo, excepto en casos de obligaciones alimentarias donde el embargo puede ser mayor. El empleador está obligado a cumplir la orden judicial.`,
  },
  {
    id: "libranza",
    title: "Libranza",
    body: `Es un descuento autorizado por ti para pagar un crédito directamente de tu nómina. Lo autorizas voluntariamente al tomar un crédito con una entidad financiera o cooperativa. La empresa descuenta la cuota del crédito antes de depositarte el saldo. Es una forma de crédito de nómina muy usada en Colombia.`,
  },
  {
    id: "voluntary_pension",
    title: "Pensión voluntaria",
    body: `Aporte adicional que decides hacer voluntariamente a tu fondo de pensiones o a una AFP, por encima del aporte obligatorio. Tiene beneficios tributarios: bajo ciertas condiciones, estos aportes no se cuentan como ingreso gravable, reduciendo tu base para retención en la fuente. Tienen periodo mínimo de permanencia para conservar el beneficio.`,
  },
  {
    id: "afc",
    title: "Cuenta AFC (Ahorro para el Fomento a la Construcción)",
    body: `Es una cuenta de ahorro especial en entidades financieras autorizadas, destinada a la compra o construcción de vivienda. Los aportes que hagas a una cuenta AFC no se cuentan como ingreso laboral para efectos de retención en la fuente, hasta ciertos límites. Si retiras el dinero para fines diferentes a vivienda antes de 10 años, debes pagar el impuesto que no retuvieron.`,
  },
];

const FAQS = [
  {
    id: "faq-salud-pension",
    question: "¿Por qué me descuentan 4% de salud y 4% de pensión?",
    answer: `Son aportes obligatorios al sistema de seguridad social colombiano, establecidos en la Ley 100 de 1993. El 4% de salud va a tu EPS para financiar tu atención médica y la de tus beneficiarios. El 4% de pensión va a tu fondo de pensiones y se acumula para financiar tu pensión de vejez. El empleador aporta adicionalmente el 8% de salud y el 12% de pensión por ti, sin que eso salga de tu bolsillo.`,
  },
  {
    id: "faq-cesantias",
    question: "¿Qué son las cesantías y cuándo me las pagan?",
    answer: `Las cesantías son una prestación social equivalente a un mes de salario por año trabajado. La empresa las provisiona mes a mes y las consigna a tu fondo de cesantías (el que tú elijas: Porvenir, Protección, Old Mutual, etc.) a más tardar el 14 de febrero de cada año. No te las pagan en efectivo directamente, quedan en el fondo. Puedes retirarlas anticipadamente solo para vivienda o educación; o recibes el total cuando termina tu contrato.`,
  },
  {
    id: "faq-prima",
    question: "¿Qué es la prima y cuándo me la pagan?",
    answer: `La prima de servicios es un derecho de todos los trabajadores colombianos. Equivale a 15 días de salario por semestre trabajado. Se paga dos veces al año: entre el 15 y el 30 de junio (prima del primer semestre) y entre el 15 y el 20 de diciembre (prima del segundo semestre). Si llevas menos de un semestre, recibes la parte proporcional. La empresa la provisiona mes a mes.`,
  },
  {
    id: "faq-vacaciones",
    question: "¿Cuándo me pagan vacaciones?",
    answer: `Acumulas 15 días hábiles de vacaciones por cada año de trabajo. Puedes tomarlas una vez cumplido el año, aunque puedes acordar con tu empleador tomarlas proporcionalmente antes. Cuando las tomas, recibes un pago equivalente al salario de esos días, que sustituye el sueldo normal durante ese período. Las vacaciones no prescriben antes de un año después de causadas. Por ley, puedes acumular hasta dos períodos.`,
  },
  {
    id: "faq-recargo-nocturno",
    question: "¿Por qué a veces sale recargo nocturno y otras veces no?",
    answer: `El recargo nocturno del 35% aplica únicamente cuando tu turno cae entre las 9:00 PM y las 6:00 AM. Si trabajas en horario diurno (6:00 AM a 9:00 PM) no hay recargo. Si tu turno cruza el horario nocturno, el recargo aplica solo sobre las horas dentro de ese rango, no sobre todo el turno. En la plataforma, las plantillas de turno tienen marcada la bandera "nocturno" cuando cruzan ese horario.`,
  },
  {
    id: "faq-auxilio-transporte",
    question: "¿Qué es el auxilio de transporte y por qué lo recibo (o no)?",
    answer: `El auxilio de transporte (para 2026: $249.095/mes) es un beneficio legal para empleados que devengan hasta 2 SMMLV ($2.847.000 para 2026). Si tu salario supera ese límite, no tienes derecho al auxilio aunque te desplaces al trabajo. Si lo recibes, aparece sumado a tu devengado, pero no hace parte del salario para el cálculo de prestaciones sociales ni aportes a seguridad social.`,
  },
  {
    id: "faq-solidaridad",
    question: "¿Qué es solidaridad pensional?",
    answer: `Es un aporte adicional al Fondo de Solidaridad Pensional, creado por la Ley 100 de 1993. Aplica si ganas más de 4 SMMLV y es del 1% adicional. Si ganas más de 16 SMMLV, el aporte puede llegar hasta el 2%. El dinero va a un fondo que subsidia pensiones de personas de bajos recursos o desempleados que no alcanzan a cotizar. No lo paga el empleador; sale directamente de tu nómina.`,
  },
  {
    id: "faq-retencion",
    question: "¿Por qué este mes me retuvieron y el anterior no?",
    answer: `La retención en la fuente depende de tu ingreso laboral mensual. Hay una tabla de retención que establece a partir de qué monto aplica el descuento y en qué porcentaje. Los meses donde tienes ingresos adicionales (horas extra, recargos, bonificaciones), tu ingreso total puede superar el umbral y generar retención. Los meses "normales" puede que no llegues al umbral. También influye si tienes deducciones especiales (dependientes, aportes AFC, pensión voluntaria) que reducen la base gravable.`,
  },
  {
    id: "faq-arl",
    question: "¿Qué es ARL? ¿Por qué la paga la empresa?",
    answer: `La ARL (Administradora de Riesgos Laborales) cubre accidentes de trabajo y enfermedades profesionales. El aporte lo paga íntegramente el empleador — no sale de tu salario. El porcentaje varía según el nivel de riesgo de la actividad (Clase I al V). Con la ARL, si sufres un accidente laboral o una enfermedad por tu trabajo, tienes derecho a atención médica, incapacidad pagada y pensión de invalidez laboral si el caso lo amerita.`,
  },
  {
    id: "faq-hora-extra",
    question: "¿Cómo se calcula la hora extra?",
    answer: `Primero calculas el valor de tu hora ordinaria: salario mensual ÷ 240 horas (30 días × 8 horas). Luego aplicas el recargo según el tipo: hora extra diurna = hora ordinaria × 1.25; hora extra nocturna = hora ordinaria × 1.75. Ejemplo con salario de $1.500.000: hora ordinaria = $6.250. Extra diurna = $7.813. Extra nocturna = $10.938. Recuerda que hay un límite legal de horas extra semanales (máximo 2 diarias y 12 semanales según la Ley 2101 de 2021).`,
  },
  {
    id: "faq-parafiscales",
    question: "¿Qué son los parafiscales y quién los paga?",
    answer: `Los parafiscales son aportes que paga el empleador (no tú) sobre la nómina: 4% a la Caja de Compensación Familiar (subsidio de vivienda, recreación, salud, educación para ti y tu familia), 2% al SENA (formación técnica), y 3% al ICBF (protección a la infancia). En total el 9% de la nómina que paga la empresa. Con la reforma tributaria de 2012 (Ley 1607), los empleadores con empleados que ganan menos de 10 SMMLV tienen exenciones parciales. Tú no los ves en tu colilla porque no se descuentan de tu salario.`,
  },
  {
    id: "faq-beneficios-caja",
    question: "¿Qué beneficios tengo con la Caja de Compensación?",
    answer: `Tu empresa afilia a todos los empleados a una Caja de Compensación Familiar (Compensar, Colsubsidio, Cafam, Comfamiliar, etc.). Tienes derecho a subsidio familiar si tienes hijos o personas a cargo que cumplen los requisitos, acceso a recreación (hoteles, parques, piscinas), educación no formal, crédito de vivienda social y servicios de salud complementaria. Los beneficios varían según la Caja. Consulta con tu empleador cuál es la Caja asignada.`,
  },
];

export default function GlosarioPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/mi-pago">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Glosario de nómina</h1>
          <p className="text-sm text-muted-foreground">
            Explicación de conceptos y preguntas frecuentes
          </p>
        </div>
      </div>

      {/* Concepts */}
      <section>
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Conceptos</h2>
        <div className="space-y-8">
          {CONCEPTS.map((c) => (
            <section key={c.id} id={c.id} className="scroll-mt-20">
              <h3 className="text-base font-semibold mb-1">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {c.body}
              </p>
            </section>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">
          Preguntas frecuentes
        </h2>
        <Accordion type="multiple" className="w-full">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger className="text-sm font-medium text-left">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground border-t pt-4">
        Información de referencia basada en la legislación laboral colombiana
        vigente. Para situaciones específicas consulta con tu empleador o un
        asesor laboral.
      </p>
    </div>
  );
}
