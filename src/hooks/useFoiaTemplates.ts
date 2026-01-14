import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface FoiaTemplate {
  id: string;
  name: string;
  state: string | null;
  template_text: string;
  use_count: number | null;
  success_rate: number | null;
  created_at: string | null;
}

export function useFoiaTemplates() {
  return useQuery({
    queryKey: ['foia-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foia_templates')
        .select('*')
        .order('state', { ascending: true, nullsFirst: true })
        .order('use_count', { ascending: false });
      
      if (error) throw error;
      return data as FoiaTemplate[];
    },
  });
}

export function useIncrementTemplateUse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data: current, error: fetchError } = await supabase
        .from('foia_templates')
        .select('use_count')
        .eq('id', templateId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const { error } = await supabase
        .from('foia_templates')
        .update({ use_count: (current?.use_count || 0) + 1 })
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foia-templates'] });
      toast({ title: '✅ Template copied!', description: 'Paste it into your request.' });
    },
  });
}
