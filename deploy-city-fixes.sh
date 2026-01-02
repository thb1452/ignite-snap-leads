#!/bin/bash
# Deploy city filter fixes and test the results

echo "=============================================="
echo "DEPLOYING CITY FILTER FIXES"
echo "=============================================="
echo ""

echo "Step 1: Checking Supabase connection..."
if ! command -v supabase &> /dev/null; then
    echo "❌ ERROR: Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

echo "Step 2: Pushing database migrations..."
echo "This will:"
echo "  - Clean garbage data from properties.city"
echo "  - Refresh materialized views"
echo "  - Improve materialized view validation"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Push migrations
supabase db push

if [ $? -ne 0 ]; then
    echo "❌ ERROR: Failed to push migrations"
    exit 1
fi

echo ""
echo "✅ Migrations deployed successfully!"
echo ""

echo "=============================================="
echo "TESTING RESULTS"
echo "=============================================="
echo ""
echo "Please test the following:"
echo ""
echo "1. Open your Snap app in the browser"
echo "2. Go to the Leads page"
echo "3. Check the State dropdown - should load in <100ms"
echo "4. Check the City dropdown - should load in <200ms"
echo "5. Verify city names look correct (no street addresses, etc.)"
echo ""
echo "Expected city examples:"
echo "  ✅ Phoenix"
echo "  ✅ Tucson"
echo "  ✅ Scottsdale"
echo "  ✅ San Francisco"
echo ""
echo "Should NOT see:"
echo "  ❌ 123 Main Street"
echo "  ❌ Property Address"
echo "  ❌ Overgrown weeds requiring..."
echo "  ❌ 12/15/2024"
echo ""
echo "=============================================="
