#!/bin/bash

# Deploy all edge functions to Supabase
# Make sure you have the Supabase CLI installed and logged in

echo "======================================"
echo "Deploying Supabase Edge Functions"
echo "======================================"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo ""
    echo "Install it with:"
    echo "  npm install -g supabase"
    echo "  or"
    echo "  brew install supabase/tap/supabase"
    echo ""
    exit 1
fi

# Check if logged in
echo "📋 Checking Supabase login status..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase"
    echo ""
    echo "Login with:"
    echo "  supabase login"
    echo ""
    exit 1
fi

echo "✓ Supabase CLI ready"
echo ""

# Deploy the critical process-upload function
echo "🚀 Deploying process-upload function (contains the row limit fix)..."
supabase functions deploy process-upload

if [ $? -eq 0 ]; then
    echo "✓ process-upload deployed successfully"
else
    echo "❌ process-upload deployment failed"
    exit 1
fi

echo ""
echo "======================================"
echo "✓ Deployment Complete!"
echo "======================================"
echo ""
echo "The -1,000 properties bug should now be fixed."
echo "Try uploading your file again."
