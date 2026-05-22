-- Migration 045: RPC get_org_by_slug para resolver subdomain → org_id desde anon
--
-- ¿Qué hace?
--   RPC SECURITY DEFINER que mapea slug → {id, slug} de una org.
--   Callable por anon (porque el middleware corre sin sesión cuando un
--   visitor entra a un subdomain).
--
-- ¿Por qué?
--   RLS de organizations exige `authenticated` + (super_admin OR mi org).
--   El middleware necesita resolver `acme.tushorarios.com` → org_id
--   ANTES de saber quién es el user. Sin esta RPC, anon recibe `null` por
--   RLS, R3 (slug fantasma) dispara incorrectamente para slugs válidos.
--
--   La RPC solo expone (id, slug) que son inofensivos para enumeración
--   (igual que listar usuarios públicos en GitHub). No leakea PII ni
--   detalles del tenant.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_org_by_slug(p_slug TEXT)
RETURNS TABLE(id UUID, slug TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT o.id, o.slug
  FROM organizations o
  WHERE o.slug = lower(p_slug)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_org_by_slug(TEXT) TO anon, authenticated;

COMMIT;
