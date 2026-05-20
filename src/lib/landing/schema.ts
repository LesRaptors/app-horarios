// src/lib/landing/schema.ts
import { z } from 'zod';

export const demoRequestSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  email: z.string().trim().email('Email inválido').max(254, 'Email demasiado largo'),
  empresa: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  telefono: z.string().trim().min(7, 'Teléfono inválido').max(30, 'Teléfono demasiado largo'),
  sector: z.enum(['salud', 'retail', 'hoteleria', 'vigilancia', 'otro']),
  mensaje: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional().or(z.literal('')),
  // Honeypot: campo oculto que humanos no llenan; bots sí. Debe llegar vacío.
  website: z.string().max(0, 'spam detected').optional().or(z.literal('')),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
