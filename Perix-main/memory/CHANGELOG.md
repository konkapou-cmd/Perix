# Perix Changelog

## Version 1.18.2 (December 2025)

### Translation Fixes
- **Fixed duplicate `locator` key in Greek translations** - Merged two conflicting locator objects that were causing translation keys to show raw instead of translated text on the search page
- Files affected: `frontend/i18n/locales/el.json`

### Video Improvements
- **Removed video upload size limit** - Now supports unlimited video file sizes (streaming upload handles any size)
- **Added visibility-based autoplay** - Videos on home feed now:
  - Auto-play when visible on screen (50%+ visible)
  - Auto-pause when scrolled out of view
  - Start muted by default
- Files affected: `frontend/lib/api.ts`, `frontend/components/VideoGalleryUpload.tsx`, `frontend/components/AdaptiveVideo.tsx`, `frontend/app/(tabs)/home.tsx`

---

## Version 1.18.1 (December 2025)

### Critical Bug Fix
- **Large Video Upload Memory Crash FIXED**
  - Root cause: `uploadVideoChunked()` was loading entire file into memory as base64
  - App crashed at ~57MB due to memory exhaustion
  - Fix: Rewrote to use `expo-file-system` streaming with position/length parameters
  - Now supports 300MB videos by reading only 5MB chunks at a time
  - Files affected: `frontend/lib/api.ts`

### Bug Fixes
- **Profile Video Gallery:** Fixed incorrect API function call (`updateUserProfile` → `updateProfileGallery`)
  - File: `frontend/app/(tabs)/profile.tsx`

### Features Restored
- **Video Captions on Profile Page** - Re-added caption support to VideoGalleryUpload component
  - New prop: `enableCaptions={true}` enables caption editing
  - New prop: `onCaptionChange` callback for custom save logic
  - Caption edit modal with 200 character limit
  - Captions display below video thumbnails and in fullscreen modal
  - Translations added for EN/GR
  - Files: `frontend/components/VideoGalleryUpload.tsx`, `frontend/app/(tabs)/profile.tsx`

### Android Play Store Optimizations
- **Version bump:** versionCode 21 → 22
- **Added permissions:** POST_NOTIFICATIONS, FOREGROUND_SERVICE, INTERNET, ACCESS_NETWORK_STATE, READ/WRITE_EXTERNAL_STORAGE
- **Enabled ProGuard & resource shrinking** for smaller APK size
- **Added largeHeap: true** for better memory handling with large videos
- **Disabled cleartext traffic** for security compliance
- **Added expo-av plugin** with proper microphone permission description
- **Added runtime version policy** for OTA updates
- **Configured EAS submit** for Play Store internal track

---

## Version 1.17.0 (March 2026)

### New Features
- **Full Onboarding Flow**
  - 4-step tutorial for new users
  - Feature slides with animated gradient icons
  - Permission requests (Camera, Location, Notifications)
  - Profile setup (Photo, Bio, Location)
  - Skip options and AsyncStorage persistence

- **Voice Messages in Chat**
  - Microphone button in chat (shows when text is empty)
  - Recording UI with duration timer
  - Audio upload to Cloudinary
  - Playback support in chat bubbles

### Enhancements
- Added data-testids for chat buttons (send, voice)
- Improved translations for messages namespace

### Backend
- Audio media type already supported in messages API

---

## Version 1.16.0 (March 2026)

### New Features
- **Chat Improvements**
  - Typing indicators (real-time)
  - Media messages (image/video)
  - Media preview in chat bubbles

- **Story Reactions**
  - Emoji reaction bar (❤️ 🔥 😍 😂 😮 👏)
  - API: `/api/stories/{id}/react`

- **Social Sharing**
  - ShareContent component for profiles and events
  - Multi-platform: WhatsApp, Instagram, Facebook, Twitter, Telegram
  - Deep linking support

- **Friend System Enhancements**
  - "Invite Friends" button on Profile page
  - Invite Contacts screen
  - Referral tracking system

### Testing
- Backend: 100% pass rate
- Frontend: 100% pass rate

---

## Version 1.15.0 (February 2026)

### Features
- Large file uploads (250MB)
- Events page redesign
- Activities: Private events & themes
- Business tagging for activities
