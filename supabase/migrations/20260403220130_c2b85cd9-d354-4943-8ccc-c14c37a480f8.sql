INSERT INTO public.credit_ledger (user_id, delta, reason, meta)
SELECT '6da0e465-9b2a-4b19-858e-89a184620933'::uuid,
       1,
       'free_unlock_bug_refund',
       jsonb_build_object(
         'corrected_at', now(),
         'note', 'Refund to neutralize extra negative balance created by historic free unlock credit bug'
       )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.credit_ledger
  WHERE user_id = '6da0e465-9b2a-4b19-858e-89a184620933'::uuid
    AND reason = 'free_unlock_bug_refund'
);