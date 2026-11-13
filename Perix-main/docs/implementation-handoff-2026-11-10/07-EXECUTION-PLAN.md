# Ζ — Σειρά εκτέλεσης και δημιουργίας αρχείων

Κατάσταση: **σχέδιο ανάθεσης, όχι υλοποίηση.** Η σειρά βασίζεται στις εγκεκριμένες αποφάσεις των [01](01-IMPLEMENTATION.md)–[06](06-VERIFICATION-POLICY.md) και στο [04-ACCEPTANCE-AND-ROLLOUT.md](04-ACCEPTANCE-AND-ROLLOUT.md). Κάθε φάση κλείνει με έλεγχο πριν ξεκινήσει η επόμενη. **Τίποτα καταστροφικό, χρεωστικό ή διαγραφικό δεν ενεργοποιείται πριν από ρητή έγκριση.**

## 1. Γιατί αυτή η σειρά

1. **Πρώτα ασφάλεια, μετά δυνατότητες:** ο σημερινός destructive category-change (SVC-001) και τα correctness ζητήματα (SVC-002…007) διορθώνονται πριν προστεθούν quotas, ώστε τα νέα όρια να μην κάτσουν πάνω σε λάθος δεδομένα.
2. **Θεμέλιο πριν από κάθε όριο:** ένας server-side entitlement resolver (shadow mode) δίνει plan/quota σε κάθε actor χωρίς να ξαναγράφεται λογική ανά endpoint.
3. **Enforcement πριν από UI:** τα quotas ισχύουν στο backend πρώτα· το frontend δείχνει κατάσταση και λόγους, δεν αποφασίζει.
4. **Κάθε φάση = ένα αρχείο/domain ownership:** shared αρχεία (database.py, profile.tsx, AuthContext.tsx, serviceModules.ts) αλλάζουν μία φάση τη φορά για να μη συγκρούονται παράλληλοι ανάδοχοι.
5. **Μη ενεργές αποφάσεις δεν ξεκλειδώνονται:** οι φάσεις περιέχουν τον ακριβή gate (D01–D14) που πρέπει να έχει κλείσει.

## 2. Φάσεις — επισκόπηση

| Φάση | Περιεχόμενο | Κλείνει με |
|---|---|---|
| Φ0 | Baseline, regression, ασφάλεια μεταβάσεων | Non-destructive category change + SVC fixes με tests |
| Φ1 | Entitlements / συνδρομές / Founder (shadow) | Resolver read + shadow evaluation report |
| Φ2 | Ενιαία Δημιουργία και ταυτότητες | Ένα action menu με verified actor σε web/mobile |
| Φ3 | Quotas ειδικοτήτων και απόκρυψη Mobility | Atomic όρια 10/50/100/20/10+100/50 και visibility |
| Φ4 | Μηνύματα: quota, identity, context, retention | Send service + usage counters + media window |
| Φ5 | Posts / γκαλερί | 3/12/24 posts, 30d/1y, gallery 3/12/30 & 0/6/12 |
| Φ6 | Marketplace / Αγγελίες / product taxonomy | Item kinds, 1 home Premium, ακριβή νέα paths |
| Φ7 | Events quota | 4 ενεργά βασικά, recurring semantics |
| Φ8 | City Ads | 24 θέσεις/πόλη/ημέρα, rotation, κράτηση/πληρωμή sandbox |
| Φ9 | Icons / taxonomy / l10n / QA | Registry κενά, μεταφράσεις, regression suite |

**Κατάσταση Φ0 (11 Νοε 2026):** SVC-001…007 εφαρμόστηκαν στο working tree (`backend/routes/businesses.py`, `backend/routes/services.py`), `py_compile` OK. Εκκρεμούν regression/rollback και το D13 σχέδιο [08](08-ARTIST-MIGRATION-PLAN.md). Χωρίς commit/deploy.

