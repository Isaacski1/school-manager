#!/bin/bash
# Quick Diagnostic Script for "Failed to fetch" Error

echo "🔍 Noble Care Academy - Backend Connectivity Diagnostic"
echo "========================================================"
echo ""

# Check if .env exists
echo "1️⃣  Checking .env file..."
if [ -f .env ]; then
    echo "   ✅ .env file exists"
    if grep -q "FIREBASE_PROJECT_ID" .env; then
        echo "   ✅ FIREBASE_PROJECT_ID is set"
    else
        echo "   ❌ FIREBASE_PROJECT_ID is missing"
    fi
    if grep -q "FIREBASE_SERVICE_ACCOUNT_KEY" .env; then
        echo "   ✅ FIREBASE_SERVICE_ACCOUNT_KEY is set"
    else
        echo "   ❌ FIREBASE_SERVICE_ACCOUNT_KEY is missing"
    fi
else
    echo "   ❌ .env file NOT found!"
    echo "   👉 Create .env file with Firebase credentials"
    exit 1
fi

echo ""

# Check if backend is running
echo "2️⃣  Checking if backend is running on port 3001..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "   ✅ Backend is running!"
    HEALTH=$(curl -s http://localhost:3001/health)
    echo "   Health check response: $HEALTH"
else
    echo "   ❌ Backend is NOT running!"
    echo "   👉 Run: npm run server:dev"
    exit 1
fi

echo ""

# Check .env.local
echo "3️⃣  Checking .env.local for backend URL..."
if [ -f .env.local ]; then
    if grep -q "VITE_BACKEND_URL" .env.local; then
        BACKEND_URL=$(grep "VITE_BACKEND_URL" .env.local)
        echo "   ✅ VITE_BACKEND_URL is set"
        echo "   Value: $BACKEND_URL"
    else
        echo "   ⚠️  VITE_BACKEND_URL not found"
        echo "   👉 Add to .env.local: VITE_BACKEND_URL=http://localhost:3001"
    fi
else
    echo "   ⚠️  .env.local not found"
fi

echo ""
echo "✅ All checks passed! Backend should work."
echo ""
echo "If still getting 'Failed to fetch':"
echo "1. Restart frontend: Kill and run 'npm run dev'"
echo "2. Check browser console (F12) for errors"
echo "3. Check backend console for error messages"
