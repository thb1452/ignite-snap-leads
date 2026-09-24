/** Isolated Postgres (PGlite) fixture. No credentials, network, or production records.
 * Foundation CRM schema and existing policies are loaded from repository migrations.
 * Supabase-managed auth schema/functions and held-source receipt validation are minimal
 * test doubles; RLS, FK, trigger, transaction and permission semantics are PostgreSQL.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const migration = '20260924182954_snap_customer_workspace_isolation_v1.sql';
const sqlFile = (name) => readFile(path.join(root, 'supabase/migrations', name), 'utf8');
export async function createTenancyDb({ applyMigration = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',
      deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean DEFAULT false,
      email_confirmed_at timestamptz DEFAULT now(),phone_confirmed_at timestamptz,confirmed_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'role',current_user) $$;
    CREATE TYPE public.app_role AS ENUM('admin','va','user');
    CREATE TABLE public.user_roles(user_id uuid REFERENCES auth.users(id),role public.app_role,PRIMARY KEY(user_id,role));
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY roles_own_read ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
    CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
    CREATE TABLE public.user_profiles(user_id uuid UNIQUE REFERENCES auth.users(id),credits integer);
    CREATE TABLE public.foia_profiles(id uuid PRIMARY KEY,role text);
  `);
  await db.exec(await sqlFile('20250919212701_1bc992a8-75d2-4aaa-b89a-6de851b70152.sql'));
  // The legacy contacts table was dropped by 20251006003730 and is absent in current schema.
  await db.exec('DROP TABLE public.contacts');
  await db.exec(`CREATE TABLE public.properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,city text,state text,zip text);
    ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
    CREATE POLICY held_properties ON public.properties FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
    CREATE TABLE public.unlocked_properties(user_id uuid,property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,PRIMARY KEY(user_id,property_id));
    CREATE FUNCTION public.fn_check_unlocked_batch(p_user_id uuid,p_property_ids uuid[]) RETURNS TABLE(property_id uuid)
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
      IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501'; END IF;
      RETURN QUERY SELECT u.property_id FROM public.unlocked_properties u WHERE user_id=auth.uid() AND u.property_id=ANY(p_property_ids); END $$;
  `);
  const legacyProperties = await sqlFile('20251006003730_068f464c-f09b-42c3-9a94-34fd946529e9.sql');
  await db.exec(legacyProperties.slice(legacyProperties.indexOf('-- User activity tracking'),legacyProperties.indexOf('-- Indexes for performance')));
  let byoa = await sqlFile('20260421000802_aa059f47-ccff-4a59-a8b3-1b51fafa17ad.sql');
  await db.exec(byoa.slice(0, byoa.indexOf('-- ── 6. VAULT HELPER')));
  await db.exec(await sqlFile('20260421002715_b86e19f0-d5cb-4209-8bbb-032081ad1c75.sql'));
  await db.exec(await sqlFile('20260421005437_88f8af2d-ffaa-4727-bc49-97883c7f8499.sql'));
  let sms = await sqlFile('20260421012616_99ce70b4-4241-487c-9f71-89920067b7e9.sql');
  await db.exec(sms.slice(0, sms.indexOf('-- 8. Realtime')));
  await db.exec(`
    CREATE SCHEMA snap_relaunch;
    CREATE TABLE snap_relaunch.customer_source_acceptances(id uuid PRIMARY KEY,consumer_user_id uuid,valid_until timestamptz,revoked boolean DEFAULT false,mapping_ids uuid[] DEFAULT '{}',purpose text DEFAULT 'crm');
    CREATE TABLE snap_relaunch.customer_property_mappings(id uuid DEFAULT gen_random_uuid(),customer_property_id uuid,created_for_source boolean);
    CREATE TABLE snap_relaunch.source_crm_links(id uuid DEFAULT gen_random_uuid(),lead_id uuid,activity_id uuid,acceptance_id uuid,consumer_user_id uuid,org_id uuid);
    CREATE FUNCTION snap_relaunch.require_source_acceptance_v1(p_acceptance uuid,p_purpose text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM snap_relaunch.customer_source_acceptances a WHERE a.id=p_acceptance AND a.consumer_user_id=auth.uid() AND a.valid_until>now() AND NOT a.revoked) THEN
        RAISE EXCEPTION 'Source acceptance unavailable' USING ERRCODE='42501'; END IF; RETURN p_acceptance; END $$;
  `);
  // Apply the original restrictive source property and lead fences unchanged before the candidate.
  const source = await sqlFile('20260914224935_7e6c2c54-889c-492a-9b48-e09fc0d44119.sql');
  let sourceFences = source.slice(source.indexOf('CREATE FUNCTION public.fn_is_source_property_v1'), source.indexOf('CREATE FUNCTION public.protect_source_property_and_lead_v1'));
  // The actual function is composite in production; fixture uses uuid return value.
  sourceFences = sourceFences.replaceAll('a snap_relaunch.customer_source_acceptances%ROWTYPE','a uuid');
  await db.exec(sourceFences);
  await db.exec(source.slice(source.indexOf('CREATE FUNCTION public.protect_source_property_and_lead_v1'), source.indexOf('CREATE FUNCTION public.reject_source_legacy_violation_v1')));
  await db.exec(`CREATE TRIGGER source_property_immutable_v1 BEFORE UPDATE OR DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.protect_source_property_and_lead_v1();
    CREATE TRIGGER source_lead_identity_v1 BEFORE UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.protect_source_property_and_lead_v1();
    CREATE TRIGGER source_activity_immutable_v1 BEFORE UPDATE OR DELETE ON public.lead_activities FOR EACH ROW EXECUTE FUNCTION public.protect_source_property_and_lead_v1();`);
  await db.exec(await sqlFile('20260324120000_profiles_on_auth_user_created.sql'));
  await db.exec(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;
    CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'admin'));
    CREATE POLICY roles_admin_update ON public.user_roles FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'admin'));
    CREATE POLICY roles_admin_delete ON public.user_roles FOR DELETE TO authenticated USING(public.has_role(auth.uid(),'admin'));
    REVOKE ALL ON public.profiles,public.user_profiles FROM anon;
    ALTER POLICY "Users can insert their own profile" ON public.profiles TO authenticated WITH CHECK(public.has_role(auth.uid(),'admin'));
    ALTER POLICY "Users can update their own profile" ON public.profiles TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
  `);
  if (applyMigration) await db.exec(await sqlFile(migration));
  return db;
}
export async function asRole(db, role, userId, fn) {
  if (!['anon','authenticated','service_role'].includes(role)) throw new Error('Test role invalid');
  await db.exec(`SET ROLE ${role}`);
  await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [userId ?? '']);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub','',false)`); }
}
export async function newUser(db, id, metadata = {}) {
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)',[id,`fixture-${id.slice(-2)}@example.invalid`,JSON.stringify(metadata)]);
  return (await db.query('SELECT org_id FROM public.profiles WHERE user_id=$1',[id])).rows[0].org_id;
}
