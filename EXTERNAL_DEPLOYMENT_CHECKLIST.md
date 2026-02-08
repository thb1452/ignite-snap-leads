# External Supabase Deployment Checklist

## Project: dqwolscmceelqpkfclgi

This checklist covers everything needed to fully migrate from Lovable Cloud to your external Supabase Pro instance.

---

## ✅ Completed

- [x] Frontend client now uses external Supabase URL via `externalClient.ts`
- [x] Environment variables set: `VITE_EXTERNAL_SUPABASE_URL`, `VITE_EXTERNAL_SUPABASE_ANON_KEY`
- [x] All 46+ files migrated to use `externalClient.ts`

---

## 🚀 Step 1: Deploy Edge Functions

### Prerequisites
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your external project
supabase link --project-ref dqwolscmceelqpkfclgi
```

### Deploy All Functions
```bash
# Deploy all edge functions at once
supabase functions deploy

# Or deploy individually:
supabase functions deploy process-upload
supabase functions deploy generate-insights
supabase functions deploy geocode-properties
supabase functions deploy export-csv
supabase functions deploy bulk-delete-properties
supabase functions deploy bulk-rescore
supabase functions deploy backfill-property-aggregates
supabase functions deploy backfill-insights
supabase functions deploy backfill-scores
supabase functions deploy bulk-generate-missing-insights
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy delete-upload-job
supabase functions deploy delete-user-account
supabase functions deploy export-user-data
supabase functions deploy job-monitor
supabase functions deploy refresh-outdated-insights
supabase functions deploy reprocess-upload-job
supabase functions deploy reverse-geocode-zips
supabase functions deploy send-user-invitation
supabase functions deploy stripe-webhook
supabase functions deploy weekly-digest
```

---

## 🔐 Step 2: Set Secrets on External Project

These secrets are **required** for edge functions to work:

### Required Secrets
```bash
# Stripe (for payments)
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxx

# App URL (for redirects after checkout)
supabase secrets set APP_URL=https://snapignite.com
```

### Optional Secrets (if using these features)
```bash
# OpenAI (only if using AI features - currently not needed, insights are deterministic)
# supabase secrets set OPENAI_API_KEY=sk-xxxx

# Resend (for email sending, if applicable)
# supabase secrets set RESEND_API_KEY=re_xxxx
```

### Verify Secrets
```bash
supabase secrets list
```

---

## 📦 Step 3: Verify Storage Bucket

Ensure the `csv-uploads` bucket exists on the external project:

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/dqwolscmceelqpkfclgi
2. Navigate to **Storage**
3. Confirm `csv-uploads` bucket exists
4. If not, create it with these settings:
   - Name: `csv-uploads`
   - Public: No (private)
5. Ensure RLS policies allow authenticated users to upload/read their own files

---

## 🔗 Step 4: Configure Stripe Webhook

Set up Stripe to send events to your external Supabase:

1. Go to: https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://dqwolscmceelqpkfclgi.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret
5. Set it in secrets:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxx
   ```

---

## 🧪 Step 5: Test Upload Flow

1. Log in to the app
2. Navigate to Upload page
3. Upload a small test CSV (< 100 rows)
4. Monitor the job progress
5. Verify properties appear in Leads page

### Troubleshooting

If upload fails, check edge function logs:
```bash
supabase functions logs process-upload --project-ref dqwolscmceelqpkfclgi
```

Common issues:
- Missing `SUPABASE_SERVICE_ROLE_KEY` - This is auto-set by Supabase
- Missing `SUPABASE_URL` - This is auto-set by Supabase
- Storage bucket not found - Create `csv-uploads` bucket
- CORS errors - Check function CORS headers

---

## 📊 Summary of Edge Functions

| Function | Purpose | Secrets Needed |
|----------|---------|----------------|
| `process-upload` | CSV parsing & data import | None (uses service role) |
| `generate-insights` | Deterministic property scoring | None |
| `geocode-properties` | Free US Census geocoding | None |
| `export-csv` | Export leads to CSV | None |
| `bulk-delete-properties` | Delete properties in bulk | None |
| `bulk-rescore` | Recalculate property scores | None |
| `create-checkout-session` | Stripe checkout | `STRIPE_SECRET_KEY`, `APP_URL` |
| `create-portal-session` | Stripe customer portal | `STRIPE_SECRET_KEY` |
| `stripe-webhook` | Handle Stripe events | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `delete-upload-job` | Delete upload job & data | None |
| `weekly-digest` | Send weekly email digests | (email service key if applicable) |

---

## ✅ Final Verification

After completing all steps:

1. [ ] Edge functions deployed successfully
2. [ ] All required secrets set
3. [ ] Storage bucket exists with proper policies
4. [ ] Stripe webhook configured (if using payments)
5. [ ] Test CSV upload works end-to-end
6. [ ] Properties appear in Leads page
7. [ ] Geocoding runs (check logs)
8. [ ] Insights are generated
