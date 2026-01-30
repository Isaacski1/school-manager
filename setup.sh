#!/bin/bash
# Quick Start Script for Local Development

echo "🚀 Noble Care Academy - Backend + Frontend Setup"
echo "================================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo ""
    echo "Please create .env file with:"
    echo "  PORT=3001"
    echo "  FIREBASE_PROJECT_ID=noble-care-management-system"
    echo "  FIREBASE_SERVICE_ACCOUNT_KEY={...}"
    echo ""
    echo "See BACKEND_SETUP.md for details"
    exit 1
fi

echo "✅ .env file found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run locally:"
echo "  Terminal 1: npm run dev (Frontend - port 3000)"
echo "  Terminal 2: npm run server (Backend - port 3001)"
echo ""
