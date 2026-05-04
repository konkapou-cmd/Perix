# Perix Web Deployment Guide

## Web Build Status: ✅ SUCCESS

The web build has been successfully exported to `/app/frontend/dist`.

---

## DNS Records for pointer.gr

Add these records (using full domain names):

| Τύπος | Όνομα | Τιμή | TTL |
|-------|-------|------|-----|
| **A** | `perix.top` | `76.76.21.21` | 14400 |
| **CNAME** | `www.perix.top` | `cname.vercel-dns.com` | 14400 |
| **CNAME** | `app.perix.top` | `cname.vercel-dns.com` | 14400 |

Keep your existing `api.perix.top` record!

---

## Deployment Steps

### Step 1: Save to GitHub
Click **"Save to Github"** button in Emergent chat interface.

### Step 2: Import to Vercel

#### For Landing Page (perix.top):
1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Configure:
   - **Root Directory:** `landing-page`
   - **Build Command:** (leave empty)
   - **Output Directory:** (leave empty)
4. Add domain: `perix.top`

#### For Web App (app.perix.top):
1. Create another Vercel project
2. Import same GitHub repo
3. Configure:
   - **Root Directory:** `frontend`
   - **Build Command:** `npx expo export --platform web`
   - **Output Directory:** `dist`
4. Add Environment Variables:
   ```
   EXPO_PUBLIC_BACKEND_URL=https://api.perix.top
   ```
5. Add domain: `app.perix.top`

---

## What's Included

### Landing Page Features:
- Professional dark theme
- Hero section with phone mockup animation
- Features grid
- Stats section
- Download buttons (App Store, Google Play)
- Web app CTA

### Web App Features:
- Full app experience in browser
- User authentication
- Posts and feed
- Profile management
- Messages
- Business/Artist discovery
- Stories (view only)

### Web Limitations:
- Video/Voice calls not available (shows download prompt)
- Push notifications not available
- Some native features may have reduced functionality

---

## Files Modified for Web Compatibility:
- `app/call.tsx` - Web version showing "download app" message
- `lib/agoraService.ts` - Stub implementation for web
- `metro.config.js` - Web platform configuration
