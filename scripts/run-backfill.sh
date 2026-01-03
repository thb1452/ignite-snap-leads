#!/bin/bash

# Backfill Property Aggregates Script
# Run this to populate violation aggregates for all existing properties

set -e

echo "========================================="
echo "Property Aggregates Backfill Script"
echo "========================================="
echo ""

# Configuration
SUPABASE_PROJECT_URL="${SUPABASE_URL:-http://localhost:54321}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"
FUNCTION_URL="${SUPABASE_PROJECT_URL}/functions/v1/backfill-property-aggregates"
BATCH_SIZE=100
TOTAL_PROPERTIES=220000  # Approximate
DRY_RUN=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true ;;
        --batch-size) BATCH_SIZE="$2"; shift ;;
        --city) CITY_FILTER="$2"; shift ;;
        --state) STATE_FILTER="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Validation
if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "Error: SUPABASE_ANON_KEY environment variable is required"
    echo "Set it with: export SUPABASE_ANON_KEY=your_key_here"
    exit 1
fi

echo "Configuration:"
echo "  URL: $FUNCTION_URL"
echo "  Batch Size: $BATCH_SIZE"
echo "  Dry Run: $DRY_RUN"
if [ ! -z "$CITY_FILTER" ]; then
    echo "  City Filter: $CITY_FILTER"
fi
if [ ! -z "$STATE_FILTER" ]; then
    echo "  State Filter: $STATE_FILTER"
fi
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "⚠️  DRY RUN MODE - No data will be modified"
    echo ""
fi

# Confirmation prompt
read -p "Continue with backfill? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo "Backfill cancelled"
    exit 0
fi

echo "Starting backfill..."
echo ""

# Track progress
OFFSET=0
TOTAL_PROCESSED=0
TOTAL_UPDATED=0
TOTAL_SKIPPED=0
TOTAL_ERRORS=0

while true; do
    echo "----------------------------------------"
    echo "Processing batch starting at offset $OFFSET..."

    # Build request body
    REQUEST_BODY="{\"batchSize\": $BATCH_SIZE, \"startOffset\": $OFFSET, \"dryRun\": $DRY_RUN"
    if [ ! -z "$CITY_FILTER" ]; then
        REQUEST_BODY="$REQUEST_BODY, \"cityFilter\": \"$CITY_FILTER\""
    fi
    if [ ! -z "$STATE_FILTER" ]; then
        REQUEST_BODY="$REQUEST_BODY, \"stateFilter\": \"$STATE_FILTER\""
    fi
    REQUEST_BODY="$REQUEST_BODY}"

    # Call function
    RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "$REQUEST_BODY")

    # Parse response
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    PROCESSED=$(echo "$RESPONSE" | jq -r '.processed')
    UPDATED=$(echo "$RESPONSE" | jq -r '.updated')
    SKIPPED=$(echo "$RESPONSE" | jq -r '.skipped')
    ERRORS=$(echo "$RESPONSE" | jq -r '.errors')
    PERCENTAGE=$(echo "$RESPONSE" | jq -r '.progress.percentage')

    if [ "$SUCCESS" != "true" ]; then
        echo "❌ Error in batch:"
        echo "$RESPONSE" | jq '.'
        exit 1
    fi

    # Update totals
    TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
    TOTAL_UPDATED=$((TOTAL_UPDATED + UPDATED))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))
    TOTAL_ERRORS=$((TOTAL_ERRORS + ERRORS))

    echo "✓ Batch complete:"
    echo "  Processed: $PROCESSED"
    echo "  Updated: $UPDATED"
    echo "  Skipped: $SKIPPED (no violations)"
    echo "  Errors: $ERRORS"
    echo "  Overall Progress: $PERCENTAGE%"

    # Check if done
    if [ "$PROCESSED" -lt "$BATCH_SIZE" ]; then
        echo ""
        echo "========================================="
        echo "✅ Backfill Complete!"
        echo "========================================="
        echo "Total Properties Processed: $TOTAL_PROCESSED"
        echo "Total Updated: $TOTAL_UPDATED"
        echo "Total Skipped: $TOTAL_SKIPPED"
        echo "Total Errors: $TOTAL_ERRORS"
        echo "========================================="
        break
    fi

    # Move to next batch
    OFFSET=$((OFFSET + BATCH_SIZE))

    # Small delay to avoid overwhelming the database
    sleep 1
done

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "Dry run complete. Run without --dry-run to apply changes."
fi
