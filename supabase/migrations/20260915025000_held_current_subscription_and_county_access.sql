
-- LOCAL INSTALLATION PACKET. Root review and native preflight are required.
-- This complete file is one atomic transaction; no fixture helper/role/row definition belongs here.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
SET LOCAL statement_timeout='30s';
LOCK TABLE public.user_subscriptions,public.subscription_plans,public.subscription_usage,public.counties,auth.users IN ACCESS SHARE MODE;
DO $preflight$
DECLARE e jsonb:=$expected${"functions":[{"definition_md5":"c26a92f12837d42dd8148ec0aa667b12","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=public"],"signature":"public.fn_check_county_limit(integer)"},{"definition_md5":"783fc5456e6836191adc31819387c1b3","owner":"postgres","acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=public"],"signature":"public.fn_check_subscription_limit(text,integer,uuid)"},{"definition_md5":"13eb5c8ee3bf4863e139744477ebaa6a","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=public"],"signature":"public.fn_get_trial_status(uuid)"},{"definition_md5":"b4377ca1db183d833b185956dcef8154","owner":"postgres","acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=public"],"signature":"public.fn_get_user_subscription(uuid)"},{"definition_md5":"5427c1dad44af1e0c957102ce962a69c","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":false,"proconfig":["search_path=pg_catalog"],"signature":"public.fn_require_scoped_rpc_v1(uuid,boolean)"},{"definition_md5":"71233265e5fe6554a42f4f7bf782a4e0","owner":"postgres","acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=public"],"signature":"public.fn_start_trial(uuid,text)"},{"definition_md5":"f410d20599a981b2a8543a067f3bfd9e","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=public"],"signature":"public.fn_get_current_usage(uuid)"},{"definition_md5":"be6f5670542ccfa95a67386beda6fb44","owner":"postgres","acl":"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":true,"proconfig":["search_path=pg_catalog"],"signature":"public.fn_has_role_client_v1(uuid,public.app_role)"},{"definition_md5":"656bbe89910abf10ea08b61e2f72e087","owner":"postgres","acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","prosecdef":false,"proconfig":["search_path=pg_catalog"],"signature":"public.has_role(uuid,public.app_role)"},{"definition_md5":"20054548ba2003f61a6bcb472175700b","owner":"supabase_auth_admin","acl":"{=X/supabase_auth_admin,postgres=X/supabase_auth_admin,supabase_auth_admin=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}","prosecdef":false,"proconfig":null,"signature":"auth.jwt()"},{"definition_md5":"ea3b41bf29e2ad573067939329aa088e","owner":"supabase_auth_admin","acl":"{=X/supabase_auth_admin,supabase_auth_admin=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}","prosecdef":false,"proconfig":null,"signature":"auth.uid()"}],"protected":[{"anon_execute":false,"authenticated_execute":true,"md5":"3916c08e35aa36a66f9a8de4c6560a92","signature":"public.fn_reserve_export_v1(uuid,text,uuid[],boolean)"},{"anon_execute":false,"authenticated_execute":true,"md5":"cdc265e0a78a712007f4328875ae49ca","signature":"public.fn_reserve_source_export_v1(uuid,uuid)"},{"anon_execute":false,"authenticated_execute":true,"md5":"dc9e632ff4d616787d308a34988fd571","signature":"public.fn_unlock_property(uuid,uuid)"}],"schemas":[{"acl":"{supabase_admin=UC/supabase_admin,anon=U/supabase_admin,authenticated=U/supabase_admin,service_role=U/supabase_admin,supabase_auth_admin=UC/supabase_admin,dashboard_user=UC/supabase_admin,postgres=U/supabase_admin}","name":"auth","owner":"supabase_admin"},{"acl":"{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner,sandbox_exec_ojyxblegxpdgaqiscxpz=U/pg_database_owner,sandbox_exec=U/pg_database_owner}","name":"public","owner":"pg_database_owner"},{"acl":"{postgres=UC/postgres,authenticated=U/postgres}","name":"snap_relaunch","owner":"postgres"}],"tables":[{"acl":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=ar/postgres,sandbox_exec=ar/postgres}","force_rls":false,"rls":true,"table":"counties"},{"acl":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=ar/postgres,sandbox_exec=ar/postgres}","force_rls":false,"rls":true,"table":"subscription_plans"},{"acl":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=ar/postgres,sandbox_exec=ar/postgres}","force_rls":false,"rls":true,"table":"user_subscriptions"}],"columns":[{"default":"gen_random_uuid()","name":"id","notnull":true,"table":"counties","type":"uuid"},{"default":null,"name":"county_name","notnull":true,"table":"counties","type":"text"},{"default":null,"name":"state","notnull":true,"table":"counties","type":"text"},{"default":null,"name":"foia_status","notnull":false,"table":"counties","type":"text"},{"default":null,"name":"assigned_to","notnull":false,"table":"counties","type":"uuid"},{"default":"'pending'::text","name":"upload_status","notnull":false,"table":"counties","type":"text"},{"default":null,"name":"last_upload_date","notnull":false,"table":"counties","type":"timestamp with time zone"},{"default":"0","name":"list_count","notnull":false,"table":"counties","type":"integer"},{"default":"now()","name":"created_at","notnull":false,"table":"counties","type":"timestamp with time zone"},{"default":"now()","name":"updated_at","notnull":false,"table":"counties","type":"timestamp with time zone"},{"default":null,"name":"foia_portal_url","notnull":false,"table":"counties","type":"text"},{"default":"'web_form'::text","name":"portal_type","notnull":false,"table":"counties","type":"text"},{"default":null,"name":"last_request_date","notnull":false,"table":"counties","type":"date"},{"default":null,"name":"notes","notnull":false,"table":"counties","type":"text"},{"default":"gen_random_uuid()","name":"id","notnull":true,"table":"subscription_plans","type":"uuid"},{"default":null,"name":"name","notnull":true,"table":"subscription_plans","type":"text"},{"default":null,"name":"display_name","notnull":true,"table":"subscription_plans","type":"text"},{"default":null,"name":"description","notnull":false,"table":"subscription_plans","type":"text"},{"default":"0","name":"price_monthly_cents","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"0","name":"price_annual_cents","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"0","name":"max_monthly_exports","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"0","name":"max_counties","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"1","name":"max_user_seats","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"0","name":"max_skip_traces_per_month","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"'[]'::jsonb","name":"features","notnull":false,"table":"subscription_plans","type":"jsonb"},{"default":"false","name":"has_advanced_filters","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"false","name":"has_violation_filtering","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"false","name":"has_rolling_intelligence","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"false","name":"has_escalation_alerts","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"false","name":"has_api_access","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"false","name":"has_dedicated_manager","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"0","name":"sort_order","notnull":true,"table":"subscription_plans","type":"integer"},{"default":"true","name":"is_active","notnull":true,"table":"subscription_plans","type":"boolean"},{"default":"now()","name":"created_at","notnull":true,"table":"subscription_plans","type":"timestamp with time zone"},{"default":"now()","name":"updated_at","notnull":true,"table":"subscription_plans","type":"timestamp with time zone"},{"default":"5","name":"max_states","notnull":false,"table":"subscription_plans","type":"integer"},{"default":"'basic'::text","name":"data_tier","notnull":true,"table":"subscription_plans","type":"text"},{"default":null,"name":"stripe_price_id","notnull":false,"table":"subscription_plans","type":"text"},{"default":"gen_random_uuid()","name":"id","notnull":true,"table":"user_subscriptions","type":"uuid"},{"default":null,"name":"user_id","notnull":true,"table":"user_subscriptions","type":"uuid"},{"default":null,"name":"plan_id","notnull":true,"table":"user_subscriptions","type":"uuid"},{"default":null,"name":"stripe_customer_id","notnull":false,"table":"user_subscriptions","type":"text"},{"default":null,"name":"stripe_subscription_id","notnull":false,"table":"user_subscriptions","type":"text"},{"default":"'active'::text","name":"status","notnull":true,"table":"user_subscriptions","type":"text"},{"default":null,"name":"current_period_start","notnull":false,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":null,"name":"current_period_end","notnull":false,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":null,"name":"cancel_at","notnull":false,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":null,"name":"cancelled_at","notnull":false,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":"now()","name":"created_at","notnull":true,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":"now()","name":"updated_at","notnull":true,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":null,"name":"trial_started_at","notnull":false,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":null,"name":"trial_ends_at","notnull":false,"table":"user_subscriptions","type":"timestamp with time zone"},{"default":null,"name":"trial_tier","notnull":false,"table":"user_subscriptions","type":"text"},{"default":"0","name":"trial_exports_used","notnull":false,"table":"user_subscriptions","type":"integer"},{"default":"50","name":"trial_exports_limit","notnull":false,"table":"user_subscriptions","type":"integer"}],"constraints":[{"definition":"FOREIGN KEY (assigned_to) REFERENCES auth.users(id)","name":"counties_assigned_to_fkey","table":"counties"},{"definition":"UNIQUE (county_name, state)","name":"counties_county_name_state_key","table":"counties"},{"definition":"PRIMARY KEY (id)","name":"counties_pkey","table":"counties"},{"definition":"UNIQUE (name)","name":"subscription_plans_name_key","table":"subscription_plans"},{"definition":"PRIMARY KEY (id)","name":"subscription_plans_pkey","table":"subscription_plans"},{"definition":"CHECK (((trial_tier IS NULL) OR (trial_tier = ANY (ARRAY['starter'::text, 'professional'::text, 'enterprise'::text]))))","name":"chk_trial_tier","table":"user_subscriptions"},{"definition":"PRIMARY KEY (id)","name":"user_subscriptions_pkey","table":"user_subscriptions"},{"definition":"FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT","name":"user_subscriptions_plan_id_fkey","table":"user_subscriptions"},{"definition":"CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'cancelled'::text, 'unpaid'::text, 'trialing'::text])))","name":"user_subscriptions_status_check","table":"user_subscriptions"},{"definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","name":"user_subscriptions_user_id_fkey","table":"user_subscriptions"}],"indexes":[{"definition":"CREATE INDEX idx_counties_assigned ON public.counties USING btree (assigned_to)","name":"idx_counties_assigned","table":"counties"},{"definition":"CREATE INDEX idx_counties_state ON public.counties USING btree (state)","name":"idx_counties_state","table":"counties"},{"definition":"CREATE INDEX idx_counties_status ON public.counties USING btree (foia_status)","name":"idx_counties_status","table":"counties"},{"definition":"CREATE UNIQUE INDEX counties_pkey ON public.counties USING btree (id)","name":"counties_pkey","table":"counties"},{"definition":"CREATE UNIQUE INDEX counties_county_name_state_key ON public.counties USING btree (county_name, state)","name":"counties_county_name_state_key","table":"counties"},{"definition":"CREATE INDEX idx_counties_assigned_to ON public.counties USING btree (assigned_to)","name":"idx_counties_assigned_to","table":"counties"},{"definition":"CREATE UNIQUE INDEX subscription_plans_pkey ON public.subscription_plans USING btree (id)","name":"subscription_plans_pkey","table":"subscription_plans"},{"definition":"CREATE UNIQUE INDEX subscription_plans_name_key ON public.subscription_plans USING btree (name)","name":"subscription_plans_name_key","table":"subscription_plans"},{"definition":"CREATE INDEX idx_user_subscriptions_plan_id ON public.user_subscriptions USING btree (plan_id)","name":"idx_user_subscriptions_plan_id","table":"user_subscriptions"},{"definition":"CREATE UNIQUE INDEX user_subscriptions_pkey ON public.user_subscriptions USING btree (id)","name":"user_subscriptions_pkey","table":"user_subscriptions"},{"definition":"CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions USING btree (user_id)","name":"idx_user_subscriptions_user_id","table":"user_subscriptions"},{"definition":"CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions USING btree (status)","name":"idx_user_subscriptions_status","table":"user_subscriptions"},{"definition":"CREATE INDEX idx_user_subscriptions_stripe_sub ON public.user_subscriptions USING btree (stripe_subscription_id)","name":"idx_user_subscriptions_stripe_sub","table":"user_subscriptions"},{"definition":"CREATE UNIQUE INDEX unique_non_cancelled_subscription ON public.user_subscriptions USING btree (user_id) WHERE (status <> 'cancelled'::text)","name":"unique_non_cancelled_subscription","table":"user_subscriptions"},{"definition":"CREATE UNIQUE INDEX unique_active_subscription_per_user ON public.user_subscriptions USING btree (user_id) WHERE (status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text]))","name":"unique_active_subscription_per_user","table":"user_subscriptions"},{"definition":"CREATE UNIQUE INDEX one_active_subscription_per_user ON public.user_subscriptions USING btree (user_id) WHERE (status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text]))","name":"one_active_subscription_per_user","table":"user_subscriptions"}],"policies":[{"cmd":"ALL","name":"Admins can manage all counties","qual":"(EXISTS ( SELECT 1\n   FROM user_roles\n  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role))))","roles":["public"],"table":"counties","with_check":null},{"cmd":"ALL","name":"Admins full access to counties","qual":"has_role(auth.uid(), 'admin'::app_role)","roles":["authenticated"],"table":"counties","with_check":"has_role(auth.uid(), 'admin'::app_role)"},{"cmd":"UPDATE","name":"VAs can update assigned counties","qual":"(assigned_to = auth.uid())","roles":["public"],"table":"counties","with_check":null},{"cmd":"SELECT","name":"VAs can view assigned counties","qual":"((assigned_to = auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles\n  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))))","roles":["public"],"table":"counties","with_check":null},{"cmd":"SELECT","name":"Anyone can view active plans","qual":"(is_active = true)","roles":["public"],"table":"subscription_plans","with_check":null},{"cmd":"ALL","name":"Service role manages subscriptions","qual":"((auth.jwt() ->> 'role'::text) = 'service_role'::text)","roles":["public"],"table":"user_subscriptions","with_check":"((auth.jwt() ->> 'role'::text) = 'service_role'::text)"},{"cmd":"SELECT","name":"Users can view their own subscriptions","qual":"(user_id = auth.uid())","roles":["public"],"table":"user_subscriptions","with_check":null}],"triggers":[{"definition":"CREATE TRIGGER update_subscription_plans_timestamp BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION update_subscription_timestamp()","enabled":"O","function":"update_subscription_timestamp()","name":"update_subscription_plans_timestamp","table":"subscription_plans"},{"definition":"CREATE TRIGGER update_user_subscriptions_timestamp BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_subscription_timestamp()","enabled":"O","function":"update_subscription_timestamp()","name":"update_user_subscriptions_timestamp","table":"user_subscriptions"}],"auth_columns":[{"name":"banned_until","type":"timestamp with time zone"},{"name":"deleted_at","type":"timestamp with time zone"},{"name":"email_confirmed_at","type":"timestamp with time zone"},{"name":"id","type":"uuid"},{"name":"is_anonymous","type":"boolean"},{"name":"phone_confirmed_at","type":"timestamp with time zone"}],"usage_columns":[{"default":"0","name":"api_calls_count","notnull":true,"type":"integer"},{"default":"now()","name":"created_at","notnull":true,"type":"timestamp with time zone"},{"default":"0","name":"exports_count","notnull":true,"type":"integer"},{"default":"gen_random_uuid()","name":"id","notnull":true,"type":"uuid"},{"default":null,"name":"period_end","notnull":true,"type":"date"},{"default":null,"name":"period_start","notnull":true,"type":"date"},{"default":"0","name":"skip_traces_count","notnull":true,"type":"integer"},{"default":"now()","name":"updated_at","notnull":true,"type":"timestamp with time zone"},{"default":null,"name":"user_id","notnull":true,"type":"uuid"}],"usage_constraints":[{"definition":"PRIMARY KEY (id)","name":"subscription_usage_pkey"},{"definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","name":"subscription_usage_user_id_fkey"},{"definition":"UNIQUE (user_id, period_start)","name":"unique_user_period"}]}$expected$::jsonb; f jsonb; actual jsonb; relation regclass; fn regprocedure; p record;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'county_install_requires_existing_postgres_owner';END IF;
 IF to_regprocedure('snap_relaunch.current_customer_subscription_v1(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'county_install_helper_already_exists';END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(e->'functions') LOOP
  fn:=to_regprocedure(f->>'signature');IF fn IS NULL THEN RAISE EXCEPTION 'county_function_missing: %',f->>'signature';END IF;
  SELECT md5(pg_get_functiondef(oid)) AS hash,pg_get_userbyid(proowner) AS owner,prosecdef,to_jsonb(proconfig) AS config,
   (SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(coalesce(proacl,acldefault('f',proowner))) x) AS acl INTO p FROM pg_proc WHERE oid=fn;
  IF p.hash IS DISTINCT FROM f->>'definition_md5' OR p.owner IS DISTINCT FROM f->>'owner' OR p.prosecdef IS DISTINCT FROM (f->>'prosecdef')::boolean OR p.config IS DISTINCT FROM nullif(f->'proconfig','null'::jsonb)
   OR p.acl IS DISTINCT FROM (SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest((f->>'acl')::aclitem[]) x) THEN RAISE EXCEPTION 'county_function_or_acl_changed: %',f->>'signature';END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(e->'protected') LOOP
  fn:=to_regprocedure(f->>'signature');
  IF fn IS NULL OR md5(pg_get_functiondef(fn)) IS DISTINCT FROM f->>'md5'
   OR has_function_privilege('anon',fn,'EXECUTE') IS DISTINCT FROM (f->>'anon_execute')::boolean
   OR has_function_privilege('authenticated',fn,'EXECUTE') IS DISTINCT FROM (f->>'authenticated_execute')::boolean THEN RAISE EXCEPTION 'county_protected_execution_changed: %',f->>'signature';END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(e->'schemas') LOOP
  SELECT pg_get_userbyid(nspowner) AS owner,(SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(nspacl) x) AS acl INTO p FROM pg_namespace WHERE nspname=f->>'name';
  IF NOT FOUND OR p.owner IS DISTINCT FROM f->>'owner' OR p.acl IS DISTINCT FROM (SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest((f->>'acl')::aclitem[]) x) THEN RAISE EXCEPTION 'county_schema_access_changed: %',f->>'name';END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(e->'tables') LOOP
  relation:=to_regclass('public.'||(f->>'table'));
  SELECT relrowsecurity AS rls,relforcerowsecurity AS force_rls,(SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(relacl) x) AS acl INTO p FROM pg_class WHERE oid=relation;
  IF NOT FOUND OR p.rls IS DISTINCT FROM (f->>'rls')::boolean OR p.force_rls IS DISTINCT FROM (f->>'force_rls')::boolean OR p.acl IS DISTINCT FROM (SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest((f->>'acl')::aclitem[]) x) THEN RAISE EXCEPTION 'county_table_access_changed: %',f->>'table';END IF;
  SELECT jsonb_agg(jsonb_build_object('table',f->>'table','name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attname) INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=relation AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'name') FROM jsonb_array_elements(e->'columns') x WHERE x->>'table'=f->>'table') THEN RAISE EXCEPTION 'county_columns_changed: %',f->>'table';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('table',f->>'table','name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname),'[]') INTO actual FROM pg_constraint WHERE conrelid=relation AND contype<>'n';
  IF actual IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'),'[]') FROM jsonb_array_elements(e->'constraints') x WHERE x->>'table'=f->>'table') THEN RAISE EXCEPTION 'county_constraints_changed: %',f->>'table';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('table',f->>'table','name',indexname,'definition',indexdef) ORDER BY indexname),'[]') INTO actual FROM pg_indexes WHERE schemaname='public' AND tablename=f->>'table';
  IF actual IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'),'[]') FROM jsonb_array_elements(e->'indexes') x WHERE x->>'table'=f->>'table') THEN RAISE EXCEPTION 'county_indexes_changed: %',f->>'table';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('table',f->>'table','name',policyname,'cmd',cmd,'roles',roles,'qual',qual,'with_check',with_check) ORDER BY policyname),'[]') INTO actual FROM pg_policies WHERE schemaname='public' AND tablename=f->>'table';
  IF actual IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'),'[]') FROM jsonb_array_elements(e->'policies') x WHERE x->>'table'=f->>'table') THEN RAISE EXCEPTION 'county_policies_changed: %',f->>'table';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('table',f->>'table','name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled,'function',tgfoid::regprocedure::text) ORDER BY tgname),'[]') INTO actual FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal;
  IF actual IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'),'[]') FROM jsonb_array_elements(e->'triggers') x WHERE x->>'table'=f->>'table') THEN RAISE EXCEPTION 'county_triggers_changed: %',f->>'table';END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod)) ORDER BY attname) INTO actual FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname IN ('id','banned_until','deleted_at','email_confirmed_at','phone_confirmed_at','is_anonymous') AND attnum>0 AND NOT attisdropped;
 IF actual IS DISTINCT FROM e->'auth_columns' THEN RAISE EXCEPTION 'county_current_account_columns_changed';END IF;
 SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attname) INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.subscription_usage'::regclass AND a.attnum>0 AND NOT a.attisdropped;
 IF actual IS DISTINCT FROM e->'usage_columns' THEN RAISE EXCEPTION 'county_usage_columns_changed';END IF;
 SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) INTO actual FROM pg_constraint WHERE conrelid='public.subscription_usage'::regclass AND contype<>'n';
 IF actual IS DISTINCT FROM e->'usage_constraints' THEN RAISE EXCEPTION 'county_usage_constraints_changed';END IF;
