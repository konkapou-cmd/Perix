# Perix Build Instructions - Version 9

## What's New in Version 9

### Language Support (7 Languages)
- 🇬🇧 English
- 🇩🇪 Deutsch (German)
- 🇬🇷 Ελληνικά (Greek)
- 🇪🇸 Español (Spanish)
- 🇦🇱 Shqip (Albanian)
- 🇫🇷 Français (French)
- 🇮🇹 Italiano (Italian)

### Features
- Complete translations for all 818 keys in all 7 languages
- Auto-detection of device language
- Language picker in Profile settings

---

## Pre-Build Checklist

### 1. Verify Asset Files Exist
Make sure these files are in `assets/images/`:
- `prx-icon.png` (app icon)
- `prx-adaptive-icon.png` (Android adaptive icon)
- `prx-logo.jpg` (splash screen)
- `perix-logo.png` (favicon)

### 2. Verify google-services.json
Ensure `google-services.json` exists in the `frontend/` directory for Firebase.

---

## Android Build Instructions

### Option 1: EAS Build (Recommended)

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
yarn install

# Login to Expo (if not already)
npx eas login

# Build APK for testing
npx eas build --platform android --profile preview

# OR Build AAB for Play Store
npx eas build --platform android --profile production
```

### Option 2: Local Build

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
yarn install

# Prebuild native project
npx expo prebuild --platform android

# Build APK
cd android
./gradlew assembleRelease

# APK location: android/app/build/outputs/apk/release/app-release.apk
```

---

## iOS Build Instructions

### EAS Build

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
yarn install

# Login to Expo (if not already)
npx eas login

# Build for Simulator
npx eas build --platform ios --profile development

# Build for TestFlight/App Store
npx eas build --platform ios --profile production
```

### Local Build (Mac Required)

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
yarn install

# Prebuild native project
npx expo prebuild --platform ios

# Install CocoaPods
cd ios
pod install
cd ..

# Open in Xcode
open ios/perix.xcworkspace

# Build from Xcode (Product > Archive)
```

---

## Troubleshooting

### Build Fails with Splash Screen Error
If you see an error about splash screen image:
1. Verify `assets/images/prx-logo.jpg` exists
2. Check `app.json` has correct path:
```json
"expo-splash-screen": {
  "image": "./assets/images/prx-logo.jpg"
}
```

### Metro Bundler Issues
```bash
# Clear all caches
npx expo start --clear

# Or manually clear
rm -rf node_modules
rm -rf .expo
yarn install
```

### Android Gradle Issues
```bash
cd android
./gradlew clean
cd ..
npx expo prebuild --clean --platform android
```

### iOS Pod Issues
```bash
cd ios
rm -rf Pods Podfile.lock
pod install --repo-update
cd ..
```

---

## Railway Backend Deployment

### Required Environment Variables
Set these in Railway dashboard:

```
MONGO_URL=mongodb+srv://...
DB_NAME=perix
CLOUDINARY_URL=cloudinary://...
AGORA_APP_ID=e7f6e9aeecf14b2ba10e3f40be9f56e7
AGORA_APP_CERTIFICATE=your_certificate_here
JWT_SECRET=your_jwt_secret
```

### Deploy Command
```bash
cd backend
pip install -r requirements.txt
uvicorn src.server:app --host 0.0.0.0 --port 8001
```

---

## Version Info

```
App Version: 1.9.0
Android versionCode: 9
Bundle ID: com.perix.citysocial
```

---

## Testing After Build

### 1. Language Picker
- Go to Profile tab
- Scroll to Language section
- Test switching between all 7 languages
- Verify UI updates correctly

### 2. Video Uploads
- Try uploading a video from gallery
- Should work for files under 100MB

### 3. Calls (if Agora configured)
- Test voice and video calls
- Verify business hours restrictions work

### 4. Moderation Features
- Test Pause/Report user buttons
- Verify admin dashboard (admin users only)

---

## Support

If build issues persist:
1. Check Expo status: https://status.expo.dev
2. Clear all caches and rebuild
3. Verify all environment variables are set
