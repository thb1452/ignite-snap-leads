#!/usr/bin/env bash
# =============================================================================
# run-migration.sh
# Drive the migrate-to-external edge function from the VM, table by table,
# with verify gates between tables. Designed to be safely re-runnable.
# =============================================================================
#
# REQUIRED ENV (export these on the VM before running):
#   SOURCE_PROJECT_REF   e.g. ojyxblegxpdgaqiscxpz (Lovable / source)
#   SOURCE_ANON_KEY      anon key from Lovable project (used to invoke fn)
#   # The function itself reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
#   # (source side, auto-injected) and EXTERNAL_SUPABASE_URL /
#   # EXTERNAL_SUPABASE_SERVICE_ROLE_KEY (target side, set as Lovable secrets).
#
# OPTIONAL:
#   ONLY_TABLE           run a single table only (skip the full list)
#   START_FROM_TABLE     resume the full run starting at this table
#   DRY_RUN=1            print actions, don't execute migrate-table calls
#
# -----------------------------------------------------------------------------
# PRE-FLIGHT CHECKLIST (run on TARGET via MCP, do NOT bake into this script):
#
# 1) FK reference pre-check — confirm nothing OUTSIDE the truncate set points
#    INTO it. Any rows returned = blockers. Resolve before TRUNCATE.
#
#    SELECT conrelid::regclass AS referencing_table,
#           confrelid::regclass AS referenced_table,
#           conname
#    FROM pg_constraint
#    WHERE contype = 'f'
#      AND confrelid::regclass::text = ANY(ARRAY[
#        'properties','violations','foia_requests','targets','jurisdictions',
#        'owners','parcel_attributes','list_properties','foia_responses',
#        'foia_profiles','foia_invites','foia_assignments','foia_templates',
#        'foia_sources','press_accounts','press_rotation','va_credential_slots',
#        'pipeline_stages','pipeline_progress','subscription_plans',
#        'subscription_usage','property_contacts','enrichment_misses',
#        'enrichment_jobs','enrichment_sources','geocoding_jobs','error_logs'
#      ])
#      AND conrelid::regclass::text NOT IN (
#        'properties','violations','foia_requests','targets','jurisdictions',
#        'owners','parcel_attributes','list_properties','foia_responses',
#        'foia_profiles','foia_invites','foia_assignments','foia_templates',
#        'foia_sources','press_accounts','press_rotation','va_credential_slots',
#        'pipeline_stages','pipeline_progress','subscription_plans',
#        'subscription_usage','property_contacts','enrichment_misses',
#        'enrichment_jobs','enrichment_sources','geocoding_jobs','error_logs'
#      );
#
# 2) TRUNCATE (children → parents, RESTART IDENTITY CASCADE belt+suspenders):
#
#    TRUNCATE
#      list_properties, violations, property_contacts, owners, parcel_attributes,
#      enrichment_misses, enrichment_jobs, enrichment_sources,
#      foia_responses, foia_assignments, foia_invites, foia_requests,
#      foia_templates, foia_sources, foia_profiles,
#      targets, press_rotation, va_credential_slots, press_accounts,
#      pipeline_progress, pipeline_stages,
#      subscription_usage, subscription_plans,
#      geocoding_jobs, error_logs,
#      properties, jurisdictions
#    RESTART IDENTITY CASCADE;
#
# 3) Confirm Sage tables UNTOUCHED on target:
#    SELECT 'cash_buyers' AS t, count(*) FROM cash_buyers
#    UNION ALL SELECT 'buyer_purchases', count(*) FROM buyer_purchases;
#    (must match pre-truncate counts)
# =============================================================================

set -euo pipefail

: "${SOURCE_PROJECT_REF:?must export SOURCE_PROJECT_REF}"
: "${SOURCE_ANON_KEY:?must export SOURCE_ANON_KEY}"

FN_URL="https://${SOURCE_PROJECT_REF}.supabase.co/functions/v1/migrate-to-external"
LOG_FILE="migration-$(date -u +%Y%m%dT%H%M%SZ).log"