**Κατάσταση Φ1 (11 Νοε 2026):** Backend θεμέλιος entitlements σε shadow mode (`utils/quota.py`, `services/entitlements.py`, `models/entitlement.py`+`models/subscription.py`, `routes/subscriptions.py` με `GET /api/account/entitlements`, server-assigned `account_plan`, indexes, router registration) + frontend `lib/constants/planLimits.ts` και `lib/api/account.ts`. `py_compile`/assertions OK. Εκκρεμεί σύνδεση στο AuthContext (αρχείο με άλλες τοπικές αλλαγές).

**Κατάσταση Φ2 (11 Νοε 2026):** Δημιουργήθηκε ο κοινός creation resolver `frontend/lib/creation/creationActions.ts` (v18: Free → post + classified_ad, Premium → + product/activity/home, Business → product/service/event/job, reason codes, artist deprecated), συνδέθηκε στα `CreationSheet.tsx` και `BusinessActionsModal.tsx` με προαιρετικό `entitlements` prop (χωρίς αλλαγή υφιστάμενης συμπεριφοράς όταν λείπει) και προστέθηκε test `frontend/tests/creation-actions.test.cjs` (πράσινο). **Εκκρεμεί:** σύνδεση snapshot στο AuthContext/GlobalWebChrome (αρχεία με άλλες τοπικές αλλαγές) και end-to-end έλεγχος flows.

**Κατάσταση Φ9 (11 Νοε 2026):** i18n φάσης 1 σε `en.json`/`de.json` (17 cats/164 subs), εικονογραφήσεις νέων roots ήδη στο generated map. QA regression frontend: **359 tests, 357 pass, 2 fail** — τα 2 failures προϋπάρχουν στα δικά σου untracked tests (`civic-jobs-icons`, `gateway-mobility-location`), εκτός αλλαγών του πακέτου. Δικά μας tests και backend py_compile πράσινα. **Εκκρεμούν:** λοιπά locales, screenshots/accessibility, backend pytest σε test DB.

**Κατάσταση UX πλάνων (11 Νοε 2026):** Δημιουργήθηκε η σελίδα **`frontend/app/plans.tsx`** (`/plans`): κάρτες Free/Premium/Business με τιμές-στόχους v18, χαρακτηριστικά, **πίνακας σύγκρισης**, teaser Event Pro/Organizer («σύντομα») και επιλογή — Free επιβεβαιώνει το τρέχον πλάνο, Premium/Business δείχνουν «σύντομα διαθέσιμο» χωρίς καμία χρέωση. Το **`CreationSheet.tsx`** έγινε ενιαίο μενού με τρεις ενότητες (Ως Χρήστης / Premium / Επιχείρηση): όλα όσα μπορεί να κάνει κάποιος, με κλειδωμένες γραμμές + **Upgrade pill** που οδηγεί στο `/plans` και κουμπί «Δες τα πλάνα». Δουλεύει και χωρίς entitlements (defaults) — το υπάρχον κουμπί δημιουργίας στο mobile ανοίγει ήδη αυτό το sheet. **Design/ροή απόφασης ιδιοκτήτη:** (1) login/signup μπαίνει πάντα ως χρήστης· (2) «Δημιουργία επιχείρησης» στο IdentityDropdown οδηγεί στο `/plans` (πληρωμή πλάνου → ξεκλείδωμα Business, όταν ενεργοποιηθεί ο πάροχος)· (3) ξύλινο design: asset `frontend/assets/brand/wooden-button.png` + component `WoodBadge.tsx` (αυτόματο μέγεθος ανά κείμενο, stretch, ευδιάκριτα γράμματα) πίσω από τα ονόματα των πλάνων και πίσω από το μήνυμα «Standort festlegen, um fortzufahren» στο origin gate της αρχικής· (4) «Δες τα πλάνα» banners σε UserProfilePremium/BusinessProfilePremium. **Εκκρεμούν:** πραγματική σύνδεση επιλογής πλάνου με subscription (Φ1/πάροχος), i18n keys στα locales.

