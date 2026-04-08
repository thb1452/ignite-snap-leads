
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_unique_session 
ON public.credit_ledger ((meta->>'stripe_session_id'))
WHERE meta->>'stripe_session_id' IS NOT NULL;
