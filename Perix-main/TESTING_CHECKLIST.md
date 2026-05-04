# Perix App - Manual Testing Checklist

## Test Environment
- **Platform**: Android
- **Backend**: External (cloud)
- **Test Accounts**: Create new test accounts for testing

---

## Phase 1: Authentication & Setup

### 1.1 User Registration
- [ ] Register new user account
- [ ] Verify email format validation works
- [ ] Verify password requirements enforced

### 1.2 Login/Logout
- [ ] Login with valid credentials
- [ ] Login with invalid credentials shows error
- [ ] Logout clears session
- [ ] Session persists after app restart

---

## Phase 2: Profile - User

### 2.1 Post Creation (User)
- [ ] Create text-only post
- [ ] Create post with image from gallery
- [ ] Create post with video from gallery
- [ ] Post appears immediately in Posts tab
- [ ] Upload progress shows correctly

### 2.2 Post → Gallery Sync (User)
- [ ] Create post with image → image appears in **Posts tab**
- [ ] Create post with image → image appears in **Media tab** (Gallery section)
- [ ] Create post with video → video appears in **Posts tab**
- [ ] Create post with video → video appears in **Media tab** (Gallery section)
- [ ] Multiple posts with same image → deduplicated (shows once in Media)

### 2.3 Post Deletion (User)
- [ ] Delete post with image → image removed from **Posts tab**
- [ ] Delete post with image → image removed from **Media tab**
- [ ] Delete post with video → removed from both tabs
- [ ] Deletion feedback shown

### 2.4 Post Editing (User)
- [ ] Edit post text → text updates
- [ ] Edit post → media remains unchanged (backend limitation)

### 2.5 Direct Gallery Upload (User)
- [ ] Upload image directly to gallery
- [ ] Upload video directly to gallery
- [ ] Direct uploads appear in Media tab (Gallery section)
- [ ] Can delete direct gallery uploads

### 2.6 Gallery Limit (User)
- [ ] Create 16 posts with images
- [ ] Verify only 15 items total in Media tab
- [ ] Oldest items should be removed first

---

## Phase 3: Profile - Business

### 3.1 Switch to Business Identity
- [ ] Create business profile (if not exists)
- [ ] Switch to business identity via dropdown

### 3.2 Post Creation (Business)
- [ ] Create text-only post as business
- [ ] Create post with image as business
- [ ] Create post with video as business
- [ ] Post appears in **Beiträge** (Posts) tab

### 3.3 Post → Gallery Sync (Business)
- [ ] Create business post with image → image appears in **Beiträge** tab
- [ ] Create business post with image → image appears in **Media** tab
- [ ] Create business post with video → video appears in **Media** tab
- [ ] Verify same deduplication behavior

### 3.4 Business Direct Gallery
- [ ] Upload photo directly to business gallery
- [ ] Upload video directly to business gallery
- [ ] Direct uploads appear in Media tab
- [ ] Can delete direct gallery uploads

### 3.5 Gallery Limit (Business)
- [ ] Business gallery limited to 15 items
- [ ] Same 15-item limit enforced for combined view

---

## Phase 4: Home Feed

### 4.1 Feed Loading
- [ ] Feed loads on app open
- [ ] Pull-to-refresh updates feed
- [ ] Loading indicator shows while fetching

### 4.2 Posts with Images
- [ ] Posts with images display correctly
- [ ] Images load without flickering
- [ ] Image URLs come from `image_url` field (not base64)

### 4.3 Posts with Videos
- [ ] Video thumbnails show in feed
- [ ] Tap to play video
- [ ] Video plays with sound

### 4.4 Video Autoplay
- [ ] Video autoplays when visible in viewport
- [ ] Only ONE video plays at a time
- [ ] Scrolling pauses previous video
- [ ] Video resumes when scrolled back into view

### 4.5 Video Mute Toggle
- [ ] Mute button visible on video
- [ ] Tap mute → all videos muted
- [ ] Tap unmute → all videos unmuted
- [ ] Mute state persists during session

---

## Phase 5: Friend Requests

### 5.1 View Friend Requests
- [ ] Open Messages section
- [ ] Incoming requests show at top
- [ ] Shows sender name and avatar
- [ ] Outgoing requests show separately

### 5.2 Approve Request
- [ ] Tap approve button
- [ ] Request removed from incoming list
- [ ] Notification sent to requester

### 5.3 Decline Request
- [ ] Tap decline button
- [ ] Request removed from incoming list
- [ ] No notification sent

---

## Phase 6: Public Profiles

### 6.1 Public User Profile
- [ ] Visit another user's profile
- [ ] Posts tab shows their posts
- [ ] Media tab shows combined gallery (posts + direct uploads)
- [ ] Cannot edit/delete their posts

### 6.2 Public Business Profile
- [ ] Visit a business profile
- [ ] Beiträge tab shows business posts
- [ ] Media tab shows combined gallery
- [ ] Follow button visible
- [ ] Message button visible

---

## Phase 7: Stories

### 7.1 Story Viewing
- [ ] Stories appear at top of home feed
- [ ] Tap story → opens viewer
- [ ] Story expires after 24 hours

### 7.2 Story Creation
- [ ] Create story with camera
- [ ] Create story from gallery
- [ ] Story appears for followers

---

## Phase 8: Events (Business Only)

### 8.1 Event Creation
- [ ] Business can create event
- [ ] Fill all required fields
- [ ] Event appears on profile

### 8.2 Event Display
- [ ] Events tab shows upcoming events
- [ ] Event details show correctly

---

## Phase 9: Activities (Users)

### 9.1 Activity Creation
- [ ] User can create activity
- [ ] Select date/time
- [ ] Activity appears in activities list

### 9.2 Activity Display
- [ ] Activities show on user profile
- [ ] Can filter by "This Week"

---

## Bug Reporting Template

For each bug found, document:

```
### Bug: [Short Title]

**Severity**: Critical / High / Medium / Low

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:


**Actual Behavior**:


**Screenshots/Logs**:


**Device/App Version**:
```

---

## Test Sign-Off

| Test Area | Tester | Date | Status |
|-----------|--------|------|--------|
| Authentication | | | |
| User Profile | | | |
| Business Profile | | | |
| Home Feed | | | |
| Friend Requests | | | |
| Public Profiles | | | |
| Stories | | | |
| Events | | | |
| Activities | | | |

**Overall Status**: ✅ Ready for Release / ⚠️ Needs Fixes

