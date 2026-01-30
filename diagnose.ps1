# Quick Diagnostic Script for "Failed to fetch" Error (Windows PowerShell)
# Usage: .\diagnose.ps1

Write-Host "🔍 Noble Care Academy - Backend Connectivity Diagnostic" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
Write-Host "1️⃣  Checking .env file..." -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host "   ✅ .env file exists" -ForegroundColor Green
    
    $envContent = Get-Content .env -Raw
    if ($envContent -match "FIREBASE_PROJECT_ID") {
        Write-Host "   ✅ FIREBASE_PROJECT_ID is set" -ForegroundColor Green
    } else {
        Write-Host "   ❌ FIREBASE_PROJECT_ID is missing" -ForegroundColor Red
    }
    
    if ($envContent -match "FIREBASE_SERVICE_ACCOUNT_KEY") {
        Write-Host "   ✅ FIREBASE_SERVICE_ACCOUNT_KEY is set" -ForegroundColor Green
    } else {
        Write-Host "   ❌ FIREBASE_SERVICE_ACCOUNT_KEY is missing" -ForegroundColor Red
    }
} else {
    Write-Host "   ❌ .env file NOT found!" -ForegroundColor Red
    Write-Host "   👉 Create .env file with Firebase credentials" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check if backend is running
Write-Host "2️⃣  Checking if backend is running on port 3001..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -ErrorAction Stop
    Write-Host "   ✅ Backend is running!" -ForegroundColor Green
    Write-Host "   Health check response: $($response.Content)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Backend is NOT running!" -ForegroundColor Red
    Write-Host "   👉 Run in a new terminal: npm run server:dev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Port status:" -ForegroundColor Yellow
    $portInUse = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
    if ($portInUse) {
        Write-Host "   ⚠️  Port 3001 is in use by process ID: $($portInUse.OwningProcess)" -ForegroundColor Red
        Write-Host "   Kill it with: taskkill /PID $($portInUse.OwningProcess) /F" -ForegroundColor Yellow
    }
    exit 1
}

Write-Host ""

# Check .env.local
Write-Host "3️⃣  Checking .env.local for backend URL..." -ForegroundColor Yellow
if (Test-Path .env.local) {
    $envLocal = Get-Content .env.local -Raw
    if ($envLocal -match "VITE_BACKEND_URL") {
        Write-Host "   ✅ VITE_BACKEND_URL is set" -ForegroundColor Green
        $backendUrl = ($envLocal -match "VITE_BACKEND_URL=(.*)") | ForEach-Object { $matches[1] }
        Write-Host "   Value: $backendUrl" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  VITE_BACKEND_URL not found" -ForegroundColor Yellow
        Write-Host "   👉 Add to .env.local: VITE_BACKEND_URL=http://localhost:3001" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  .env.local not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ All checks passed! Backend should work." -ForegroundColor Green
Write-Host ""
Write-Host "If still getting 'Failed to fetch':" -ForegroundColor Yellow
Write-Host "1. Restart frontend: Kill and run 'npm run dev'" -ForegroundColor Yellow
Write-Host "2. Check browser console (F12) for errors" -ForegroundColor Yellow
Write-Host "3. Check backend console for error messages" -ForegroundColor Yellow
