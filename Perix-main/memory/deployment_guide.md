# Magdebar Deployment Guide

## Overview
This guide explains how to deploy the Magdebar social platform to production environments.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   React Native   │────▶│   FastAPI        │────▶│   MongoDB        │
│   (Expo)         │     │   Backend        │     │   Database       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                        │
        │                        ▼
        │                ┌──────────────────┐
        │                │   Cloudinary     │
        │                │   (Media)        │
        │                └──────────────────┘
        │
        ▼
┌──────────────────┐
│   App Stores     │
│   (iOS/Android)  │
└──────────────────┘
```

## Backend Deployment

### Environment Variables
Create a `.env` file with:

```env
# Required
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DB_NAME=magdebar_production

# Cloudinary (for media uploads)
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

# PayPal (for subscriptions)
PAYPAL_CLIENT_ID=<your_paypal_client_id>
PAYPAL_CLIENT_SECRET=<your_paypal_client_secret>
PAYPAL_BASE_URL=https://api-m.paypal.com  # Use sandbox URL for testing
```

### Docker Deployment

1. **Create Dockerfile** (in `/app/backend/`):
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

2. **Build and run**:
```bash
docker build -t magdebar-backend .
docker run -p 8001:8001 --env-file .env magdebar-backend
```

### Cloud Deployment Options

#### Option 1: Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### Option 2: Render
1. Create a new Web Service on render.com
2. Connect your GitHub repo
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Add environment variables

#### Option 3: AWS/GCP/Azure
Use container services (ECS, Cloud Run, Container Apps) with the Docker image.

## Frontend Deployment (Mobile Apps)

### Prerequisites
- Apple Developer Account ($99/year) for iOS
- Google Play Developer Account ($25 one-time) for Android
- EAS CLI: `npm install -g eas-cli`

### Configuration

1. **Update `app.json`**:
```json
{
  "expo": {
    "name": "Magdebar",
    "slug": "magdebar",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.magdebar",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.yourcompany.magdebar",
      "versionCode": 1
    }
  }
}
```

2. **Set production backend URL**:
Update `EXPO_PUBLIC_BACKEND_URL` in your environment or `app.json`:
```json
{
  "expo": {
    "extra": {
      "backendUrl": "https://api.magdebar.com"
    }
  }
}
```

### Build Process

1. **Configure EAS Build**:
```bash
eas build:configure
```

2. **Build for iOS**:
```bash
# Development build
eas build --platform ios --profile development

# Production build for App Store
eas build --platform ios --profile production
```

3. **Build for Android**:
```bash
# Development APK
eas build --platform android --profile development

# Production AAB for Play Store
eas build --platform android --profile production
```

### App Store Submission

#### iOS (App Store Connect)
1. Run: `eas submit --platform ios`
2. Or manually upload the `.ipa` via Transporter app
3. Complete App Store Connect listing (screenshots, description, etc.)
4. Submit for review

#### Android (Google Play Console)
1. Run: `eas submit --platform android`
2. Or manually upload the `.aab` to Play Console
3. Complete store listing
4. Submit for review

## Database Setup

### MongoDB Atlas (Recommended)
1. Create cluster at mongodb.com/cloud/atlas
2. Create database user
3. Whitelist IP addresses (or use 0.0.0.0/0 for all)
4. Get connection string

### Indexes
The backend automatically creates required indexes on startup:
- `businesses.location` (2dsphere for geo queries)

### Backup Strategy
```bash
# Manual backup
mongodump --uri="<MONGO_URL>" --out=backup-$(date +%Y%m%d)

# Restore
mongorestore --uri="<MONGO_URL>" backup-20240101/
```

## Third-Party Services Setup

### Cloudinary
1. Sign up at cloudinary.com
2. Get API credentials from Dashboard
3. Add to `CLOUDINARY_URL` env var

### PayPal
1. Create app at developer.paypal.com
2. Get Client ID and Secret
3. Use sandbox for testing, live for production

### Google Maps (for location features)
1. Create project in Google Cloud Console
2. Enable Maps JavaScript API, Places API
3. Create API key and restrict to your domains
4. Add to `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

## Monitoring & Logging

### Health Check Endpoint
```bash
curl https://your-api.com/api/
# Should return: {"message": "Social platform API"}
```

### Recommended Tools
- **Sentry**: Error tracking
- **DataDog/NewRelic**: APM
- **MongoDB Atlas**: Built-in monitoring

## Security Checklist

- [ ] Use HTTPS everywhere
- [ ] Set proper CORS origins (not `*` in production)
- [ ] Rotate API keys and secrets regularly
- [ ] Enable MongoDB authentication
- [ ] Set up rate limiting
- [ ] Regular security audits
- [ ] Keep dependencies updated

## Scaling Considerations

### Backend
- Use multiple instances behind a load balancer
- Implement Redis for session storage (if needed)
- Consider read replicas for MongoDB

### Frontend
- Use CDN for static assets
- Enable OTA updates via EAS Update

## Support

For issues:
1. Check `/api/docs` for API documentation
2. Review server logs
3. Check MongoDB connection
4. Verify environment variables