## Ολοκλήρωση υλοποίησης Φ0–Φ9 (σύνοψη)

Όλα τα enforcement **feature-flagged OFF** — ενεργοποιούνται μόνο μετά τα 1-1 tests:

| Flag | Τι ενεργοποιεί |
|---|---|
| `QUOTA_ENFORCEMENT` | Φ3: 10/50/100/20/10+100/50 business quotas |
| `MESSAGE_QUOTA_ENFORCEMENT` / `RETENTION_ENFORCEMENT` / `MEDIA_WINDOW_ENFORCEMENT` | Φ4: 30/απεριόριστα (v19), 30d, 15 αρχεία |
| `POST_LIMITS_ENFORCEMENT` / `POST_RETENTION_ENFORCEMENT` / `GALLERY_LIMITS_ENFORCEMENT` | Φ5: 3/12/24 (Free 3 στα 3 με αντικατάσταση, v19), 30d/365d, 3/12/30 & 0/6/12 |
| `CLASSIFIED_AD_ENFORCEMENT` / `PREMIUM_LIMITS_ENFORCEMENT` | Φ6: 3 αγγελίες/30d, 10 προϊόντα, 1 σπίτι |
| `EVENTS_QUOTA_ENFORCEMENT` | Φ7: 4 ενεργά Events |
| `CITYADS_ENFORCEMENT` (+ `CITYADS_SANDBOX`) | Φ8: 24 θέσεις, rotation, sandbox πληρωμή |
| `JOB_APPLICATIONS_ENFORCEMENT` / `JOB_POSTS_ENFORCEMENT` | v19: αιτήσεις εργασίας Free 3/μήνα, Premium απεριόριστες · Business 10 θέσεις/έτος |

## 3. Φ0 — Baseline, regression, ασφάλεια

**Προϋποθέσεις:** καμία επιπλέον απόφαση. **Στόχος:** το έδαφος να μην καταστρέφει δεδομένα.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend fix | `backend/routes/businesses.py:316–336` — μη καταστροφική αλλαγή root/category: διατήρηση ή controlled retirement αντί delete_many (SVC-001). |
| Backend fix | `backend/routes/services.py` — SVC-002…007: canonical root/subcategory στο doc, fail-closed allowed_types, normalization status, model_dump(exclude_unset), ρητή booking-mode resolution. |
| Backend review | `backend/routes/rentals.py` — SVC-015…017 αποτύπωση στο audit· διορθώσεις identity/location όπου κλείνουν ανεξάρτητα. |
| Tests | Απομονωμένα fixtures για create/update/publish/reactivate/booking round-trips, explicit null vs omitted, λάθος root, άδειο types. **Όχι σε production DB.** |
| Frontend | Καμία λειτουργική αλλαγή. |
| Exit | Πράσινα regression, dry-run αναφορά legacy records, documented rollback, **D13: σχέδιο migration artist → Business artists-performers (εγκεκριμένο, μη καταστροφικό)**. |

## 4. Φ1 — Entitlements / συνδρομές / Founder (shadow mode)

**Προϋποθέσεις:** D01 (προσωπικό Free/Premium + Business entitlement στην ιδιοκτησία), D13 (Artists προστασία), Φ0.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Νέα backend | `backend/models/subscription.py`, `backend/models/entitlement.py`, `backend/routes/subscriptions.py`, `backend/services/entitlements.py`, `backend/utils/quota.py` (atomic counters, idempotency). |
| Backend τροποποίηση | `models/user.py`, `models/business.py` (additive), `routes/auth.py` (server defaults Free), `routes/dependencies.py` (actor resolution), `routes/businesses.py` (Founder: plan_type founder + free_until αμετάβλητα), `database.py` (indexes). |
| Read contract | `GET /api/account/entitlements?actor_type=&actor_id=` με plan/limits/usage/reason_codes/next_reset· server ownership check. |
| Frontend | `frontend/context/AuthContext.tsx` (snapshot ανά actor), `frontend/lib/api/account.ts`, `frontend/lib/constants/planLimits.ts` (ενδεικτικά, όχι authority). |
| Shadow | Resolver υπολογίζει χωρίς enforcement· σύγκριση με legacy συμπεριφορά σε αναφορά. |
| Exit | Σταθερό snapshot, Founder unchanged, no πραγματική χρέωση. |

