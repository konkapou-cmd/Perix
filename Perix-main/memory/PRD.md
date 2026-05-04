# Perix - Mobile Social Media Platform

## Current Version
- **App Version:** 1.20.0
- **Android versionCode:** 20





### Report & Block User Functionality (COMPLETE - December 2025)
**Implemented GLOBAL hiding when a user is reported:**

When a user reports another user:
- The reported user's account is **IMMEDIATELY HIDDEN GLOBALLY** from everyone (not just the reporter)
- ALL their content is hidden: posts, stories, activities, businesses, artists, events
- The reporter also adds the user to their personal `blocked_users` list (persists even if admin restores the user)
- Only an admin can restore the user's visibility

**What Gets Hidden When a User is Reported:**
1. User account (`is_hidden: true`)
2. All their posts (`is_hidden: true`)
3. All their stories (`is_hidden: true`)
4. All their activities (`is_hidden: true`)
5. All their businesses (`is_hidden: true`)
6. All their artists (`is_hidden: true`)
7. All their events (`is_hidden: true`)

**Backend Endpoints:**
- `POST /api/users/report` - Report a user (hides them globally + adds to reporter's blocked list)
- `GET /api/users/blocked` - Get list of users the current user has blocked
- `POST /api/users/unblock/{user_id}` - Remove a user from personal blocked list (doesn't restore global visibility)

**Content Filtering Applied To:**
- `/api/posts` - Filters out posts with `is_hidden: true` and posts from hidden/blocked users
- `/api/stories` and `/api/stories/grouped` - Filters out hidden stories and from hidden/blocked users
- `/api/feed/home` - Excludes hidden posts, stories, events, businesses, artists
- `/api/users/{id}/public` - Returns 403 "This profile is currently unavailable" for hidden users

**Database Changes:**
- Added `blocked_users` array field to user documents (reporter's personal block list)
- Uses existing `is_hidden` field on users/posts/stories/etc. for global hiding

**Admin Restore Capability:**
- Admin can use existing admin dashboard to unhide users via `POST /api/admin/users/{user_id}/hide` endpoint with `unhide` action
- This removes the `is_hidden` flag, making the user visible again globally

**Translations Added:**
- All 10 languages: en, el, de, es, fr, it, pl, ru, sq, sr
- Keys: reportSuccess, reportSuccessGlobal, blocked, blockedUsers, unblock, unblockConfirm, unblockSuccess, noBlockedUsers, userBlocked, userHiddenGlobally

## Session Updates (December 2025 - Current)

### Backlog Features Completed (December 2025)

**1. Privacy Policy Page (`frontend/app/privacy-policy.tsx`)**
- Full privacy policy with 9 sections: Data Collection, Usage, Sharing, Security, Cookies, User Rights, Children's Privacy, Changes, Contact
- GDPR compliance notice
- Accessible from Profile > More Options

**2. Promoter Registration (`frontend/app/promoter.tsx`)**
- Users can register as promoters from their profile
- Registration form: name, email, phone, bank details
- Promoter dashboard shows: referral code, total referrals, earnings, pending payouts
- Copy and share referral code functionality
- Step-by-step "How It Works" guide
- Recent referrals list

**3. Transaction History in Admin Dashboard**
- New "Transactions" tab added to admin dashboard
- Shows all payment transactions with status (paid/pending)
- Revenue summary: total revenue, paid count, pending count
- Transaction details: amount, plan type, promoter share, date

**4. Profile "More Options" Section**
- Added new section in user profile before Logout
- Quick links to Promoter Program and Privacy Policy

**Backend Routes Added:**
- `GET /api/stripe/admin/transactions` - List all payment transactions
- `GET /api/stripe/admin/stats` - Get monetization overview stats

### Stripe Subscription System with Promoter Revenue Sharing (COMPLETE - December 2025)
**Implemented full subscription system with Stripe and affiliate tracking:**

**Pricing Structure:**
- **Regular Pricing:**
  - Monthly: €29.90/month
  - Yearly: €299.00/year (2 months free)
- **With MagdeburgPro Voucher:**
  - Monthly: €14.99/month
  - Yearly: €149.90/year (2 months free)
- Revenue Split: 70% Platform / 30% Promoter

**Backend Routes (`backend/routes/stripe_subscriptions.py`):**
- `GET /api/stripe/plans` - Get available subscription plans
- `POST /api/stripe/checkout/create` - Create Stripe checkout session
- `GET /api/stripe/checkout/status/{session_id}` - Check payment status
- `GET /api/stripe/voucher/check/{code}` - Validate voucher code
- `POST /api/stripe/voucher/apply` - Apply free months voucher
- `POST /api/stripe/promoters/register` - Register as promoter
- `GET /api/stripe/promoters/me` - Get promoter profile & earnings
- `GET /api/stripe/promoters/validate/{code}` - Validate promoter code
- `POST /api/stripe/webhook` - Handle Stripe webhooks
- `GET /api/stripe/admin/promoters` - List all promoters (admin)
- `POST /api/stripe/admin/promoters/{id}/payout` - Process payout (admin)

**Voucher Codes:**
- `MAGDEBURGPRO` - Special pricing (€14.99/mo, €149.90/yr)
- `2SPECIAL` - 2 months free subscription

**Frontend Updates (`frontend/app/subscription.tsx`):**
- Updated to use Stripe instead of PayPal
- Added voucher code validation and application
- Added promoter/referral code validation
- Live price updates when voucher is applied
- Payment status polling after checkout return
- Price summary with savings display

**Database Collections:**
- `payment_transactions` - Tracks all payment attempts
- `promoters` - Stores promoter/affiliate data
- `promoter_payouts` - Records payout history
- `voucher_uses` - Tracks voucher redemptions

### InlineThemeBar Reset Button (COMPLETE - December 2025)
**Added "Reset to Default" functionality:**
- Added `DEFAULT_THEME` constant with standard dark theme values
- Added reset button (refresh icon) in collapsed bar
- `resetToDefault()` function resets all colors to defaults
- User must tap Save to persist the reset

### InlineThemeBar Component Integration (COMPLETE - December 2025)
**Added compact inline theme editor to Artist and Business dashboards:**
- **Component Location:** `frontend/components/InlineThemeBar.tsx`
- **Features:**
  - Collapsible theme editor bar (tap to expand)
  - 3 tabs: Presets | Colors | Gradient
  - 8 Quick color presets (Ocean, Sunset, Forest, Royal, Flame, Midnight, Rose, Neon)
  - Individual color selection for: Background, Primary, Text, Card
  - Gradient toggle with start/end color pickers
  - Live preview showing how theme will appear
  - Save button with loading state
- **Integration:**
  - `frontend/app/artist-dashboard.tsx` - Added to Overview tab after Profile Management section
  - `frontend/app/business-dashboard.tsx` - Added to Overview tab after Profile section
- **State Management:** Theme state, handlers, and API calls added to both dashboards
- **API Endpoints Used:**
  - `PUT /api/artists/{id}/theme`
  - `PUT /api/businesses/{id}/theme`

### Video Upload Fix (PENDING USER VERIFICATION - December 2025)
**CRITICAL FIX: Rewrote chunked video upload to fix iOS compatibility issue**
- **Problem:** Previous implementation used `FileSystem.readAsStringAsync` with `position`/`length` parameters, which DON'T WORK on iOS (they return the entire file, causing memory exhaustion)
- **Solution:** New implementation uses:
  1. `FileSystem.uploadAsync` for files under 50MB (most reliable, native streaming)
  2. Full file read + string chunking for larger files (fallback for >50MB files)
- **Files Changed:** `frontend/lib/api.ts` - Complete rewrite of `uploadVideoChunked()` function
- **Status:** Code complete, requires APK rebuild and user testing

### Theme Customization Feature - ENHANCED (COMPLETE - December 2025)
**Full profile theme customization system with deep customization:**
- **Backend:** 
  - `PUT /api/profiles/theme` endpoint for saving theme settings
  - `ThemeSettings` model in `backend/models/user.py`
  - `build_user_public()` updated to include theme in user response
  - Added `is_admin` field to `UserPublic` model for admin checks
- **Frontend (`frontend/components/ThemeCustomizer.tsx`):**
  - **3 Tab Interface:** Presets | Colors | Advanced
  - **10 Color Presets:** Ocean, Sunset, Forest, Royal, Flame, Midnight, Rose, Neon, Warm, Default
  - **45+ Custom Colors** in the color picker grid
  - **Custom Hex Input** - Enter any hex color code
  - **Live Preview** with avatar, username, bio, card, and buttons
  - **Gradient Support** - Enable gradient backgrounds with start/end color selection
- **Theme Applied to Profile Views (`frontend/app/user/[id].tsx`):**
  - Visitors now see the user's custom theme colors when viewing their profile
  - Dynamic background color/gradient applied to SafeAreaView
  - Theme colors applied to: cards, text, titles, buttons, icons
  - Gradient backgrounds render using LinearGradient when enabled
- **Theme Options:**
  - Background color, Primary (buttons), Secondary, Text color
  - Card background color
  - Gradient start/end colors with toggle
- **Translations:** Added comprehensive theme section to `en.json` and `el.json`

### Hardware Back Button Fix (COMPLETE - December 2025)
**Improved Android hardware back button handling:**
- Added handling for modal/editor screens (media-editor, camera, story screens)
- Added handling for locator/search tab navigation
- Added handling for settings and notifications screens
- Modal screens now properly close and return to previous screen
- Locator/search tab now returns to home on back press
- **Files Changed:** `frontend/app/_layout.tsx`

### Story Editor UI Improvements (COMPLETE - December 2025)
**Made story editor more compact and user-friendly:**
- Reduced toolbar tab padding and gap for more screen space
- Added active state background highlight on selected tabs
- Smaller, more compact color buttons (24px vs 28px)
- Smaller font buttons with tighter spacing
- Compact size controls (36px vs 44px)
- Reduced tool labels text size for cleaner look
- **Files Changed:** `frontend/app/media-editor.tsx`

### Profile Gallery Verification (COMPLETE - December 2025)
- Verified gallery images display correctly on user profiles
- API endpoint `/api/users/{user_id}/public` returns `gallery_images` array
- Test confirms 2 gallery images returned correctly
- Fixed hidden user check issue that was blocking profile access

### Friend Request Notification Verification (COMPLETE - December 2025)
- Reviewed notification logic in `backend/routes/notifications.py`
- Notification correctly shows "wants to connect with you" for pending requests
- Logic properly identifies sender vs receiver for notifications


### Theme Applied to All Profile Types (COMPLETE - December 2025)
**Extended theme support to User, Business, and Artist profiles:**
- **Backend Changes:**
  - Added `ThemeSettings` import to `models/business.py` and `models/artist.py`
  - Added `theme` field to `BusinessResponse` and `ArtistResponse` models
  - Added `PUT /api/businesses/{id}/theme` endpoint
  - Added `PUT /api/artists/{id}/theme` endpoint
  - Updated `build_business_response()` to include theme
- **Frontend API:**
  - Added `updateBusinessTheme` and `updateArtistTheme` API functions in `lib/api.ts`
  - Updated `Business` and `Artist` types to include `theme?: ProfileTheme`
- **Themed Profile Pages:**
  - `frontend/app/user/[id].tsx`: Dynamic theme for user profiles
  - `frontend/app/business/[id].tsx`: Dynamic theme for business profiles
  - `frontend/app/artist/[id].tsx`: Dynamic theme for artist profiles
- **Theme Features on All Profiles:**
  - Background color/gradient on SafeAreaView
  - Theme-colored text, buttons, icons
  - Card backgrounds and cover placeholders
  - Gradient backgrounds via LinearGradient when enabled

## Latest Updates (December 2025)

### Video Gallery Upload System Rebuilt (COMPLETE - December 2025)
**Created new reusable VideoGalleryUpload component:**
- Location: `frontend/components/VideoGalleryUpload.tsx`
- **Max video size: 300MB**
- Features:
  - Horizontal scrollable video grid with thumbnails
  - Progress indicator with phase labels (preparing/uploading/processing/complete)
  - Video preview with play button overlay
  - Full-screen video playback modal with navigation arrows
  - **Reorder mode:** Toggle to rearrange videos with left/right arrows
  - Delete confirmation with edit mode controls
  - Max file size check (300MB frontend, 350MB backend)
  - Proper error handling with alerts
- **Integrated in:**
  - Business Dashboard (gallery videos section)
  - Artist Dashboard (uploaded videos section)
  - Profile page (gallery videos section)
- Backend updated: `routes/media.py` MAX_FILE_SIZE = 350MB
- New translation keys: `gallery.reorder`, `gallery.video`, `common.done`

### Translation Fixes Based on Screenshots (COMPLETE - December 2025)
**Fixed missing translation keys identified from screenshots:**
- `common.optional` - "Προαιρετικό" / "Optional"
- `common.at` - "στις" / "at"
- `common.group` - "Ομάδα" / "Group"
- `profile.inviteFriends` - "Πρόσκληση" / "Invite"
- `events.openInMaps` - "Άνοιγμα στους Χάρτες" / "Open in Maps"
- `events.description` - "Περιγραφή" / "Description"
- `events.messages` - "μηνύματα" / "messages"
- `messages.joinActivityEvent` - Alias key for joinActivityOrEvent

### InviteFriendsModal Integration (COMPLETE - December 2025)
**Social sharing modal now integrated in Profile page:**
- Invite button on Profile page now opens InviteFriendsModal
- Modal allows sharing via WhatsApp, Instagram, Facebook, or native share
- Shows user's referral code if available
- **Files:**
  - `frontend/app/(tabs)/profile.tsx` - Added modal state and integration
  - `frontend/components/InviteFriendsModal.tsx` - Already existed

### Translation Updates (COMPLETE - December 2025)
**Added missing Greek (el.json) translations:**
- Messages section: Direct Messages, Group Chats tabs and empty states
- Artist Profile: YouTube videos, photos, videos, report functionality
- Business Profile: Report business functionality  
- Events: Reminder feature (15min/1hr/1day before)
- Friends: Request sent confirmation
- Story: Reaction sent feedback
- Onboarding: Full onboarding flow translations
- Call: Group call functionality translations
- Contacts: Extended invitation translations
- Profile: Gallery permissions, caption editing

### Share URLs Updated to Use /share/ Prefix (COMPLETE - December 2025)
**All share functions now generate public deep links:**
- Activity share → `/share/activity/{id}`
- Event share → `/share/event/{id}`
- Artist profile share → `/share/artist/{id}`
- Business profile share → `/share/business/{id}`
- **Files Updated:**
  - `frontend/app/activity/[id].tsx`
  - `frontend/app/event/[id].tsx`
  - `frontend/app/artist/[id].tsx`
  - `frontend/app/business/[id].tsx`
  - `frontend/app/(tabs)/activities.tsx`

### Keyboard Overlap Fix (COMPLETE - December 2025)
**Adjusted keyboardVerticalOffset in chat views:**
- iOS: Increased from 90 to 100
- Android: Increased from 20 to 30
- Applied to both Activity and Event detail pages

### Clickable Group Chat Participants (COMPLETE - December 2025)
**User names in group chats are now clickable:**
- Activity group chat: Tap sender name → Navigate to `/user/{id}`
- Event group chat: Tap sender name → Navigate to `/user/{id}`
- Enables profile discovery within group conversations
- **Files:**
  - `frontend/app/activity/[id].tsx` - Made chat bubble names clickable
  - `frontend/app/event/[id].tsx` - Made chat bubble names clickable

### Artist Dashboard Fix (COMPLETE - December 2025)
**Fixed crash when clicking "Content" tab:**
- Issue: Prop name mismatch in `YouTubeGallerySection` component
- Component expected: `videos`, `onLinkChange`, `onAddLink`, `onDeleteLink`
- Dashboard passed: `youtubeLinks`, `onNewYoutubeLinkChange`, etc.
- **Fix:** Corrected prop names in `artist-dashboard.tsx`

### Messages Tab with Group Chat Integration (COMPLETE - December 2025)
**Unified messaging experience with DM and Group Chat tabs:**
- **Tab Navigation:** Messages screen now has "Direct" and "Groups" tabs
- **Group Chats:** Activity and Event group chats appear in the Groups tab
- **Backend Endpoint:** `GET /api/messages/all-conversations` returns all conversation types
- **UI Components:** 
  - Activity chats show purple avatar with people icon
  - Event chats show pink avatar with calendar icon
  - Type badges ("Activity" / "Event") distinguish conversation types
- **Files:**
  - `frontend/app/(tabs)/messages/index.tsx` - Refactored with tabs and group chat support
  - `backend/routes/messages.py` - Added `all-conversations` endpoint

### Public Share Pages for Deep Links (COMPLETE - December 2025)
**Public-facing web pages for shared content (no auth required):**
- **Share Pages Created:**
  - `/share/activity/[id]` - Activity preview with download CTA
  - `/share/event/[id]` - Event preview with download CTA
  - `/share/user/[id]` - User profile preview
  - `/share/profile/[id]` - Alias for user profile
  - `/share/artist/[id]` - Artist profile preview
  - `/share/business/[id]` - Business profile preview
- **Backend Preview Endpoints (no auth):**
  - `GET /api/preview/activity/{id}`
  - `GET /api/preview/event/{id}`
  - `GET /api/preview/user/{id}`
  - `GET /api/preview/artist/{id}`
  - `GET /api/preview/business/{id}`
- **Features:**
  - Displays content preview (title, description, image, stats)
  - "Open in Perix" button for logged-in users
  - "Get the Perix App" button linking to app stores
  - App store links (placeholder) ready for real links
- **Files:**
  - `frontend/app/share/*/[id].tsx` - All share page components
  - `backend/routes/preview.py` - Public preview endpoints (async MongoDB)

## Recent Updates (March 2026)

### Desktop Web Layout (COMPLETE - March 5, 2026)
**Responsive desktop-friendly UI for web browsers:**
- **Sidebar Navigation:** Fixed left sidebar with logo, nav items, create button, user card
- **Breakpoints:** Mobile (<768px), Tablet (768-1023px), Desktop (1024-1279px), Wide (1280px+)
- **Features:**
  - Bottom tabs hidden on desktop (replaced by sidebar)
  - Hover states on all clickable elements
  - Badge counts for messages/notifications
  - User profile card at bottom of sidebar
  - "Create Post" button with hover animation
- **Files:**
  - `frontend/components/Sidebar.tsx` - Desktop navigation sidebar
  - `frontend/hooks/useResponsiveLayout.ts` - Screen size detection hook
  - `frontend/app/(tabs)/_layout.tsx` - Conditional sidebar rendering

## Read Receipts in Chat (COMPLETE - March 5, 2026)
**Visual read status indicators for messages:**
- **Single checkmark (✓):** Message sent/delivered
- **Double checkmark (✓✓) in green:** Message read by recipient
- **Backend:** `read` and `read_at` fields on messages, auto-updated when chat opened
- **Frontend:** `frontend/app/(tabs)/messages/[id].tsx` - Shows checkmarks on sent messages

### Analytics Dashboards (COMPLETE - March 5, 2026)
**New analytics routes at `/api/analytics/*`:**
- **User Analytics:** Total posts, stories, likes, comments, profile views, friends, messages, engagement rate, growth chart
- **Artist Analytics:** Followers, profile views, events, attendees, top events
- **Business Analytics:** Followers, profile views, events, activities, attendees, top events
- **Profile View Tracking:** `POST /api/analytics/track-view` for counting profile visits
- **Files:** `backend/routes/analytics.py`, `frontend/lib/api.ts`

### Business & Artist Dashboard Analytics UI (COMPLETE - March 6, 2026)
**Full analytics tab with visual insights:**
- **Tab Navigation:** Both dashboards now have three tabs (Overview, Analytics, Content)
- **Analytics Components:**
  - `AnalyticsCard` - Stats cards with trends and icons
  - `AnalyticsChart` - Bar chart for weekly activity
  - `TopEventsSection` - Ranked list of best performing events
  - `EngagementSection` - Engagement rate circle with level indicator
  - `AudienceInsights` - Profile views, reach estimates, growth potential
- **Data Displayed:**
  - Profile views, followers, total events, total RSVPs
  - Engagement rate with level badges (Excellent/Good/Average/Needs Work)
  - Growth data visualization
  - Actionable tips based on performance
- **Files:**
  - `frontend/components/dashboard/*.tsx` - All analytics UI components
  - `frontend/app/business-dashboard.tsx` - Updated with tabs
  - `frontend/app/artist-dashboard.tsx` - Updated with tabs
  - `backend/tests/test_analytics_api.py` - 13 API tests (100% passing)

### 0. Back Button Navigation Refactor (COMPLETE - March 5, 2026)
**Standardized navigation across all screens:**
- **Custom Hook:** `useSafeNavigation` provides consistent back navigation with fallbacks
- **Refactored Screens:**
  - `media-editor.tsx` - Story/post editor
  - `friend-requests.tsx` - Friend request management
  - `group-call.tsx` - Group video calls
  - `post/[id].tsx` - Post detail page
  - `start-group-call.tsx` - Group call setup
  - `invite-contacts.tsx` - Contact invitation
  - `call.tsx` & `call.web.tsx` - Voice/video calls
  - `camera.tsx` - Camera screen
  - `incoming-call.tsx` - Incoming call screen
- **Safety Features:**
  - Checks `router.canGoBack()` before navigating
  - Context-aware fallbacks (home, messages, etc.)
  - No more navigation crashes on first screen

### 0.1 Chat Mic/Send Button Fix (COMPLETE - March 5, 2026)
**Fixed the UI rendering issue where both mic and send buttons were visible:**
- **Conditional Rendering:** Now shows mic button when text is empty, send button when text exists
- **File:** `frontend/app/(tabs)/messages/[id].tsx`
- **Clean Toggle:** Uses `text.trim().length === 0` ternary to switch between buttons

### 0.2 Story Editor Haptic Feedback (COMPLETE - March 5, 2026)
**Added tactile vibration feedback to enhance UX:**
- **Snap to Grid:** Light haptic when text snaps to alignment guides
- **Alignment Buttons:** Medium haptic when using quick alignment
- **Rotation/Scale Controls:** Selection haptic for fine adjustments
- **File:** `frontend/app/media-editor.tsx`
- **Uses:** `expo-haptics` library (Light, Medium, Selection feedback types)

### 0.3 Deep Link Handler (COMPLETE - March 5, 2026)
**Full deep link support for sharing and navigation:**
- **Hook:** `frontend/hooks/useDeepLinkHandler.ts`
- **Supported Links:**
  - `perix://user/{id}` - Navigate to user profile
  - `perix://event/{id}` - Navigate to event detail
  - `perix://activity/{id}` - Navigate to activity detail
  - `perix://artist/{id}` - Navigate to artist profile
  - `perix://business/{id}` - Navigate to business profile
  - `perix://post/{id}` - Navigate to post detail
  - `perix://referral/{code}` - Apply referral code
- **Features:**
  - Handles initial URL (app opened from deep link)
  - Listens for links while app is running
  - Stores pending links for after authentication
  - Duplicate link prevention

### 0.4 Invite Contacts & Referral System (VERIFIED COMPLETE)
**Full referral tracking already implemented:**
- **Backend:** `/api/contacts/check`, `/api/contacts/invite-tracking`, `/api/contacts/referral-code`, `/api/contacts/apply-referral`
- **Frontend:** `invite-contacts.tsx` with SMS/WhatsApp invite
- **Features:** Phone contact matching, invite tracking, referral code generation, conversion tracking

### 1. Group Calls (NEW)
**Full group video/voice call system:**
- **Up to 16 participants** (host + 15 friends)
- **Video and Voice calls** supported
- **Add participants during active calls** (host only)
- **Two view modes:**
  - Speaker Focus: Active speaker large, others as thumbnails
  - Grid Layout: All participants in adaptive grid
- **Navigation:** "Group" button added to Messages tab header

**Backend Endpoints:**
- `POST /api/calls/group/create` - Create group call
- `GET /api/calls/group/my-calls` - Get call history
- `GET /api/calls/group/{id}` - Get call details
- `POST /api/calls/group/{id}/join` - Join call
- `POST /api/calls/group/{id}/add-participant` - Add during call
- `POST /api/calls/group/{id}/leave` - Leave call
- `POST /api/calls/group/{id}/end` - End call (host only)

**Frontend Screens:**
- `/app/start-group-call.tsx` - Select friends to call
- `/app/group-call.tsx` - Active call UI
- Updated `/app/(tabs)/messages/index.tsx` - Group button in header

### 2. Event Reminders with Push Notifications (NEW)
**Reminder system for upcoming events:**
- **Quick reminder presets:** 15 min, 1 hour, 1 day before
- **Custom reminder times** supported
- **Push notifications** via Firebase
- **Reminder button** on event detail page

**Backend Endpoints:**
- `POST /api/events/{id}/quick-reminder` - Set quick reminder
- `POST /api/events/{id}/reminders` - Create custom reminder
- `GET /api/events/{id}/reminders` - Get event reminders
- `DELETE /api/events/{id}/reminders/{rid}` - Delete reminder
- `GET /api/events/reminders/my-reminders` - Get all user reminders
- `POST /api/events/reminders/process-due` - Process due reminders (cron)

**Frontend Updates:**
- Updated `/app/event/[id].tsx` - Reminder button with toggle
- Added `/lib/api.ts` - Reminder API functions

### 3. Full Onboarding Flow
**Multi-step tutorial for new users:**
- **Feature Slides:** Welcome, Discover, Connect, Events, Stories, Calls
- **Permission Requests:** Camera, Location, Notifications with grant UI
- **Profile Setup:** Photo picker, bio input, location input
- **Completion Screen:** Welcome message with tips
- **Skip Options:** Skip entire flow or individual steps

**Implementation:**
- `/app/frontend/app/onboarding.tsx` - Complete rewrite with 4 steps
- Animated slides with gradient icons
- AsyncStorage persistence for completion status

### 2. Voice Messages in Chat
**Voice recording and playback:**
- **Microphone Button:** Shows when text input is empty
- **Recording UI:** Red indicator, duration timer, cancel/send buttons
- **Audio Upload:** Recorded audio uploaded to Cloudinary
- **Backend Support:** Audio media type already supported in messages

**Implementation:**
- `/app/frontend/app/(tabs)/messages/[id].tsx` - Voice recording functions
- Uses `expo-av` Audio.Recording API
- High quality recording preset

### 3. Story Editor (Already Full-Featured)
**Existing capabilities confirmed:**
- Draggable/movable text with PanResponder
- Pinch-to-scale text
- Rotation support
- Font selection
- Color picker
- Background styles
- Music selection from Jamendo API

### 4. Large File Uploads (250MB)
- **Backend:** Chunked upload API (`/api/uploads/init`, `/api/uploads/chunk`, `/api/uploads/complete`)
- **Frontend:** `uploadMedia()` automatically routes large videos (>1MB) to chunked upload
- **Max File Size:** 250MB for videos
- **Chunk Size:** 512KB

### 2. Events Page Redesign
- Colorful purple theme matching Activities design
- Badge showing "Event" type
- Inline chat at bottom (no modal popup)
- Static map with "Open in Maps" overlay
- RSVP section with attendance toggle

### 3. Activities: Private Events & Themes
**New Features:**
- **Private Activities:** Toggle to make activity private with auto-generated invitation code
- **Activity Themes:** Birthday, Dinner, Cinema, Party, Sports, Coffee, Travel, Game, Music, Outdoor, Custom
- **Custom Theme:** Write your own theme text
- **Invitation Code:** 8-character code for private events, copy/share buttons
- **Business Tagging:** Tag a business as venue
- **Themed Colors:** Each theme has unique color applied to UI elements
- **Inline Chat:** Chat section directly on activity detail page

**New Backend Endpoints:**
- `GET /api/activities/themes` - Get available themes
- `POST /api/activities/join-by-code` - Join private activity with code

**Database Changes:**
- `is_private` (bool) - Activity visibility
- `invitation_code` (str) - Auto-generated for private activities
- `theme` (str) - Predefined theme key
- `custom_theme` (str) - User-defined theme text
- `tagged_business_id` (str) - Reference to business

### 4. Business Tagging UI for Activities
- Horizontal scrollable picker to select a venue
- Shows user's businesses with logos
- "None" option to clear selection
- Passed to `createActivity()` API

### 5. Join Activity by Code
- Input field on Activities page header
- Auto-capitalizes code input
- Joins user to private activity and navigates to detail page
- Also available on "Set Your Area" prompt screen

### 6. Admin Panel: Cascade Delete & Hide
**Delete User removes ALL content:**
- Posts, Stories, Comments, Likes
- Activities (as creator) + Activity messages
- Event messages, Messages, Conversations
- Events, Businesses, Artists
- Notifications, Friend requests, Friends
- Reports, Calls history, Subscriptions
- User removed from activity invites

**Hide/Unhide User affects ALL content:**
- Posts, Stories
- Activities (as creator)
- Businesses, Artists, Events

### 7. Admin Confirmation Modal with Content Counts
**New Endpoint:** `GET /api/admin/user-content-count/{user_id}`

Returns counts of all user content:
- Posts, Stories, Activities, Events
- Businesses, Artists, Messages
- Friends, Likes, Comments
- Activity invites, Subscriptions
- Total items count

**Frontend Modal Features:**
- Shows loading state while fetching counts
- Displays content counts in a grid
- Shows total items affected
- Warning banner for delete action
- Cancel/Confirm buttons

## Media Storage Architecture

### Cloudinary (Single Storage for ALL Media)
- **Account**: `dnfi4a2as`
- **Folder**: `perix/`
- **Dashboard**: https://console.cloudinary.com

### What Gets Uploaded:
| Type | Location | Optimization |
|------|----------|--------------|
| Post Images | Cloudinary | Max 1920px, auto quality, webp/avif |
| Post Videos | Cloudinary | Max 720p, H.264, AAC audio |
| Profile Photos | Cloudinary | Auto optimized |
| Business Logos | Cloudinary | Auto optimized |
| Artist Photos | Cloudinary | Auto optimized |
| Gallery Images | Cloudinary | Auto optimized |
| Stories | Cloudinary | Auto optimized |

### Cloudinary Free Plan Limits:
| Limit | Value |
|-------|-------|
| Monthly Credits | 25 |
| Max Image | 10 MB |
| Max Video | 100 MB |
| Storage | ~10 GB |

### Migration Endpoints (Run on Production):
```bash
# Migrate everything to Cloudinary (run once)
POST /api/media/migrate-all

# Or run individually:
POST /api/media/migrate-posts      # Post images
POST /api/media/migrate-users      # User photos + galleries
POST /api/media/migrate-businesses # Business logos
POST /api/media/migrate-post-actors # Actor avatars
POST /api/search/migrate-artist-locations # Artist geolocation
```

## Performance Results
| Metric | Before | After |
|--------|--------|-------|
| API Response | 3.6 MB | 6.3 KB |
| Reduction | - | **99.8%** |

## Build Instructions (Windows)
```cmd
set EAS_NO_VCS=1 && set EXPO_NO_DOCTOR=1 && eas build --platform android --profile production
```

## Test Credentials
- **Test User:** test-user@test.com / testpassword
- **Admins:** konkapou@gmail.com, markoskolias@gmail.com

## Key Files
- `frontend/lib/upload.ts` - Centralized upload utility
- `frontend/lib/api.ts` - API functions with Cloudinary uploads
- `frontend/lib/notifications.ts` - Local notification functions with lock screen support
- `frontend/lib/pushNotifications.ts` - Push notification handling
- `frontend/context/NotificationContext.tsx` - Notification context and channel setup
- `backend/utils/cloudinary_utils.py` - Cloudinary with optimizations
- `backend/routes/media.py` - Media upload + migration endpoints
- `backend/utils/push_notifications.py` - Backend push notification service

## Notification System

### Android Notification Channels (with Lock Screen Visibility)
| Channel | Name | Importance | Lock Screen | Bypass DnD |
|---------|------|------------|-------------|------------|
| `calls` | Incoming Calls | MAX | PUBLIC | ✅ Yes |
| `messages` | Messages | HIGH | PUBLIC | ❌ No |
| `activities` | Activities | DEFAULT | PUBLIC | ❌ No |

### Required Android Permissions (app.json)
- `ACCESS_FINE_LOCATION` - GPS for artist search
- `READ_MEDIA_IMAGES/VIDEO` - Gallery access
- `CAMERA` - Camera for stories/posts
- `RECORD_AUDIO` - Voice/video calls
- `VIBRATE` - Notification vibration
- `USE_FULL_SCREEN_INTENT` - Full screen call UI on lock screen

### Notification Features
- **Calls**: MAX priority, bypasses Do Not Disturb, visible on lock screen
- **Messages**: HIGH priority, visible on lock screen with sender info
- **Activities**: DEFAULT priority, visible on lock screen

## Pending User Verification
1. ✅ Media Uploads (Photo/Video) - Fixed, needs testing in build
2. ✅ Back Button Navigation - Rewritten, needs testing
3. ✅ App Performance/Speed - Should be dramatically faster
4. ✅ Phone Calls - Backend fixed
5. ✅ Notification on Lock Screen - Enhanced with proper channels
6. ✅ Admin Cascade Delete - Implemented
7. ✅ Geospatial Search - Working
8. ✅ Stories Display - Fixed (was returning null for image_url/video_url)

## Recent Fixes (March 2026)
- **Profile Crash Fix**: Added missing `KeyboardAvoidingView` import in profile.tsx
- **Video Post Fix**: Corrected video post creation to use pre-uploaded Cloudinary URL instead of re-uploading
- **Gallery Photo Upload Fix**: Updated `handleAddPhoto` to use `uploadImageToCloudinary` for base64 images instead of `uploadMedia`
- **Gallery State Update**: Fixed `handleAddVideo` to also update `videoItems` state
- **Music API Integration**: Completed Jamendo API integration with fallback tracks when API key is not configured
- **Music Routes**: Added music router to API with `/api/music/featured`, `/api/music/search`, `/api/music/genres`, `/api/music/moods`
- **Stories API Bug**: Fixed `/api/stories` and `/api/stories/grouped` to return `image_url` and `video_url` fields
- **Story Viewer**: Updated to support both images and videos with Cloudinary URLs
- **Notification System**: Consolidated duplicate `setNotificationHandler` calls to prevent conflicts
- **Video Upload Bug**: Fixed `uploadMedia` response handling (returned string directly, not object)
- **Story Editor Enhancement**: Added 12 fonts, 6 text styles, video auto-looping
- **Profile Gallery Captions**: Added caption editing for gallery photos and videos
- **Translation Updates**: Fixed missing German translations for artist profile and editor
- **Music for Stories/Videos**: Added music library with 8 tracks, volume control, mute toggles
- **Video Autoplay**: Videos on home feed autoplay with sound, mute state applied on load

## Music Feature
- Jamendo API integration (with fallback tracks when API key not configured)
- 8 royalty-free fallback music tracks available
- Search, filter by genre/mood
- Genre categories: Pop, Lo-Fi, Electronic, Acoustic, Cinematic, Ballad, Dance
- Volume control slider (0-100%)
- Separate mute toggles for music and video audio
- Music syncs with video playback (play/pause)

## Testing Status (March 2026)
- Backend API Tests: Verified
- Admin Cascade Delete/Hide: **VERIFIED WORKING** (March 5, 2026)
  - HIDE: Cascades to posts, stories, activities, businesses, artists, events
  - UNHIDE: Restores all hidden content
  - DELETE: Removes user + all related data (posts, stories, messages, conversations, activities, events, businesses, artists, notifications, friends, reports, calls, subscriptions, likes, comments, activity invites)
- Music API: Working with fallback tracks (MOCKED - Jamendo not configured)
- Gallery API: Working
- Posts API: Working
- Auth API: Working with gallery_items field

## P1 Bugs Fixed (Current Session)
1. **Video Call Camera** - Fixed Agora service to properly initialize video:
   - Added video encoder configuration
   - Enabled local video capture before joining
   - Start preview BEFORE joining channel
   - Properly notify state callback of video enabled
2. **Notification Timestamps** - Fixed likes to store `created_at` timestamps and improved parsing for various timestamp formats

## Pending P1 Bugs
- None currently - all P1 bugs addressed

## Story Editor Enhancements (Current Session)
- **More Fonts**: Expanded from 12 to 18 fonts including Thin, Light, Medium, Semibold, Black, Mono Bold, Serif Italic, Condensed Bold, Script Bold
- **More Text Backgrounds**: Added 14 styles including White solid, Pink highlight, Blur Dark, Neon Pink, Neon Green, Soft Glow, Outline, Gradient
- **Music API Integration**: Story editor now fetches music tracks from `/api/music/featured` API endpoint with fallback to default tracks
- **Artist Display**: Music picker now shows artist name for tracks from API
- **Loading States**: Added loading indicator while fetching music tracks

## Text Positioning Features (NEW)
- **Drag to Move**: Tap and drag text anywhere on the canvas
- **Pinch to Resize**: Two-finger pinch gesture to scale text (0.5x to 3x)
- **Snap to Grid**: Text snaps to center, edges, and thirds when dragging
- **Alignment Guides**: Red visual guides appear when text snaps to position
- **Alignment Buttons**: Quick buttons for Left, Center, Right, Top, Middle, Bottom alignment
- **Rotation Controls**: Rotate text in ±5° or ±15° increments with reset button
- **Scale Controls**: Smaller/Larger buttons with percentage display and reset
- **Visual Rotation Display**: Shows current rotation angle
- **Visual Scale Display**: Shows current scale percentage

## Upcoming Tasks
- Configure Jamendo API key for production music
## Production Domains (March 2026)
- **Landing Page:** https://www.perixapp.com ✅
- **Web App:** https://app.perixapp.com ✅
- **API:** https://api.perixapp.com ✅
- **Mobile App Scheme:** `perix://`

### Domain Configuration
- Domain: `perixapp.com` (via Cloudflare)
- Frontend: Vercel (www, app subdomains)
- Backend: Railway (api subdomain)
- Web Landing Page
- Event Reminders system
- Complete Onboarding flow for new users

## Completed Feature: Chat Improvements (March 2026)
**Chat Enhancements:**
- **Typing Indicators:** Real-time typing status shown when other user is typing
- **Media Messages:** Support for sending images and videos in chat
- **Media Preview:** Image and video previews displayed inline in chat bubbles
- **Typing Status API:** `/api/messages/typing` endpoint for real-time status

**Implementation:**
- Frontend `messages/[id].tsx` updated with typing status polling (2s interval)
- Media picker buttons (image/video) added to chat input bar
- Media upload progress indicator
- Automatic typing status clearing after 3 seconds of inactivity

## Completed Feature: Story Reactions (March 2026)
**Story Reaction System:**
- **Emoji Reactions:** Users can react to stories with: ❤️ 🔥 😍 😂 😮 👏
- **Reaction Bar:** Floating reaction bar shown on story viewer
- **API Integration:** `/api/stories/{id}/react` endpoint for reactions

**Implementation:**
- Reaction buttons added to home screen story viewer
- Alert confirmation when reaction is sent
- Only shown when viewing other users' stories

## Completed Feature: Social Sharing (March 2026)
**ShareContent Component:**
- Multi-platform sharing to WhatsApp, Instagram, Facebook, Twitter, Telegram
- Copy link functionality
- Native share fallback
- Deep links support (`perix://user/{id}`, `perix://event/{id}`)

**Integration:**
- User Profile page: Share profile button using ShareContent
- Event page: Already integrated with ShareContent
- Generates share message with title, description, location, dates

## Completed Feature: Friend System Enhancements (March 2026)
**Profile Page Updates:**
- "Invite Friends" button added to Friends section
- Navigation to Invite Contacts screen
- Styled with app theme

**Invite Contacts Feature:**
- Backend: `/api/contacts/referral-code`, `/api/contacts/check`, `/api/contacts/my-invites`
- Frontend: Full invite contacts screen with contact picker
- Referral tracking system

## Completed Feature: Large File Uploads (300MB) - CRITICAL FIX December 2025
**CRITICAL BUG FIX: Streaming Chunked Uploads**
- **Problem:** Previous implementation loaded entire file into memory as base64, causing app crash at ~57MB
- **Solution:** Rewrote `uploadVideoChunked()` to use `expo-file-system` position/length parameters to stream chunks directly from device storage
- **Result:** Now supports files up to 300MB without memory issues

**Backend:**
- `/api/uploads/init` - Initialize chunked upload session
- `/api/uploads/chunk` - Upload individual chunks (supports base64 for mobile, blob for web)
- `/api/uploads/complete` - Assemble chunks and upload to Cloudinary
- `/api/uploads/status/{upload_id}` - Check upload progress
- `/api/uploads/cancel/{upload_id}` - Cancel and cleanup upload session

**Frontend (`frontend/lib/api.ts`):**
- `uploadMedia()` detects file size and routes large videos (>10MB) to chunked upload
- `uploadVideoChunked()` uses STREAMING reads - only ~5MB in memory at any time
- Progress callbacks show chunk-by-chunk upload progress
- Maximum file size: 300MB
- Chunk size: 5MB
- Works on both mobile (React Native) and web platforms

**How it works (Fixed):**
1. For videos over 10MB, file URI is prepared (copied to cache if needed)
2. File size is checked WITHOUT loading file into memory
3. Each 5MB chunk is read directly from file using `FileSystem.readAsStringAsync` with `position` and `length` parameters
4. Only one chunk exists in memory at a time - prevents OOM crash
5. Server reassembles chunks and uploads to Cloudinary
6. Progress shows: preparing → uploading (with chunk count) → processing → complete
7. Temp files are cleaned up after upload

**Key Code Change:**
```typescript
// OLD (BROKEN - loaded entire file):
const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });

// NEW (STREAMING - reads only one chunk at a time):
const chunkBase64 = await FileSystem.readAsStringAsync(localUri, {
  encoding: FileSystem.EncodingType.Base64,
  position: start,  // Byte offset
  length: length,   // Chunk size (~5MB)
});
```

