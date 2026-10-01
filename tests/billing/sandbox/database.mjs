// Isolated SQL adapter for the real Edge handler. No production database URL is accepted.
import { createTenancyDb } from '../../helpers/tenancy-db.mjs';
import { billingBaseline } from '../../helpers/billing-db.mjs';
import { readFileSync } from 'node:fs';

export async function database() {
  const db = await createTenancyDb({applyMigration:false});
  await billingBaseline(db);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260924183006_snap_billing_atomic_fulfillment_v1.sql',import.meta.url),'utf8'));
  const identifiers = new Set(['user_subscriptions','subscription_plans','user_id','stripe_subscription_id','stripe_price_id','name','id']);
  const identifier = value => { if (!identifiers.has(value)) throw new Error(`unsupported SQL adapter identifier: ${value}`); return value; };
  const client = {
    async rpc(name,args={}) {
      try {
        let result;
        if (name === 'fn_begin_billing_sync_v1') result = await db.query('select public.fn_begin_billing_sync_v1() as result');
        else if (name === 'fn_apply_billing_event_v1') result = await db.query('select public.fn_apply_billing_event_v1($1::jsonb) as result',[JSON.stringify(args.p_event)]);
        else if (name === 'fn_billing_checkout_enabled_v1') result = await db.query('select public.fn_billing_checkout_enabled_v1() as result');
        else throw new Error(`unsupported RPC: ${name}`);
        return {data:result.rows[0].result,error:null};
      } catch (error) { return {data:null,error}; }
    },
    from(table) { return {select(columns) { return {eq(column,value) { return {async maybeSingle() {
      try {
        const names=columns.split(',').map(x=>identifier(x.trim())).join(',');
        const {rows}=await db.query(`select ${names} from public.${identifier(table)} where ${identifier(column)}=$1`,[value]);
        if (rows.length>1) throw new Error('ambiguous SQL adapter result');
        return {data:rows[0]??null,error:null};
      } catch(error) { return {data:null,error}; }
    } };} };} };},
  };
  return {db,client};
}
