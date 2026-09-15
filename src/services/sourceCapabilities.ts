import { HASH, ID, sourceRpc, type SourceActionRpc } from './sourceActions.ts';
export type SourceCapabilities={version:'source-owner-capabilities-v1';preparation_sha256:string;actor_user_id:string;checked_at:string;can_review:true;can_manage_source:boolean;
  management_authority:'existing_admin'|'preparation_grant'|'reviewer_only';management_grant_id:string|null;management_expires_at:string|null;customer_access_held:boolean;scope:string};
export function parseSourceCapabilities(v:any,actor:string,preparation:string):SourceCapabilities {
  const validTime=(t:any)=>typeof t==='string'&&Number.isFinite(Date.parse(t));
  const hasGrant=v?.management_grant_id!==null;
  if(!v||typeof v!=='object'||Array.isArray(v)||v.version!=='source-owner-capabilities-v1'||v.actor_user_id!==actor||v.preparation_sha256!==preparation||v.can_review!==true||!validTime(v.checked_at)||
    typeof v.can_manage_source!=='boolean'||typeof v.customer_access_held!=='boolean'||!['existing_admin','preparation_grant','reviewer_only'].includes(v.management_authority)||
    typeof v.scope!=='string'||v.scope.length>500||
    (hasGrant?typeof v.management_grant_id!=='string'||!ID.test(v.management_grant_id)||!validTime(v.management_expires_at)||Date.parse(v.management_expires_at)<=Date.parse(v.checked_at):v.management_expires_at!==null)||
    v.can_manage_source!==(v.management_authority!=='reviewer_only')||v.customer_access_held!==(v.management_authority!=='existing_admin')||
    (v.management_authority==='preparation_grant'&&!hasGrant)||(v.management_authority==='reviewer_only'&&hasGrant))throw new Error('This source permission could not be verified for the current account.');
  return {version:v.version,actor_user_id:actor,preparation_sha256:preparation,checked_at:v.checked_at,can_review:true,can_manage_source:v.can_manage_source,
    management_authority:v.management_authority,management_grant_id:v.management_grant_id,management_expires_at:v.management_expires_at,customer_access_held:v.customer_access_held,scope:v.scope};
}
export async function loadSourceCapabilities(client:SourceActionRpc,actor:string,preparation:string,signal:AbortSignal):Promise<SourceCapabilities> {
  if(!HASH.test(preparation))throw new Error('Choose an assigned source batch.');
  return parseSourceCapabilities(await sourceRpc(client,actor,'fn_source_owner_capabilities_v1',{p_preparation:preparation},signal),actor,preparation);
}
