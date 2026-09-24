import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { crmKey } from '@/services/crmModel';
import * as service from '@/services/leads';
import type { Outcome } from '@/services/crmModel';

export function usePipelineStages() {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'stages'),queryFn:()=>service.fetchPipelineStages(user!.id),enabled:!!user,staleTime:300000});
}
export function useLeads() {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'leads'),queryFn:()=>service.fetchLeads(user!.id),enabled:!!user,staleTime:30000});
}
export function useLead(id:string|undefined) {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'lead',id),queryFn:()=>service.fetchLeadById(user!.id,id!),enabled:!!user&&!!id});
}
export function useLeadActivities(id:string|undefined) {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'activities',id),queryFn:()=>service.fetchLeadActivities(user!.id,id!),enabled:!!user&&!!id});
}
export function useCrmContacts(id:string|undefined) {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'contacts',id),queryFn:()=>service.fetchContacts(user!.id,id!),enabled:!!user&&!!id});
}
export function usePropertySnapshot(id:string|undefined) {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'property',id),queryFn:()=>service.fetchPropertySnapshot(user!.id,id!),enabled:!!user&&!!id});
}
export function useSourceCrmDetail(id:string|undefined) {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'source',id),queryFn:()=>service.fetchSourceDetail(user!.id,id!),enabled:!!user&&!!id,retry:false});
}
function useCrmMutation<T,R>(run:(actor:string,args:T)=>Promise<R>,success?:string) {
  const {user}=useAuth(); const qc=useQueryClient(); const {toast}=useToast();
  return useMutation({
    mutationFn:(args:T)=>{if(!user) throw new Error('Sign in required.');return run(user.id,args);},
    onSuccess:()=>{qc.invalidateQueries({queryKey:crmKey(user?.id)});if(success)toast({title:success});},
    onError:(error:Error)=>toast({title:'Change could not be confirmed',description:error.message,variant:'destructive'}),
  });
}
export function useAddToPipeline() {
  return useCrmMutation((actor:string,args:{propertyId:string;source?:string})=>service.createLeadFromProperty(actor,args.propertyId),'Pipeline ready');
}
export function useUpdateLeadStage() {
  return useCrmMutation((actor:string,args:{leadId:string;stageId:string})=>service.updateLeadStage(actor,args.leadId,args.stageId));
}
export function useUpdateLead() {
  return useCrmMutation((actor:string,args:{leadId:string;expected:string;updates:service.LeadEdits})=>service.updateLead(actor,args.leadId,args.expected,args.updates),'Lead saved');
}
export function useArchiveLead() {
  return useCrmMutation((actor:string,args:{leadId:string;restore?:boolean})=>service.archiveLead(actor,args.leadId,args.restore),'Pipeline updated');
}
export function useAddLeadNote() {
  return useCrmMutation((actor:string,args:{leadId:string;note:string})=>service.addLeadNote(actor,args.leadId,args.note),'Note added');
}
export function useSaveCrmContact() {
  return useCrmMutation((actor:string,args:{lead:service.Lead;input:service.ContactInput})=>service.saveContact(actor,args.lead,args.input),'Contact saved');
}
export function useRecordOutcome() {
  return useCrmMutation((actor:string,args:{leadId:string;requestId:string;expected:string;outcome:Outcome;note:string;nextAction:string|null;dueAt:string|null;completeAction:boolean})=>service.recordOutcome(actor,args),'Work recorded');
}

export function useCrmEvidence(lead:service.Lead|null|undefined) {
  const {user}=useAuth();
  return useQuery({queryKey:crmKey(user?.id,'evidence',lead?.id),queryFn:()=>service.fetchCrmEvidence(user!.id,lead!),enabled:!!user&&!!lead,retry:false});
}
