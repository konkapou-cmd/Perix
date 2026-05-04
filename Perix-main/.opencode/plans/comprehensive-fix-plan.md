# Comprehensive Fix & Feature Plan

**Approach**: Full horizontal slice per feature (fix each feature end-to-end before moving to next)
**Order**: Critical bugs -> Activities -> Events -> Stories -> Jobs -> Messages -> Map features

---

## PHASE 1: Critical Bug Fixes (feed, useFeedData)

### 1A. Fix useFeedData.ts length of undefined crash
**Root cause**: API responses return shapes that dont match frontend expectations:
- getJobs() returns bare array, code does jr.jobs.length -- jr.jobs is undefined
- getNearbyBusinesses(), getEvents(), getActivities() could return unexpected shapes

**Fix**: Add defensive null-coalescing for every Promise.allSettled handler:
- Line 130: setEvents(evts || []) + if ((evts || []).length > 0)
- Line 141: setActivities(acts || []) + if ((acts || []).length > 0)
- Line 152: setBusinesses(biz || []) + if ((biz || []).length > 0)
- Line 162: const jobList = jr.jobs || jr || []; setJobs(jobList); if (jobList.length > 0)
- Line 171: setRentals(rentalsResult.value.rentals || rentalsResult.value || [])
- Line 177: setStoryGroups(storiesResult.value || [])

**Files**: frontend/hooks/useFeedData.ts

---

## PHASE 2: Activities (end-to-end)

### 2A. Fix activity date/time display
**Issues**:
- ActivityItem type has start_time? but backend never returns it (dead field)
- isUpcomingActivity() checks start_time first (always undefined) then falls back

**Fix**:
- Remove start_time from ActivityItem type
- Make isUpcomingActivity() use date + T + time directly
- Ensure creation form formats date as YYYY-MM-DD and time as HH:mm

**Files**: frontend/lib/api/core.ts, frontend/lib/api/events.ts, frontend/app/activities.tsx

### 2B. Fix activity messaging photo upload (SHARED with Events)
**Root cause**: ChatMessageCreate model only has text: str. Frontend sends media_url but backend silently drops it.

**Fix**:
- Add media_url and media_type to ChatMessageCreate and ChatMessageResponse
- Update activity and event message creation routes to store these fields
- Add photo upload button to ChatSection.tsx (using uploadImageToCloudinary)
- Update ChatSection message rendering to show image messages
- Ensure event group-chat page photo upload works end-to-end

**Files**: backend/models/message.py, backend/routes/activities.py, backend/routes/events.py, frontend/components/shared/ChatSection.tsx, frontend/app/group-chat/[type]/[id].tsx

### 2C. Add gallery_images picker to activities creation form
**Issue**: activities.tsx form state has gallery_images: [] but no UI picker exists.

**Fix**: Add a gallery section to the activities.tsx create/edit modal (copy pattern from ActivityModal.tsx lines 333-351). Use uploadMedia() for Cloudinary uploads.

**Files**: frontend/app/activities.tsx

### 2D. Show gallery images on activity detail page
**Issue**: activity/[id].tsx has styles for galleryGrid/galleryImage but NO JSX renders them.

**Fix**: Add Gallery card section (similar to event detail page lines 629-667). Render gallery_images in 3-column grid with media viewer.

**Files**: frontend/app/activity/[id].tsx

### 2E. Fix tagged_business_id never stored
**Issue**: Frontend sends tagged_business_id but ActivityCreate model doesnt have it. Pydantic silently drops it.

**Fix**: Add tagged_business_id to ActivityCreate/ActivityUpdate models. Store it in create_activity route. Return it in build_activity_response.

**Files**: backend/models/activity.py, backend/routes/activities.py

### 2F. Fix invite_emails not sent from form
**Issue**: activities.tsx has inviteEmails field but handleCreate never includes it.

**Fix**: Include invite_emails in the createActivity() call

**Files**: frontend/app/activities.tsx

### 2G. Improve activity detail page design
**Current state**: Detail page stripped down -- missing description, RSVP, share, gallery. Styles exist but JSX is absent.

**Fix**: Re-add description card, RSVP buttons, share section, gallery grid, attendees list.

**Files**: frontend/app/activity/[id].tsx

### 2H. Convert base64 image uploads to Cloudinary
**Issue**: activities.tsx uses base64 encoding (legacy). ActivityModal.tsx correctly uses Cloudinary.

**Fix**: Change activities.tsx to use uploadMedia() for all image uploads, remove base64 path.

**Files**: frontend/app/activities.tsx

---

## PHASE 3: Events (end-to-end)

### 3A. Fix event messaging photo upload
Already addressed in 2B (shared ChatMessageCreate model).

### 3B. Add gallery_videos upload to EventModal
**Issue**: EventModal.tsx has gallery_images upload but no gallery_videos upload.

**Fix**: Add gallery_videos field to EventForm type. Add video picker section using Mux upload (uploadVideoToMux). Show upload progress. Include in payload.

**Files**: frontend/components/business/EventModal.tsx

### 3C. Fix creator_id never set on events
**Issue**: Private event creators cannot access their own messages because creator_id is never stored.

**Fix**: Set creator_id = current_user.user_id in create_event route document.

**Files**: backend/routes/events.py

### 3D. Fix event reminders referencing wrong field
**Issue**: Reminder routes use event.get(start_date) but events store start_time.

**Fix**: Change start_date to start_time in reminder routes.

**Files**: backend/routes/events.py

### 3E. Improve event detail page design
**Fix**: Minor design polish -- consistent styling with activity detail page, video gallery support.

**Files**: frontend/app/event/[id].tsx