# Tables in FK-safe insert order (matches edge function TABLES_TO_MIGRATE).
TABLES=(
  jurisdictions
  properties
  violations
  targets
  foia_templates
  foia_sources
  foia_profiles
  foia_requests
  foia_responses
  foia_assignments
  foia_invites
  list_properties
  property_contacts
  owners
  parcel_attributes
  enrichment_misses
  enrichment_jobs
  enrichment_sources
  geocoding_jobs
  press_accounts
  press_rotation
  va_credential_slots
  pipeline_stages
  pipeline_progress
  subscription_plans
  subscription_usage
  error_logs
)

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"; }

call_fn() {
  # $1 = JSON body
  curl -sS -X POST "$FN_URL" \
    -H "Authorization: Bearer ${SOURCE_ANON_KEY}" \
    -H "apikey: ${SOURCE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    --max-time 120 \
    -d "$1"
}

migrate_one_table() {
  local table="$1"
  local cursor=""
  local total=0
  local started_at
  started_at=$(date +%s)

  log "▶ START $table"

  while :; do
    local body
    if [[ -z "$cursor" ]]; then
      body=$(printf '{"action":"migrate-table","table":"%s"}' "$table")
    else
      body=$(printf '{"action":"migrate-table","table":"%s","cursor":"%s"}' "$table" "$cursor")
    fi

    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      log "  DRY_RUN body=$body"
      break
    fi

    local resp
    resp=$(call_fn "$body") || { log "  ✗ curl failed for $table cursor=$cursor"; return 1; }

    # Parse with jq; bail if jq missing.
    if ! command -v jq >/dev/null; then
      log "  jq required — install with: apt-get install -y jq"; exit 1
    fi

    local status rows has_more next err
    status=$(echo "$resp" | jq -r '.status // "error"')
    err=$(echo "$resp"    | jq -r '.error  // empty')
    rows=$(echo "$resp"   | jq -r '.rowsMigrated // 0')
    has_more=$(echo "$resp" | jq -r '.hasMore // false')
    next=$(echo "$resp"   | jq -r '.nextCursor // empty')

    if [[ "$status" != "success" ]]; then
      log "  ✗ ERROR on $table cursor=$cursor :: $err"
      log "  raw: $resp"
      return 1
    fi

    total=$(( total + rows ))
    local elapsed=$(( $(date +%s) - started_at ))
    local rate=0
    [[ $elapsed -gt 0 ]] && rate=$(( total / elapsed ))
    log "  + $rows rows (total=$total, ${rate} rows/s, cursor=$next)"

    [[ "$has_more" == "true" ]] || break
    cursor="$next"
  done

  log "✓ DONE $table — migrated $total rows"

  # Verify gate
  log "  verifying $table…"
  local vresp
  vresp=$(call_fn "$(printf '{"action":"verify","table":"%s"}' "$table")") \
    || { log "  ✗ verify call failed"; return 1; }

  local src tgt within
  src=$(echo "$vresp"    | jq -r '.source')
  tgt=$(echo "$vresp"    | jq -r '.target')
  within=$(echo "$vresp" | jq -r '.withinThreshold')

  log "  verify: source=$src target=$tgt withinThreshold=$within"

  if [[ "$within" != "true" ]]; then
    log "  ✗ DRIFT EXCEEDED for $table — aborting run"
    return 1
  fi
  log "──────────────────────────────────────────────"
  return 0
}

main() {
  log "=== Migration run starting ==="
  log "FN_URL=$FN_URL"
  log "LOG_FILE=$LOG_FILE"

  local run_list=("${TABLES[@]}")

  if [[ -n "${ONLY_TABLE:-}" ]]; then
    run_list=("$ONLY_TABLE")
    log "ONLY_TABLE set — running just: $ONLY_TABLE"
  elif [[ -n "${START_FROM_TABLE:-}" ]]; then
    local idx=-1
    for i in "${!TABLES[@]}"; do
      [[ "${TABLES[$i]}" == "$START_FROM_TABLE" ]] && { idx=$i; break; }
    done
    [[ $idx -lt 0 ]] && { log "START_FROM_TABLE '$START_FROM_TABLE' not in list"; exit 1; }
    run_list=("${TABLES[@]:$idx}")
    log "Resuming from: $START_FROM_TABLE (${#run_list[@]} tables)"
  fi

  for t in "${run_list[@]}"; do
    if ! migrate_one_table "$t"; then
      log "=== ABORTED at $t ==="
      exit 1
    fi
  done

  log "=== Migration run COMPLETE ==="
}

main "$@"