## 5. Φ2 — Ενιαία Δημιουργία και ταυτότητες

**Προϋποθέσεις:** Φ1 read contract. **Στόχος:** το κουμπί Δημιουργία να λειτουργεί με μία λογική και σαφή actor.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Frontend | `components/GlobalWebChrome.tsx`, `context/CreateFlowContext.tsx`, `components/user/CreationSheet.tsx`, `components/business/BusinessActionsModal.tsx`, `components/TopNavbar.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/profile.tsx` (handlers), `components/profile/IdentityDropdown.tsx`. |
| Νέο frontend | `frontend/lib/creation/creationActions.ts` — mapping actor+entitlements → επιτρεπόμενες ενέργειες + reason codes. |
| Συμβατότητα | `openProduct/openService/openEvent/openJob/openActivity` params παραμένουν. |
| Exit | Κλειδωμένες ενέργειες δείχνουν αιτία· ίδια συμπεριφορά web/mobile/deep links· κανένα post από λάθος actor. |

## 6. Φ3 — Quotas ειδικοτήτων και απόκρυψη Mobility

**Προϋποθέσεις:** D06 (κλειστό με τα εγκεκριμένα όρια), D10 (αρχή δικαιωμάτων), Φ1 enforcement. **Ενεργοποίηση με feature flags ανά bucket.**

| Όριο | Επιβολή στο |
|---|---|
| 10 ενεργές Services ανά Business | `backend/routes/services.py` publish/reactivate με `utils/quota.py` |
| 50 ενεργά προϊόντα | `backend/routes/listings.py` + product-like Services adapter |
| 100 menu entries | `backend/routes/services.py` (menu_item) |
| 20 επαγγελματικά ακίνητα | Services+Listings+rentals με capability resolver (μεσίτες/διαχειριστές χωρίς αλλαγή root) |
| 10 τύποι + 100 μονάδες ξενοδοχείων | `backend/routes/services.py` (hotel_room, δύο έλεγχοι) |
| 50 οχήματα προς πώληση | `backend/routes/services.py` (auto_vehicle) |
| Mobility μη δημόσιο | Category endpoints/register/create server-side deny + `frontend` pickers/register απόκρυψη |

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend | `routes/services.py`, `routes/listings.py`, `routes/rentals.py`, `utils/quota.py`, `services/entitlements.py`, `database.py`. |
| Frontend | `BusinessActionsModal.tsx` (counts), `ServiceModal.tsx`, `BusinessProfilePremium.tsx`, `UserProfilePremium.tsx`, `EventsSection.tsx`, `lib/constants/planLimits.ts`, category pickers (Mobility κρυφό). |
| Exit | Κάθε 51ο/101ο/21ο/11ο/… απορρίπτεται ατομικά και με παράλληλα requests· drafts/κρατήσεις δεν μετρούν· legacy πάνω από όριο δεν διαγράφεται. |

## 7. Φ4 — Μηνύματα

**Προϋποθέσεις:** D07 (ζώνη μήνα, group chats, inquiries, 15 αρχεία, διάρκεια μετά το context), D12 (active-case states), Φ1.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend | `models/message.py` (sender identity, conversation_id, context_type/context_id, expires_at, policy version), `routes/messages.py` (send service, usage counters, media window 15), `routes/services.py`/`routes/rentals.py` (inquiries στο κοινό send), `utils/cleanup.py` (retention με context resolver), `database.py` (indexes). |
| Frontend | `app/(tabs)/messages/[id].tsx` (υπόλοιπο/επαναφορά, business sender, tombstones), `lib/api/messages.ts`. |
| Exit | Free 31η/ Premium 201η απορρίπτονται· business unlimited χωρίς να τρώει προσωπικό quota· 16ο media αντικαθιστά παλαιότερο· active contexts προστατεύονται· idempotent sends. |