END $preflight$;

-- LOCAL CANDIDATE ONLY. No historical data, roles, plans, prices, periods or counters are rewritten.
-- The private helper is callable only through existing owner-run public functions.
CREATE FUNCTION snap_relaunch.current_customer_subscription_v1(p_user_id uuid)
RETURNS SETOF public.user_subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT s.* FROM (
  SELECT us.* FROM public.user_subscriptions us WHERE us.user_id=p_user_id
  ORDER BY us.created_at DESC,us.id DESC LIMIT 1
 ) s
 WHERE auth.uid() IS NOT NULL AND p_user_id=auth.uid()
 AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
  AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
  AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL))
 AND ((s.status='active' AND s.current_period_start<=now() AND s.current_period_end>now())
   OR (s.status IN ('trial','trialing') AND s.trial_started_at<=now() AND s.trial_ends_at>now()));
$fn$;
REVOKE ALL ON FUNCTION snap_relaunch.current_customer_subscription_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- New helper only: do not inherit direct EXECUTE from namespace/global default ACLs.
-- Existing public wrappers execute as their trusted owner; platform defaults elsewhere are unchanged.
DO $private_acl$ DECLARE grantee_name text; BEGIN
 FOR grantee_name IN SELECT DISTINCT pg_get_userbyid(a.grantee)
  FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='snap_relaunch.current_customer_subscription_v1(uuid)'::regprocedure
    AND a.grantee<>0 AND a.grantee<>p.proowner
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION snap_relaunch.current_customer_subscription_v1(uuid) FROM %I',grantee_name); END LOOP;
END $private_acl$;


CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(subscription_id uuid, user_id uuid, plan_id uuid, plan_name text, display_name text, status text, current_period_start timestamp with time zone, current_period_end timestamp with time zone, max_monthly_exports integer, max_counties integer, max_user_seats integer, max_skip_traces_per_month integer, has_advanced_filters boolean, has_violation_filtering boolean, has_rolling_intelligence boolean, has_escalation_alerts boolean, has_api_access boolean, stripe_subscription_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id as subscription_id,
    s.user_id,
    s.plan_id,
    p.name as plan_name,
    p.display_name,
    s.status,
    s.current_period_start,
    s.current_period_end,
    p.max_monthly_exports,
    p.max_counties,
    p.max_user_seats,
    p.max_skip_traces_per_month,
    p.has_advanced_filters,
    p.has_violation_filtering,
    p.has_rolling_intelligence,
    p.has_escalation_alerts,
    p.has_api_access,
    s.stripe_subscription_id
  FROM snap_relaunch.current_customer_subscription_v1(p_user_id) s
  JOIN public.subscription_plans p ON s.plan_id = p.id
  ;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_current_usage(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.user_subscriptions%ROWTYPE; v_exports integer:=0; v_api integer:=0; v_start timestamptz;v_end timestamptz;
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM snap_relaunch.current_customer_subscription_v1(p_user_id);
 IF NOT FOUND THEN
  RETURN jsonb_build_object('exports_count',0,'api_calls_count',0,'period_start',NULL,'period_end',NULL);
 END IF;
 IF s.status IN ('trial','trialing') THEN
  v_start:=s.trial_started_at;v_end:=s.trial_ends_at;
  v_exports:=coalesce(s.trial_exports_used,0);
 ELSE
  v_start:=s.current_period_start;v_end:=s.current_period_end;
  SELECT coalesce(exports_count,0),coalesce(api_calls_count,0) INTO v_exports,v_api
  FROM public.subscription_usage WHERE user_id=p_user_id AND period_start=v_start::date;
 END IF;
 RETURN jsonb_build_object('exports_count',coalesce(v_exports,0),'api_calls_count',coalesce(v_api,0),
  'period_start',v_start,'period_end',v_end);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.user_subscriptions%ROWTYPE; p public.subscription_plans%ROWTYPE;
 v_limit integer; v_current integer;v_usage jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501';END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RETURN jsonb_build_object('allowed',false,'reason','invalid_amount');END IF;
 SELECT * INTO s FROM snap_relaunch.current_customer_subscription_v1(p_user_id);
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,'reason','no_current_subscription',
  'message','A current verified subscription or trial is required.');END IF;
 IF p_usage_type IS DISTINCT FROM 'exports' THEN
  RETURN jsonb_build_object('allowed',false,'reason','unsupported_usage',
   'message','This usage path has no supported reservation.');END IF;
 SELECT * INTO p FROM public.subscription_plans WHERE id=s.plan_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,'reason','plan_unavailable');END IF;
 IF s.status IN ('trial','trialing') THEN
  v_limit:=s.trial_exports_limit;v_current:=coalesce(s.trial_exports_used,0);
 ELSE
  v_limit:=p.max_monthly_exports;v_usage:=public.fn_get_current_usage(p_user_id);
  v_current:=(v_usage->>'exports_count')::integer;
 END IF;
 IF v_current IS NULL OR v_current<0 OR v_limit IS NULL OR v_limit < -1
  OR (s.status IN ('trial','trialing') AND v_limit<0) THEN
  RETURN jsonb_build_object('allowed',false,'reason','usage_unverified');END IF;
 IF v_limit=-1 THEN RETURN jsonb_build_object('allowed',true,'current',v_current,'limit',NULL,
  'remaining',NULL,'plan_name',p.name,'unlimited',true);END IF;
 RETURN jsonb_build_object('allowed',v_current::bigint+p_amount::bigint<=v_limit::bigint,
  'reason',CASE WHEN v_current::bigint+p_amount::bigint<=v_limit::bigint THEN 'within_limit' ELSE 'limit_exceeded' END,
  'current',v_current,'limit',v_limit,'remaining',greatest(0::bigint,v_limit::bigint-v_current::bigint-p_amount::bigint),
  'plan_name',p.name,'message','The allowance check does not reserve or execute an export.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_trial_status(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.user_subscriptions%ROWTYPE;current_entitlement boolean:=false;is_trial boolean:=false;
 empty_result jsonb:=jsonb_build_object('is_on_trial',false,'has_trial_expired',false,'has_active_subscription',false,
 'trial_days_remaining',0,'trial_exports_used',0,'trial_exports_remaining',0,'trial_exports_limit',0,
 'trial_tier',NULL,'trial_ends_at',NULL,'trial_started_at',NULL,'subscription_status',NULL,'can_export',false,'plan_id',NULL);
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.deleted_at IS NULL
  AND NOT coalesce(u.is_anonymous,false) AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)) THEN RETURN empty_result;END IF;
 SELECT * INTO s FROM public.user_subscriptions WHERE user_id=p_user_id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN empty_result;END IF;
 current_entitlement:=EXISTS(SELECT 1 FROM snap_relaunch.current_customer_subscription_v1(p_user_id));
 is_trial:=s.status IN ('trial','trialing');
 RETURN jsonb_build_object('is_on_trial',is_trial AND current_entitlement,
  'has_trial_expired',is_trial AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at<=now(),
  'has_active_subscription',s.status='active' AND current_entitlement,
  'trial_days_remaining',CASE WHEN is_trial AND current_entitlement THEN round(extract(epoch FROM(s.trial_ends_at-now()))/86400.0,1) ELSE 0 END,
  'trial_exports_used',coalesce(s.trial_exports_used,0),
  'trial_exports_remaining',CASE WHEN is_trial AND current_entitlement AND s.trial_exports_limit>=0 AND coalesce(s.trial_exports_used,0)>=0
    THEN greatest(0::bigint,s.trial_exports_limit::bigint-coalesce(s.trial_exports_used,0)::bigint) ELSE 0 END,
  'trial_exports_limit',greatest(0,coalesce(s.trial_exports_limit,0)),
  'trial_tier',s.trial_tier,'trial_ends_at',s.trial_ends_at,'trial_started_at',s.trial_started_at,
  'subscription_status',s.status,'plan_id',s.plan_id,
  'can_export',current_entitlement AND coalesce((public.fn_check_subscription_limit('exports',1,p_user_id)->>'allowed')::boolean,false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_check_county_limit(p_amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
  v_max_counties integer;
  v_current_count integer;
  v_remaining integer;
  v_plan_name text;
BEGIN
  PERFORM public.fn_require_scoped_rpc_v1(auth.uid(),false);
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
  END IF;
  
  IF p_amount IS NULL OR p_amount<=0 THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_amount');
  END IF;
  -- Get user's subscription limits
  SELECT sp.max_counties, sp.display_name
  INTO v_max_counties, v_plan_name
  FROM snap_relaunch.current_customer_subscription_v1(v_user_id) us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  LIMIT 1;
  
  IF v_max_counties IS NULL OR v_max_counties < -1 THEN
    RETURN jsonb_build_object('allowed',false,'reason','no_current_subscription',
      'message','A current verified subscription or trial is required.');
  END IF;

  -- -1 means unlimited
  IF v_max_counties = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'message', 'Unlimited counties allowed',
      'current', 0,
      'limit', -1,
      'remaining', -1,
      'plan_name', v_plan_name
    );
  END IF;
  
  -- Count currently assigned counties (organization-wide)
  SELECT COUNT(*)
  INTO v_current_count
  FROM public.counties
  WHERE assigned_to IS NOT NULL AND (
    current_setting('role',true)='service_role' OR session_user='service_role' OR
    public.has_role(v_user_id,'admin'::public.app_role) OR assigned_to=v_user_id
  );
  
  v_remaining := v_max_counties - v_current_count;
  
  IF v_current_count::bigint + p_amount::bigint > v_max_counties THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format('County limit reached. Your %s plan allows %s counties. You have %s assigned.', 
                       v_plan_name, v_max_counties, v_current_count),
      'current', v_current_count,
      'limit', v_max_counties,
      'remaining', GREATEST(0, v_remaining),
      'plan_name', v_plan_name
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'within_limit',
    'message', format('%s of %s counties used', v_current_count, v_max_counties),
    'current', v_current_count,
    'limit', v_max_counties,
    'remaining', v_remaining,
    'plan_name', v_plan_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_start_trial(p_user_id uuid, p_trial_tier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
  RETURN jsonb_build_object('success',false,'error','Unauthorized');END IF;
 -- The legacy implementation is rejected by the current status constraint.
 -- Do not turn that failure into implicit permission for new or repeated trials.
 RETURN jsonb_build_object('success',false,'error','trial_creation_held',
  'message','New trial creation remains on hold pending an approved eligibility and billing path.');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_get_user_subscription(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_get_user_subscription(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_get_current_usage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_get_current_usage(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_check_subscription_limit(text,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_check_subscription_limit(text,integer,uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_get_trial_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_get_trial_status(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_check_county_limit(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_check_county_limit(integer) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_start_trial(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_start_trial(uuid,text) TO authenticated,service_role;


DO $postflight$ DECLARE p record; f jsonb; BEGIN
 FOR f IN SELECT * FROM jsonb_array_elements($final$[{"schema":"public","signature":"public.fn_check_county_limit(integer)","md5":"99452c77e3e84f19a65c31a274279ba3","prosecdef":true,"proconfig":["search_path=pg_catalog"],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","baseline_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}"},{"schema":"public","signature":"public.fn_check_subscription_limit(text,integer,uuid)","md5":"d9890a54ff05a5470b38f6121a6d3cd2","prosecdef":true,"proconfig":["search_path=public"],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","baseline_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}"},{"schema":"public","signature":"public.fn_get_current_usage(uuid)","md5":"cabc76331b97ea3d4f689293fef6b27b","prosecdef":true,"proconfig":["search_path=public"],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","baseline_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}"},{"schema":"public","signature":"public.fn_get_trial_status(uuid)","md5":"b1af6d47557ac7f1f04d5d3c655f73fb","prosecdef":true,"proconfig":["search_path=public"],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","baseline_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}"},{"schema":"public","signature":"public.fn_get_user_subscription(uuid)","md5":"cf4617008060d046a022bacc4db54b6f","prosecdef":true,"proconfig":["search_path=public"],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","baseline_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}"},{"schema":"public","signature":"public.fn_start_trial(uuid,text)","md5":"17202b2920a5c15c3a296e9376173805","prosecdef":true,"proconfig":["search_path=public"],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","baseline_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}"}]$final$::jsonb) LOOP
  SELECT md5(pg_get_functiondef(oid)) AS hash,prosecdef,to_jsonb(proconfig) AS config,pg_get_userbyid(proowner) AS owner,(SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(proacl) x) AS acl INTO p FROM pg_proc WHERE oid=(f->>'signature')::regprocedure;
  IF p.hash IS DISTINCT FROM f->>'md5' OR p.prosecdef IS DISTINCT FROM true OR p.owner IS DISTINCT FROM 'postgres' OR p.config IS DISTINCT FROM f->'proconfig'
   OR p.acl IS DISTINCT FROM (SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest((f->>'baseline_acl')::aclitem[]) x WHERE split_part(x::text,'=',1) NOT IN ('','anon')) THEN RAISE EXCEPTION 'county_installed_function_or_grants_differ: %',f->>'signature';END IF;
 END LOOP;

 SELECT proowner,prosecdef,proconfig INTO p FROM pg_proc WHERE oid='snap_relaunch.current_customer_subscription_v1(uuid)'::regprocedure;
 IF pg_get_userbyid(p.proowner)<>'postgres' OR p.prosecdef IS DISTINCT FROM true OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] THEN RAISE EXCEPTION 'county_helper_owner_changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid='snap_relaunch.current_customer_subscription_v1(uuid)'::regprocedure AND a.grantee<>f.proowner) THEN RAISE EXCEPTION 'county_helper_is_not_private';END IF;
END $postflight$;
COMMIT;
