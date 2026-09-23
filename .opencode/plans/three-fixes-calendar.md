# Three fixes: empty tabs, city ad navigation, category-specific service placeholders

## Fix 1: Hide empty service tab in public view

**File:** `frontend/components/profile/BusinessProfilePremium.tsx` (line 260)

**Current:** Public `services` tab shows whenever `enabled_modules?.services`
exists, even when `services.length === 0` (empty tab with `count: 0`).

**Change:** Add `services.length > 0` guard:

```diff
- if (detail.business.enabled_modules?.services) {
+ const hasServices = (services || []).length > 0;
+ if (hasServices && detail.business.enabled_modules?.services) {
    tabs.push({ key: "services", ..., count: services.length })
  }
```

Only 3 lines changed. Other tabs (`events`, `jobs`, `rentals`) already have
length guards. `posts` and `media` intentionally always shown.

---

## Fix 2: City ad fullscreen → business profile

**File:** `frontend/components/stories/CityAdViewer.tsx` (lines 1-18, 112-117)

**Current:** Business name in city ad viewer header is static `<Text>` — no navigation.

**Change:** Wrap in `<Pressable>`, navigate to `/business/${actor_id}` when
`actor_type === "business"`. Add a chevron icon to indicate it's tappable.

**Imports to add:** `useRouter` from `expo-router`

```diff
- <View style={styles.header}>
-   <Text style={styles.businessName}>
-     {currentGroup?.author_name || "Business"}
-   </Text>
- </View>
+ <Pressable style={styles.header} onPress={() => {
+   if (currentGroup?.actor_type === "business" && currentGroup?.actor_id) {
+     router.push(`/business/${currentGroup.actor_id}`);
+   }
+ }}>
+   <Text style={styles.businessName}>
+     {currentGroup?.author_name || "Business"}
+   </Text>
+   {currentGroup?.actor_type === "business" && (
+     <Ionicons name="chevron-forward" size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
+   )}
+ </Pressable>
```

No need to update `CityAdCircles.tsx` — tapping a card already opens the
story viewer.

---

## Fix 3: Category-specific placeholders (NO default visible)

**File:** `frontend/components/business/ServiceModal.tsx` (lines 306, 314)

**Current:**
- Name placeholder: `"e.g. Haircut, Room 101, Margherita Pizza"` (generic)
- Description placeholder: `"Describe the service..."` (generic)

**Problem:** "Escape room" under entertainment-events sees "e.g. Haircut..." —
completely wrong context.

**Change:** Add a helper function that returns category-specific placeholder
text, covering ALL 13 root categories with NO mixed-category defaults:

### Helper function (added above the component)

```tsx
function getCategoryPlaceholders(rootCategory?: string) {
  const labels: Record<string, { name: string; desc: string }> = {
    "sports-fitness-wellness": {
      name: "e.g. Yoga Flow, HIIT Circuit, Personal Training",
      desc: "Describe the class, intensity level and what attendees should bring...",
    },
    "beauty-care": {
      name: "e.g. Haircut & Styling, Manicure, Facial Treatment",
      desc: "Describe the treatment, duration and expected results...",
    },
    "professional-services": {
      name: "e.g. Legal Consultation, Tax Filing, Business Plan",
      desc: "Describe the service, what's included and expected turnaround...",
    },
    "education-creativity": {
      name: "e.g. Piano Basics, Watercolour Workshop, Coding 101",
      desc: "Describe the class, skill level required and materials needed...",
    },
    "food-dining": {
      name: "e.g. Margherita Pizza, Chef's Tasting Menu, Signature Cocktail",
      desc: "Describe the dish, key ingredients and dietary options...",
    },
    rentals: {
      name: "e.g. Cozy Studio, 2BR Apartment, Lakeside Cabin",
      desc: "Describe the property, amenities and neighborhood...",
    },
    "rental-real-estate": {
      name: "e.g. Cozy Studio, 2BR Apartment, Lakeside Cabin",
      desc: "Describe the property, amenities and neighborhood...",
    },
    "nightlife-social": {
      name: "e.g. VIP Table, Bottle Service, Guest List Entry",
      desc: "Describe the experience, what's included and any requirements...",
    },
    "entertainment-events": {
      name: "e.g. Escape Room, Comedy Show, Live Music Night",
      desc: "Describe the experience, duration and group size...",
    },
    "shopping-retail": {
      name: "e.g. Custom Suit, Handmade Bracelet, Vintage Watch",
      desc: "Describe the product, materials, sizing and available options...",
    },
    "fashion-accessories": {
      name: "e.g. Custom Suit, Tailored Dress, Leather Bag",
      desc: "Describe the product, materials, sizing and customization options...",
    },
    automotive: {
      name: "e.g. Toyota Camry 2020, BMW 3 Series, Honda Civic",
      desc: "Describe the vehicle, features, mileage and condition...",
    },
    healthcare: {
      name: "e.g. General Checkup, Dental Cleaning, Blood Test",
      desc: "Describe the procedure, preparation needed and duration...",
    },
    pets: {
      name: "e.g. Dog Grooming, Vet Checkup, Pet Boarding",
      desc: "Describe the service, duration and any requirements for your pet...",
    },
  };

  if (rootCategory && labels[rootCategory]) {
    return labels[rootCategory];
  }
  // Fallback for unknown categories — rare, only if someone adds a new
  // category without updating this map
  return {
    name: "e.g. Service Name",
    desc: "Describe the service...",
  };
}
```

### Updated inputs (lines 306, 314)

```diff
+ const catPlaceholders = getCategoryPlaceholders(rootCategory);

  <TextInput
    placeholder={t("services.serviceNamePlaceholder",
-     "e.g. Haircut, Room 101, Margherita Pizza"
+     catPlaceholders.name
    )} .../>

  <TextInput
    placeholder={t("services.descriptionPlaceholder",
-     "Describe the service..."
+     catPlaceholders.desc
    )} .../>
```

---

## Files changed

| File | Lines | Change |
|---|---|---|
| `BusinessProfilePremium.tsx` | 260 | `services.length > 0` guard |
| `CityAdViewer.tsx` | 1-3, 112-117 | Import `useRouter`, Pressable nav |
| `ServiceModal.tsx` | ~40 new lines + 2 edits | Helper function + category placeholders |

All 3 fixes are small, isolated, and don't touch backend.