---

## PHASE 4: Stories (Cloudinary photos, Mux videos)

### 4A. Fix mux_upload_id silently dropped by backend
**Issue**: Frontend sends mux_upload_id in StoryCreate payload but backend model doesnt have it.

**Fix**: Add mux_upload_id, mux_asset_id, mux_playback_id, mux_thumbnail_url, video_status to StoryCreate and StoryResponse models. Store and return them.

**Files**: backend/models/story.py, backend/routes/stories.py

### 4B. Fix Mux webhook cannot update story video URLs
**Issue**: uploadVideoMux called with contentRef=undefined. Webhook cant find story to update.

**Fix**: Create story document first (with video_status: preparing) to get story_id. Then call uploadVideoMux with contentRef=story:story_id. Webhook will update playback URL when ready.

**Files**: frontend/app/media-editor.tsx, backend/routes/mux.py

### 4C. Fix video story playback on Android
**Issue**: expo-av doesnt support M3U8/HLS on Android.

**Fix**: Switch from expo-av to expo-video (ExoPlayer) for video playback in StoryViewer.

**Files**: frontend/components/stories/StoryViewer.tsx

### 4D. Add video error fallback in StoryViewer
**Issue**: If video fails, user is stuck (no timer fallback).

**Fix**: Add onError handler that starts 5-second timer and auto-advances.

**Files**: frontend/components/stories/StoryViewer.tsx

---

## PHASE 5: Jobs Section Fix

### 5A. Fix backend response shape mismatch
**Root cause**: Backend returns bare array, frontend expects { jobs: Job[], total: number }.

**Fix**: Change GET /jobs endpoint to return { jobs: [...], total: N }. Add skip/limit query parameters. Create JobResponse model.

**Files**: backend/routes/jobs.py, new backend/models/job.py

### 5B. Fix jobs page filter of undefined crash
**Fix**: Add defensive checks: const filteredJobs = (jobs || []).filter(...)

**Files**: frontend/app/(tabs)/jobs.tsx

---

## PHASE 6: Messages -- Unified Conversation List

### 6A. Merge direct + group conversations into single list
**Current**: Separate tabs for Direct and Groups. Backend /messages/all-conversations already returns both.

**Fix**: Replace tab switcher with single unified list using getAllConversations(). Sort by last_message_time. Show type badge for groups vs direct. Navigate to appropriate screen.

**Files**: frontend/app/(tabs)/messages/index.tsx

### 6B. Add unread counts for group conversations
**Fix**: Add unread tracking for activity/event messages in the backend. Store last_read per user per group chat.

**Files**: backend/routes/messages.py

### 6C. Add WebSocket updates for group conversations
**Fix**: Broadcast conversation_update events when activity/event messages are sent.

**Files**: backend/routes/activities.py, backend/routes/events.py

### 6D. Improve group chat screen
**Fix**: Add Cloudinary photo upload (shared from 2B), typing indicators, consistent design with direct message screen.

**Files**: frontend/app/group-chat/[type]/[id].tsx

---

## PHASE 7: Homepage Map -- Reset Button & Location Search

### 7A. Add map reset button
**Fix**: Add floating recenter FAB (locate icon) overlaid on MapSection. When pressed, get GPS location and set map bounds. Position at bottom-right of map.

**Files**: frontend/components/home/MapSection.tsx, frontend/app/(tabs)/home.tsx

### 7B. Add Google Places location search to homepage
**Current**: Search icon navigates to locator page. Google Places Autocomplete already exists in locator.tsx.

**Fix**: Change search icon to open a search overlay/modal with Google Places Autocomplete. When user selects a place, resolve to coordinates and set map bounds. Reuse fetchSuggestions/handlePlaceSelect from locator.tsx. This updates map AND triggers feed refresh via setMapBounds.

**Files**: frontend/app/(tabs)/home.tsx, new frontend/components/home/LocationSearchOverlay.tsx

### 7C. Connect homepage map with business locator
**Fix**: Both already share MapBoundsContext. Ensure locator sets bounds that persist when returning to homepage.

**Files**: frontend/app/(tabs)/locator.tsx

---

## PHASE 8: Business Locator -- Search Bar & Layout

### 8A. Adjust locator layout and add location search
**Fix**: Keep search bar as floating overlay at top. Add Google Places location search mode (same as homepage). Move map slightly lower with top padding. Search by location sets map bounds (shared with homepage via MapBoundsContext).

**Files**: frontend/app/(tabs)/locator.tsx

---

## File Impact Summary

| Phase | Backend Files | Frontend Files |
|-------|--------------|----------------|
| 1 | -- | hooks/useFeedData.ts |
| 2 | models/activity.py, models/message.py, routes/activities.py | app/activities.tsx, app/activity/[id].tsx, components/shared/ChatSection.tsx, lib/api/core.ts, lib/api/events.ts |
| 3 | routes/events.py | components/business/EventModal.tsx, app/event/[id].tsx, app/group-chat/[type]/[id].tsx |
| 4 | models/story.py, routes/stories.py, routes/mux.py | app/media-editor.tsx, components/stories/StoryViewer.tsx |
| 5 | routes/jobs.py, new models/job.py | app/(tabs)/jobs.tsx |
| 6 | routes/messages.py, routes/activities.py, routes/events.py | app/(tabs)/messages/index.tsx, app/group-chat/[type]/[id].tsx |
| 7 | -- | app/(tabs)/home.tsx, components/home/MapSection.tsx, new LocationSearchOverlay.tsx, app/(tabs)/locator.tsx |
| 8 | -- | app/(tabs)/locator.tsx |
