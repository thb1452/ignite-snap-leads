// Caller-authenticated client only. Never pass the service-role client here.
export interface ExportQuery extends PromiseLike<{data:Record<string,unknown>[]|null;error:unknown}> {
  eq(column:string,value:unknown):ExportQuery;
  in(column:string,values:string[]):ExportQuery;
  order(column:string):ExportQuery;
  range(from:number,to:number):ExportQuery;
}
export interface ExportClient {from(table:string):{select(columns:string):ExportQuery}}
export async function exportRows(client:ExportClient,table:string,columns:string,scope:(query:ExportQuery)=>ExportQuery,order='id') {
  const rows:Record<string,unknown>[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await scope(client.from(table).select(columns)).order(order).range(offset,offset+499);
    if(error)throw new Error(`Could not export ${table}. No complete archive was created.`);
    rows.push(...(data??[]));
    if(!data||data.length<500)return rows;
    if(rows.length>=20000)throw new Error(`The ${table} archive exceeds the interactive export limit. Contact support for a complete archive.`);
  }
}
export async function collectCrmExport(client:ExportClient,userId:string) {
  const [leads,contacts,activities,stages]=await Promise.all([
    exportRows(client,'leads','id,title,stage_id,assigned_to,priority,notes,next_action,next_follow_up_at,last_contacted_at,estimated_value,estimated_repairs,offer_amount,contract_deadline,contact_restricted,archived_at,created_at,updated_at',q=>q.eq('created_by',userId)),
    exportRows(client,'crm_contacts','id,lead_id,name,relationship,phone,email,source,do_not_contact,restriction_note,created_at,updated_at',q=>q),
    // Source receipts and automatic evidence events retain their separate export
    // authorization contract; they are not included in a private work archive.
    exportRows(client,'lead_activities','id,lead_id,actor_id,activity_type,payload,created_at',q=>q.in('activity_type',['note','call','email','sms','stage_change','assignment','task'])),
    exportRows(client,'pipeline_stages','id,name,sort_order,color,is_won,is_lost',q=>q),
  ]);
  const ids=new Set(leads.map(row=>row.id));
  return {leads,contacts:contacts.filter(row=>ids.has(row.lead_id)),activities:activities.filter(row=>ids.has(row.lead_id)),stages};
}