## 8. Φ5 — Posts / γκαλερί

**Προϋποθέσεις:** D04, D05, D11, Φ1.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend | `routes/posts.py` (3/12/24, 30d/1y, feed vs profile), `routes/feed.py`, `routes/profiles.py` + `routes/businesses.py` (γκαλερί 3/12/30 και 0/6/12), `utils/cleanup.py` (batches, media refs). |
| Frontend | `components/profile/ProfilePosts.tsx`, `GalleryCustomizer.tsx`, `UserProfilePremium.tsx`, `BusinessProfilePremium.tsx`, `lib/constants/mediaLimits.ts`. |
| Exit | 13ο Premium αντικαθιστά παλαιότερο μόνο σε επιτυχία· **25ο Business αντικαθιστά το παλαιότερο και αφαιρεί αυτό + τα media του (v18)**· ληγμένα δεν εμφανίζονται· shared media δεν διαγράφονται πρόωρα· **γκαλερί: αυτόματη αντικατάσταση παλαιότερου, avatar/cover ανέγγιχτα (v18)**. |

## 9. Φ6 — Marketplace / Αγγελίες / product taxonomy

**Προϋποθέσεις:** D02, D03, D10 (ακριβείς νέοι κωδικοί), Φ1/Φ3 product counters.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend | `models/listing.py` (item_kind/classified_ad), `routes/listings.py`, `utils/product_permissions.py` (συμπλήρωση matrix Retail με ρητά εγκεκριμένα paths, SVC-019), aliases. |
| Frontend | `components/user/ListingModal.tsx`, `lib/api/listings.ts`, `lib/marketplace/marketplaceTaxonomy.ts`, `components/marketplace/MarketplaceCategoryPicker.tsx`, `hooks/marketplace/useViewportListings.ts`. |
| Exit | Free μόνο Αγγελίες, Premium 1 ενεργό σπίτι, Business product paths αυστηρά· legacy links/IDs ανοίγουν. |

## 10. Φ7 — Events quota

**Προϋποθέσεις:** βασικό 4 εγκεκριμένο· 30/100 και τιμές παραμένουν εκτός.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend | `routes/events.py` (atomic 4 active query, recurring semantics, Artist ροή ανέπαφη), `utils/cleanup.py` (event context retention πριν purge). |
| Frontend | `components/business/EventsSection.tsx`, `lib/api/events.ts`, `BusinessProfilePremium.tsx`. |
| Exit | 5ο ενεργό δεν περνά· downgrade δεν διαγράφει· παλιά Events/Artist ασφαλή. |

## 11. Φ8 — City Ads

**Προϋποθέσεις:** D08, D09 (πληρωμές/επιστροφές), Φ1.

| Τύπος | Εργασία / αρχεία |
|---|---|
| Backend | `models/promotion.py`, `routes/promotions.py`, `services/ad_inventory.py` (24 θέσεις/πόλη/ημερομηνία, holds, states), payments με sandbox provider· legacy `stories.py` adapter. |
| Frontend | `lib/api/promotions.ts`, `components/home/CityAdCircles.tsx`, `components/stories/CityAdViewer.tsx`, `hooks/useFeedData.ts`, κοινό City Ads results component. |
| Exit | 25η κράτηση δεν περνά· rotation 2 impressions/ζεύγος· χωρίς πληρωμή/έγκριση δεν ενεργοποιείται· οργανικά αποτελέσματα ασφαλή. |

## 12. Φ9 — Icons / taxonomy / l10n / QA

**Προϋποθέσεις:** εγκεκριμένα νέα taxonomy paths (D10), icons handoff [03](03-ICONS-HANDOFF.md).

