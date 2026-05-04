# Perix Build Instructions

## Quick Build Commands for Windows

### Prerequisites
1. Install Node.js (v18+)
2. Install EAS CLI: `npm install -g eas-cli`
3. Login to EAS: `eas login`

### Build for Android (APK for testing)

Open PowerShell/Command Prompt and run:

```powershell
# Navigate to frontend directory
cd frontend

# Set environment variable to bypass VCS check (IMPORTANT for Windows)
set EAS_NO_VCS=1

# Build Android APK for testing
eas build --platform android --profile preview
```

### Build for iOS (Simulator)

```powershell
cd frontend
set EAS_NO_VCS=1
eas build --platform ios --profile preview
```

### Common Issues & Solutions

#### Issue: "VCS check failed" or git-related errors
**Solution:** Always set `EAS_NO_VCS=1` before running build commands:
```powershell
set EAS_NO_VCS=1
```

#### Issue: Build fails with dependency errors
**Solution:** Clear cache and reinstall:
```powershell
cd frontend
rd /s /q node_modules
rd /s /q .expo
yarn install
```

#### Issue: Metro bundler issues
**Solution:** Reset Metro cache:
```powershell
yarn start --clear
```

### Build Profiles (eas.json)

The project includes these build profiles:
- `development`: For development builds with dev client
- `preview`: For internal testing (generates APK)
- `production`: For store releases (generates AAB)

### Testing Push Notifications

Push notifications require:
1. A physical device (not emulator/simulator)
2. The app to be built with EAS (not Expo Go)
3. Valid Expo Push Token

The app automatically:
- Requests notification permissions on login
- Registers the device push token with the backend
- Handles incoming notifications for calls and messages

### Video Calls (Agora)

Video calls use Agora SDK which requires:
1. Native build (not Expo Go)
2. Camera/Microphone permissions granted
3. Valid Agora token from backend

Test video calls:
1. Login with two different accounts on two devices
2. Navigate to Messages > Select a user > Call button
3. Accept the call on the receiving device

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `set EAS_NO_VCS=1` | Bypass VCS check (run first!) |
| `eas build -p android --profile preview` | Build Android APK |
| `eas build -p ios --profile preview` | Build iOS for simulator |
| `eas submit -p android` | Submit to Play Store |
| `eas submit -p ios` | Submit to App Store |

For any build issues, check:
- https://docs.expo.dev/build/troubleshooting/
- https://docs.expo.dev/eas/
