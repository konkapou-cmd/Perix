# Fix: Metro cache, city ad pause, symbol fixes

## Issue 1: Changes not showing (cache)

**Root cause:** The `.metro-cache` directory persists in the Downloads copy.
The custom `metro.config.js` stores bundles there instead of the default
location. `npx expo start -c` doesn't clear it. 7 node processes still
running, serving stale cached bundles.

**Confirmed code IS present:**
- `SlotManagerModal.tsx` → `CalendarList` import + usage (lines 5, 276)
- `ServiceModal.tsx` → `getCategoryPlaceholders` func (line 179) + usage (lines 371, 379)
- `CityAdViewer.tsx` → `useRouter` import + `router.push` (lines 13, 31, 119)

**Fix:**
1. Kill all node processes: `taskkill /f /im node.exe`
2. Delete Downloads `.metro-cache/` and `.expo/`
3. Restart: `cd Downloads\Perix1\Perix-main\frontend && npx expo start`

No code changes needed — all code is correct and synced.

---

## Issue 2: City ad keeps playing when navigating to business

**Root cause:** `CityAdViewer.tsx` line 119 calls `router.push()` but doesn't
pause the video player first. The video continues playing in the background
after navigation.

**Fix:** Call `player.pause()` before `router.push()`:

```diff
  onPress={() => {
    if (currentGroup?.actor_type === "business" && currentGroup?.actor_id) {
+     player.pause();
      router.push(`/business/${currentGroup.actor_id}`);
    }
  }}
```

**File:** `frontend/components/stories/CityAdViewer.tsx` (line 116–121)

---

## Issue 3: Profile slowness

**Root cause:** `npx expo start -c` doesn't clear the custom `.metro-cache`.
Unoptimized/cached bundles make the profile appear slow. Once cache is
properly cleared (Issue 1), performance should return to normal. The
`loadBusinessFullData` function (line 1080) makes a single API call
(`getBusinessDetail`), so the code itself isn't the bottleneck.

**Fix:** Same as Issue 1 — clear cache.

---

## Files changed

| File | Change |
|------|--------|
| `CityAdViewer.tsx` | Add `player.pause()` before `router.push()` (1 line) |
| (none else) | Remaining issues are cache-related, not code |

## Execution steps (when building)

1. Edit `CityAdViewer.tsx` — add `player.pause()`
2. Sync to worktree
3. Kill all node, delete `.metro-cache` + `.expo` in Downloads
4. Restart Metro
