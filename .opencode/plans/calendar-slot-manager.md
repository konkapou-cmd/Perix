# Calendar View for SlotManagerModal

## Summary
Replace the text-based 3-tab SlotManagerModal with a calendar-first
interface using `CalendarList` from `react-native-calendars` (already
used in home.tsx / locator.tsx).  No backend changes needed — all
existing API endpoints (`getSlots`, `createSlot`, `deleteSlot`,
`blockSlots`) remain unchanged.

---

## Current state
- Three tabs: Weekly, One-Time, Block
- Dates entered as YYYY-MM-DD text — no visual calendar
- No way to see which dates already have slots / are blocked / are booked
- Slots list shown at the bottom, unfiltered

## New design

### Calendar (always visible)
- `CalendarList` with `markingType="multi-dot"`
- **Green dot** = available slots on that date
- **Gray dot** = fully booked
- **Red dot** = blocked date
- Recurring slots repeated across matching weekdays (next 90 days)
- Block-range preview shown as semi-transparent red dots while selecting

### Date selection
- Tapping a date selects it and shows slots below
- Lock icon in header toggles **block mode**:
  - Tap start date → tap end date → "Block" button appears
  - Re-tap to reset selection

### Contextual panel (below calendar)
- Selected date label + day name
- Slots for that date (including recurring that match the weekday)
- Each slot: time range, icon (recurring/one-time), blocked/booked badge,
  delete button
- Quick "Add slot" row: start time + end time text inputs + add button

### Bottom (scrollable)
- Weekly recurring section: day chip selector + start/end time + create
  button

### Legend
- Three dots with labels: Available / Booked / Blocked

---

## Files to change

| File | Change |
|------|--------|
| `frontend/components/business/SlotManagerModal.tsx` | Complete rewrite (254→~300 lines) |
| `frontend/components/business/index.ts` | No change (already exports SlotManagerModal) |
| `frontend/app/(tabs)/profile.tsx` | No change (already renders SlotManagerModal) |

## Key implementation notes

- `CalendarList` height set to 320px — enough for ~6 weeks visible
- `markedDates` rebuilt via `useMemo` whenever slots/selection changes
- Recurring slots projected 90 days forward for dot display
- Dots deduplicated (max 3 per date) and capped to avoid performance issues
- Block mode is a boolean toggle; block range stored as `blockStart`/`blockEnd`
  state
- `Dynamic import` for `blockSlots` function (same as current code)