| Τύπος | Εργασία / αρχεία |
|---|---|
| Frontend | Κενά από `generated/icon-inventory.csv` μέσω υπάρχοντος `IllustratedIcon`, `marketplaceTaxonomy.ts`, `serviceModules.ts`/`serviceCategoryMatrix.ts` (με approved matrix), `i18n/locales/*`. |
| QA | Πλήρες regression: frontend `node --test tests/`, backend pytest σε test DB, screenshots web/mobile, accessibility. |
| Exit | Όλα τα ενεργά keys έχουν icon/label· no broken images· tests πράσινα. |

## 13. Σειρά δημιουργίας νέων αρχείων (κατά προσέγγιση)

1. `backend/utils/quota.py` — ατομικοί μετρητές/idempotency (Φ1).
2. `backend/models/subscription.py`, `backend/models/entitlement.py` (Φ1).
3. `backend/services/entitlements.py` — resolver (Φ1).
4. `backend/routes/subscriptions.py` + read snapshot endpoint (Φ1).
5. `frontend/lib/api/account.ts`, `frontend/lib/constants/planLimits.ts` (Φ1).
6. `frontend/lib/creation/creationActions.ts` (Φ2).
7. Quota enforcement helpers σε `utils/quota.py` + flags (Φ3).
8. Message context/send modules σε `routes/messages.py` (Φ4).
9. Posts/gallery policy helpers (Φ5).
10. Listing `item_kind` + product matrix additions (Φ6).
11. Event quota helper (Φ7).
12. `backend/models/promotion.py`, `backend/services/ad_inventory.py`, `backend/routes/promotions.py` (Φ8).
13. `frontend/lib/api/promotions.ts`, κοινό City Ads results component (Φ8).
14. Icon/l10n συμπληρώσεις βάσει `icon-inventory.csv` (Φ9).

Κάθε νέο αρχείο συνοδεύεται από tests την ίδια φάση, όχι στο τέλος.

## 14. Πύλες αποφάσεων (τι ξεκλειδώνει τι)

| Απόφαση | Ξεκλειδώνει | Κατάσταση |
|---|---|---|
| D01, D13 | Φ1 (D13 migration μπαίνει στη Φ0/Φ1) | **Κλειστές (v18)** |
| D06, D10 (αρχή) | Φ3 | **Κλειστές** |
| D07, D12 | Φ4 | **Κλειστές (v18)** |
| D04, D05, D11 | Φ5 | **Κλειστές (v18)** — Φ5 εφαρμόζει: 25ο Business post αντικαθιστά το παλαιότερο και καθαρίζει media του· γκαλερί αυτόματη αντικατάσταση |
| D02, D03, D10 (ακριβείς κωδικοί) | Φ6 | **Κλειστές (v18)** — classified_ad 3/30d, 10 Premium προϊόντα, 17/184 σε φάσεις |
| Events 30/100, τιμές | Φ7 (μόνο βασικό 4 τώρα) | **Κλειστές ως στόχος (v18)** — ενεργοποίηση μόνο μετά Φ7 |
| D08, D09 | Φ8 | **Κλειστές (v18)** — εντύπωση 50%/1s/dedupe, κοινή κατάσταση, τιμές-στόχος, sandbox πάροχος |
| D14 | Επαλήθευση | Αναιρεμένη προς το παρόν (ελεγχόμενες εισαγωγές) |

## 15. Κανόνες παράδοσης ανά φάση

- Λίστα αρχείων που άλλαξαν/δημιουργήθηκαν, migrations με dry-run, rollback οδηγίες.
- Πραγματικά αποτελέσματα tests (pass/fail/skipped), όχι μόνο λίστα επιθυμητών.
- Screenshots/recordings για UI αλλαγές σε web/mobile.
- Κανένα secret, καμία πραγματική χρέωση, καμία διαγραφή χωρίς ξεχωριστή έγκριση.
- Ενημερωμένο audit log με resolved/unresolved και αναφορές σε PRs.
