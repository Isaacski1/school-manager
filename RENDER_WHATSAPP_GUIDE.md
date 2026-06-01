# WhatsApp Pairing on Render Free Tier - Known Limitations & Solutions

## Problem
When using Render's **free tier**, WhatsApp sessions may become inactive after:
- Server spindown (after 15 minutes of no traffic)
- Server restart
- Network interruptions

This is because Render's free tier has ephemeral containers that spin down to save resources.

## Symptoms
1. ✅ WhatsApp pairs successfully
2. ✅ You can send messages while server is active
3. ❌ After ~15 minutes of inactivity, WhatsApp becomes "Disconnected"
4. ❌ You need to pair again to send messages

## Root Cause
- **Render Free Tier**: Spins down dynos after 15 minutes of inactivity
- **Server Restart**: WhatsApp client process is destroyed
- **Session Files**: Saved in container filesystem, but client is gone
- **Result**: When frontend sends next request, server restarts and WhatsApp is disconnected

## Solutions

### Solution 1: Upgrade to Render Paid Plan (Recommended)
Upgrade from free to **Render Starter** ($7/month):
- ✅ Always-on container (no spindown)
- ✅ WhatsApp stays connected permanently
- ✅ Better performance overall
- ✅ Worth it for production use

**Steps:**
1. Go to https://dashboard.render.com/
2. Select your backend service
3. Click "Settings" → "Plan" → Upgrade to Starter

---

### Solution 2: Manual Reconnect (Free Tier Workaround)
If staying on free tier, use this workaround:

1. **After server spindown**, WhatsApp shows "Disconnected"
2. Click **"Start Pairing"** button to reconnect
3. WhatsApp will try to use the saved session (no QR needed)
4. If it needs QR again, scan it
5. Ready to use for another ~15 minutes

**Note:** QR polling now takes **2 minutes** between refreshes to reduce server load and help avoid spindown.

---

### Solution 3: Keep Server Warm (Free Tier Advanced)
Prevent spindown by sending periodic requests every 14 minutes:

**Option A: Browser Tab Keep-Alive**
- Keep the WhatsApp Pairing page open in a browser tab
- Polling requests keep the server warm

**Option B: External Monitor (UptimeRobot)**
1. Go to https://uptimerobot.com (free account)
2. Create new "Monitor" → HTTP(s)
3. URL: `https://your-backend.onrender.com/api/health`
4. Interval: 10 minutes
5. Server stays warm → WhatsApp stays connected

---

## Changes Made (June 2026)

### Frontend (WhatsAppPairing.tsx)
- ✅ QR code polling: Changed from **3s to 2 minutes** (slower = less server load)
- ✅ Connection polling: Remains fast (1s) until QR appears

### Backend (whatsappService.js)
- ✅ Auto-reconnect: If disconnected but saved session exists, tries to reconnect automatically
- ✅ Session detection: Checks `./whatsapp-session/` folder on every status check
- ✅ Memory optimization: Added Puppeteer flags to reduce memory usage

---

## Best Practice for Production

| Plan | Cost | WhatsApp Uptime | Recommendation |
|------|------|-----------------|-----------------|
| **Free Tier** | $0 | 50-60% (spindown) | Development only |
| **Starter** | $7/month | 99%+ (always-on) | ✅ Production |
| **Standard** | $25/month | 99%+ (high compute) | High-volume schools |

---

## Troubleshooting

### WhatsApp says "Unavailable"
- Check backend logs: `Ensure whatsapp-web.js and qrcode are installed`
- Solution: Redeploy backend with `npm install`

### WhatsApp shows "Disconnected" after 15 minutes
- This is **expected on free tier**
- Click "Start Pairing" → WhatsApp auto-reconnects if session still exists
- Or: Upgrade to paid plan

### QR code stuck at "Waiting for QR code..."
- Slow internet: Server might be spinning up (wait 30-60 seconds)
- Free tier container cold start: Takes time on first request
- Solution: Click "Refresh" button to retry

### Multiple server processes causing disconnects
- Don't run multiple backend instances against same `whatsapp-session` folder
- Render auto-scales on paid plans → use caution if scaling enabled

---

## Environment Variables

The backend now defaults to auto-initialize WhatsApp on startup, which helps reconnect the session when Render wakes the container.

To disable this behavior, add this to your backend `.env`:
```
WHATSAPP_AUTO_INIT=false
# Set to 'false' only if you want to prevent WhatsApp from trying to start automatically on server restart.
```

---

## Costs Comparison
- **Render Free**: $0/month (spindown every 15 min)
- **Render Starter**: $7/month (always-on)
- **Alternative: Railway**: Similar pricing, check https://railway.app

---

## Summary
✅ Your fixes work correctly
✅ Free tier will always have spindown limitations
✅ Solutions: Upgrade ($7/month), manual reconnect, or keep-warm monitoring
