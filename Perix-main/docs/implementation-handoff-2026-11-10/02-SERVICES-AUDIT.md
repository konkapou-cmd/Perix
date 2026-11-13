# Β — Services: έλεγχος συγχρονισμού και ανάθεση διορθώσεων

**Έλεγχος στατικού τοπικού κώδικα · 2026-11-10.** Δεν έγιναν κλήσεις σε πραγματικό API/DB και δεν επιβεβαιώθηκε end-to-end λειτουργία. Τα αναφερόμενα προβλήματα είναι συμπεριφορές/κίνδυνοι που προκύπτουν από τον κώδικα, όχι ισχυρισμός εκμετάλλευσης στην παραγωγή.

## 1. Συμπέρασμα

**Συγχρονισμένα configuration keys και booking modes — όχι ακόμη εγγυημένα σωστά επαγγελματικά δικαιώματα, αποθήκευση ή quotas.**

Συγκρίθηκαν μηχανικά:

- `backend/database.py` → `ROOT_SERVICE_TYPES`, `ROOT_SERVICE_BOOKING_CONFIG`.
- `frontend/lib/config/serviceCategoryMatrix.ts` → `allowedModules`.
- `frontend/lib/config/serviceModules.ts` → modules, `allowedRootCategories`, `getBookingMode`.
- `backend/models/service.py` → παρουσία πεδίων σε Create/Update/Response.

Αποτελέσματα: 35 μοναδικοί τύποι, 15 root entries μαζί με alias, **0 διαφορές allowed modules, 0 διαφορές booking mode, 0 ασυμφωνίες declared allowed roots**. Όλα τα συγκρινόμενα module fields/requiredFields υπάρχουν στα backend Create και Response models. Αυτό **δεν** αποδεικνύει ίδιους required validators, enum/range rules ή round-trip της φόρμας.

Πλήρεις πίνακες: [service-sync.csv](generated/service-sync.csv), [service-field-contract.csv](generated/service-field-contract.csv), [business-service-review.csv](generated/business-service-review.csv).

## 2. Όλοι οι σημερινοί τύποι, ομαδοποιημένοι

`time_slot`: κράτηση με slot. `request`: αίτημα χωρίς ωριαίο slot. `none`: όχι Booking API. `date_range`: διαμονή με ημερομηνίες και inventory.

| Root | Module → booking mode |
|---|---|
| sports-fitness-wellness | gym_class → time_slot · gym_session → time_slot · gym_recovery → time_slot · gym_membership → none · gym_pass → none |
| beauty-care | salon_appointment → time_slot · salon_package → time_slot · salon_course → request |
| professional-services | pro_consultation → time_slot · pro_package → none · pro_retainer → none |
| education-creativity | edu_class → time_slot · edu_lesson → time_slot · edu_workshop → time_slot · edu_course → none |
| food-dining | menu_item → none · table_reservation → time_slot |
| nightlife-social | table_reservation → time_slot · vip_package → request |
| entertainment-events | ent_booking → time_slot · ent_performance → time_slot |
| shopping-retail | retail_product → none · retail_custom → none |
| fashion-accessories | retail_product → none · tailoring_alteration → request · custom_order → none |
| automotive | auto_vehicle → none · auto_rental → time_slot · auto_repair → time_slot · auto_wash → time_slot |
| healthcare | health_appointment → time_slot · health_procedure → time_slot · health_test → time_slot |
| pets | pet_appointment → time_slot · pet_product → none |
| rentals | rental_property → request |
| rental-real-estate | rental_property → request, legacy root |
| local-hotels | hotel_room → date_range |
| mobility-transport | **Χωρίς Service types**, όχι αυτόματα permission για όλα |

Το CTA δεν ταυτίζεται με booking mode: π.χ. `auto_vehicle` έχει CTA reservation αλλά `bookingEnabled=false`. Αυτό χρειάζεται UX έλεγχο στον πραγματικό caller, όχι αυτόματη ενεργοποίηση Booking API από το label. Παρόμοια, `request_quote` μπορεί να είναι inquiry και όχι τεχνικό booking.

## 3. Νέα ευρήματα με αποδεικτικές τοποθεσίες

| ID / προτεραιότητα | Τοποθεσία | Διαπίστωση και ζητούμενο |
|---|---|---|
| SVC-001 / P0 migration | `backend/routes/businesses.py:316–336` | Αλλαγή root διαγράφει jobs, applications, Services, Bookings, Events, Listings, Business posts και αδειάζει media/άλλα στοιχεία. **Καμία taxonomy migration μέσω αυτού του endpoint πριν προστεθεί μη καταστροφική ροή.** Δεν διορθώθηκε εδώ. |
| SVC-002 / P1 correctness | `backend/routes/services.py:183,219–247` | Ο έλεγχος create χρησιμοποιεί root της επιχείρησης, αλλά αποθηκεύεται αυτούσιο `payload.model_dump()`. Δεν γίνεται αναγκαστική εγγραφή του resolved root/subcategory στο doc. Missing ή αλλοιωμένο client root μπορεί να αφήσει service που οι μεταγενέστερες κρατήσεις ερμηνεύουν αλλιώς. Server canonicalization πριν αποθήκευση. |
| SVC-003 / P1 authorization | `backend/routes/services.py:199–209`, `backend/database.py:416–439` | Το `if allowed_types and …` απορρίπτει μόνο όταν η λίστα δεν είναι κενή. Με ενεργό services flag και άδεια/άγνωστη λίστα μπορεί να μην απορριφθεί τύπος. Το category builder έχει γενικό `services=True`. Empty/unknown επιτρεπόμενο σύνολο πρέπει να είναι deny, όχι allow. |
| SVC-004 / P1 correctness | `backend/models/service.py:112`, `backend/routes/services.py:211–247,294` | Το publish validation παίρνει default `published`, αλλά στο stored doc περνά το raw `status`, που μπορεί να είναι `None` όταν λείπει. Η λίστα απαιτεί ακριβώς `status=published`. Normalization/validation status πριν persist και tests omitted status. |
| SVC-005 / P1 authorization | `backend/models/service.py:118–120`, `backend/routes/services.py:776–839` | Update επιτρέπει root/subcategory και τα χρησιμοποιεί για booking config, χωρίς αντίστοιχη αντιστοίχιση με την επιχείρηση/ειδικότητα. Canonicalization και revalidation σε update, publish και reactivation. Το `type` δεν εκτίθεται στο σημερινό ServiceUpdate· δεν προσθέτουμε αλλαγή τύπου χωρίς migration contract. |
| SVC-006 / P1 data | `backend/models/service.py:126–146,180–181`, `backend/routes/services.py:786–789` | Update model έχει default κενές λίστες και γίνεται `model_dump()` χωρίς `exclude_unset=True`. Ένα μερικό update μπορεί να στείλει `$set` κενών λιστών που δεν υπέβαλε ο caller (π.χ. gallery/facilities/included_services). Διάκριση omitted, explicit empty και explicit null, με round-trip tests. |
| SVC-007 / P1 booking | `backend/routes/services.py:354–389`, `backend/services/date_range_booking.py:29–39` | Άγνωστο/ελλιπές booking config γίνεται legacy `time_slot` όταν είναι `None`. Με τα SVC-002/005 το persistent root είναι κρίσιμο. Ρητή legacy resolution path και deny για πραγματικά άγνωστους συνδυασμούς, όχι γενικός permissive fallback. |
| SVC-008 / P1 quota | `backend/routes/services.py:167–277`, `backend/routes/businesses.py:191–194` | Δεν υπάρχει νέο όριο 10 και το subscription gate επιστρέφει True. Πρώτα resolver/buckets/Founder, μετά quota, όχι οριζόντιο count όλων των db.services. |
| SVC-009 / P1 policy | `backend/database.py:742–755`, `frontend/lib/config/serviceCategoryMatrix.ts:450–459,478–479`, `frontend/components/business/ServiceModal.tsx:354–355` | Οι ειδικότητες κληρονομούν modules από root, τα helper arguments subcategory αγνοούνται. Δεν υπάρχουν οι απαιτούμενες λεπτομερείς άδειες ανά επάγγελμα. |
| SVC-010 / P1 messaging | `backend/routes/services.py:624–638`, `backend/routes/rentals.py:375` | Inquiry γράφει απευθείας στο messages. Υπάρχει service_id στη μία ροή αλλά όχι το νέο κοινό context/usage service. Ενιαίο enforcement, χωρίς απώλεια παλιών inquiry links. |
| SVC-011 / P1 lifecycle | `backend/routes/services.py:927–942` | Delete είναι soft deactivate και ακυρώνει pending bookings, ενώ confirmed δεν διαγράφονται. Διατήρηση αυτής της προστασίας και σχεδιασμός για inventory/holds/confirmed servicing, όχι αντικατάσταση με hard delete. |
| SVC-012 / review | `backend/database.py:30–99`, `frontend/lib/config/serviceModules.ts:510–547` | Hotel date-range mode ήδη υπάρχει. Δεν πρέπει να μετατραπεί σε time slots από νέο generic quota/booking helper. |
| SVC-013 / P1 booking | `backend/routes/services.py:385–393,963–1000` | Create δεσμεύει ολόκληρο slot με `is_booked=True`, ενώ availability εμφανίζει capacity/counts αλλά αποκλείει ήδη booked slots. Δεν πιστοποιείται πολλαπλή ανεξάρτητη κράτηση θέσεων ή απογραφή πολλών πόρων από τα πεδία capacity. Χρειάζεται απομονωμένο reproduction/capacity audit και regression tests· αφορά και ομαδικά Fitness μαθήματα. |
| SVC-014 / P1 booking | `backend/routes/services.py:29–38,73–80,1010–1041,1044–1075` | Same-day σύγκριση λεπτών απορρίπτει 23:00→02:00 και δεν αναπαριστά πλήρες overnight διάστημα/overlaps. Εγκρίθηκε να προστεθεί στην ανάθεση σωστός σχεδιασμός ημερομηνιών έναρξης/λήξης, business timezone, DST και συμβατής μετάβασης. Δεν αρκεί αφαίρεση του ελέγχου `start >= end`. |
| SVC-015 / P1 identity | `backend/routes/rentals.py:71–108,293–313`, `backend/routes/listings.py:153–168` | Rental Listing adapter hardcodes προσωπική ταυτότητα και ο Listing inquiry branch προσωπικό recipient, ενώ Listings ήδη δέχονται Business seller. Απαιτείται σωστή επαγγελματική ταυτότητα/recipient/context και κοινή καταμέτρηση χωρίς duplicate records. |
| SVC-016 / P1 privacy/location | `backend/routes/rentals.py:26–68,155–160,240–272` | Service rental adapter χρησιμοποιεί property/business fallback location χωρίς τον public-location μετασχηματισμό της Listing πηγής. Εγκρίθηκε approximate default για επαγγελματικά ακίνητα, explicit authorized exact και όχι έδρα γραφείου ως θέση ακινήτου. Απαιτείται έλεγχος όλων των δημόσιων API· δεν έγινε έλεγχος παραγωγής. |
| SVC-017 / P1 management | `backend/routes/rentals.py:220–237` | `/rentals/my` περιορίζει επιχειρήσεις σε rentals/rental-real-estate και ανακτά μόνο Services. Νέες cross-domain άδειες μεσιτών/διαχειριστών και συμβατές Listing πηγές χρειάζονται capability-aware management inventory χωρίς αλλαγή root. |
| SVC-018 / P1 inventory | `backend/services/date_range_booking.py:187–209,221–240`, `backend/models/service.py:103` | Hotel inventory/κρατήσεις/blocks υπολογίζονται ανά service_id. Δεν τεκμηριώνεται κοινό physical pool μεταξύ διαφορετικών offers/Service IDs π.χ. με/χωρίς πρωινό. Αποφυγή ψευδώς ανεξάρτητου ίδιου stock και στοχευμένο audit· δεν εγκρίθηκε τώρα νέο rate-plan/shared-pool σύστημα ούτε επιβεβαιώθηκε πραγματική υπερκράτηση παραγωγής. |
| SVC-019 / P1 product-policy | `backend/utils/product_permissions.py:51–79,147–156` | Shopping-retail έχει 6 ειδικότητες αλλά λείπει gifts-souvenirs από product policy και florists χρησιμοποιεί garden/decoration του home_garden_diy, όχι προτεινόμενο flowers_gifts. Εγκρίθηκε εργασία ακριβούς matrix συμπλήρωσης, όχι unrestricted fallback ή αυτόματη ενεργοποίηση νέας taxonomy. Enforcement πρέπει να καλύπτει και legacy product-like Service εισόδους, όχι μόνο τη φόρμα Listings. |

### Κατάσταση μετά τη Φ0 (2026-11-11): SVC-001…007 εφαρμόστηκαν στο working tree

| ID | Διόρθωση που εφαρμόστηκε | Σημείο κώδικα μετά την αλλαγή |
|---|---|---|
| SVC-001 | Η αλλαγή root **δεν διαγράφει πλέον** jobs, applications, services, bookings, events, listings, posts ούτε αδειάζει media/πεδία. Ορίζονται `category_change_review_required`, `previous_root_category`, `category_changed_at` για ελεγχόμενη αναθεώρηση. | `backend/routes/businesses.py` (update_business, block `category_change`) |
| SVC-002 | To create αποθηκεύει πάντα server-canonical `root_category`/`subcategory` της επιχείρησης, παρακάμπτοντας client τιμές. | `backend/routes/services.py` create_service (canonical fields + doc override) |
| SVC-003 | Fail-closed: ενεργά services με κενή/άγνωστη λίστα types απορρίπτουν νέα δημοσίευση αντί permissive allow. | `backend/routes/services.py` create_service (allowed_types) |
| SVC-004 | Κανονικοποιημένο `status` αποθηκεύεται (published/draft), ποτέ None. | `backend/routes/services.py` create_service (doc status) |
| SVC-005 | Στο update, client root/subcategory αγνοούνται· παραμένουν οι server/business τιμές. | `backend/routes/services.py` update_service (pop canonical) |
| SVC-006 | `model_dump(exclude_unset=True)`: omitted πεδία δεν αδειάζουν αποθηκευμένα δεδομένα· ρητό κενό [] παραμένει πρόθεση client. | `backend/routes/services.py` update_service |
| SVC-007 | Άγνωστο booking config με δηλωμένο type απορρίπτεται (400)· μόνο legacy docs χωρίς type κρατούν το ιστορικό time-slot fallback. | `backend/routes/services.py` create_booking |

Επαληθεύτηκε `py_compile` και στα δύο αρχεία. **Εκκρεμούν** (δεν εκτελέστηκαν εδώ): backend pytest σε απομονωμένο test DB, migration dry-run και rollback έλεγχος. Οι αλλαγές είναι τοπικές στο working tree, χωρίς commit/deploy.

Οι γραμμές ισχύουν για το ελεγχθέν working tree. Σε αλλαγή έκδοσης αναζητήστε και τα ονόματα συναρτήσεων. Οι hashes των βασικών configuration πηγών είναι στο `generated/audit-summary.json`.

## 4. Συγκεκριμένη ανάθεση Services

### Εγκεκριμένοι κανόνες μετά τον αρχικό έλεγχο

- 10 ενεργές δημοσιευμένες **κανονικές υπηρεσίες ανά επιχείρηση συνολικά**. Drafts, slots και Bookings δεν μετρούν.
- Μενού, προϊόντα, οχήματα, ξενοδοχεία και ακίνητα έχουν **χωριστά όρια**, όχι χρέωση στις 10 θέσεις. Εγκρίθηκαν **100 menu entries**, **20 επαγγελματικά ακίνητα**, **50 οχήματα προς πώληση** και για Ξενοδοχεία **10 τύποι/100 φυσικές μονάδες ανά Business** στα αντίστοιχα buckets, ανεξάρτητα από το 50 προϊόντων. Δεν υπάρχει πλέον εκκρεμές όριο οχημάτων· εκκρεμούν μόνο οι πολιτικές μη εγκεκριμένων κλάδων. Καμία εξαίρεση δεν είναι unlimited.
- Ένωση δικαιωμάτων από όλες τις **εγκεκριμένες** ειδικότητες με το ίδιο συνολικό quota. Κάθε καταχώριση αντιστοιχεί στη σωστή ειδικότητα και τηρεί τις απαιτούμενες επαγγελματικές επαληθεύσεις.
- Νέες δημοσιεύσεις με **ακριβή άδεια ανά επάγγελμα**, όχι γενική root-level άδεια. Legacy καταχωρίσεις/κρατήσεις προστατεύονται και αξιολογούνται χωριστά.

Οι παρακάτω πίνακες παραμένουν προτάσεις στο επίπεδο συγκεκριμένων module permissions/buckets, μέχρι να εγκριθεί κάθε αντιστοίχιση. Δεν άλλαξε application source.

### S1 — Regression πριν από νέα δικαιώματα

Σε τοπική απομονωμένη βάση/fixtures καταγράφονται round-trips Create → List → Detail → Edit → Booking για κάθε mode. Περιλαμβάνονται εσκεμμένα missing status/root, λάθος root, άδειο allowed_types, explicit null, omitted list, draft/publish/reactivate και αλλαγή ειδικότητας. Μην τρέξετε τα API integration tests σε production: δημιουργούν λογαριασμούς/εγγραφές.

### S2 — Μία server-owned ταξινόμηση

Η business ιδιοκτησία και εγκεκριμένες `subcategories` είναι η πηγή. Root/type/subcategory του request δεν γίνονται ανεξέλεγκτα authority. **Εγκρίθηκε union δικαιωμάτων από όλες τις εγκεκριμένες ειδικότητες**, με κοινό όριο ανά επιχείρηση και σύνδεση κάθε Service στη σωστή ειδικότητα. Το σημερινό `infos[0]` δεν επαρκεί για αυτή την πολιτική πολλαπλών ειδικοτήτων.

Προτεινόμενος shared `resolve_service_capabilities(business, actor, policy_version)` χρησιμοποιείται σε create/update/publish/reactivation/booking. Άγνωστη ειδικότητα/τύπος αποκλείει νέα δημοσίευση με σαφή κωδικό σφάλματος. Για legacy μη ταξινομημένα records γίνεται read-compatible fallback μόνο μετά ελεγχόμενη resolution· όχι καθολικό allow.

### S3 — Συμπλήρωση matrix ανά 164 επαγγέλματα

Οι εγκρίσεις του product owner καταγράφονται μόνιμα στο `approved-service-decisions.json` και τεκμηριώνονται στο `05-SECTOR-DECISIONS.md`. Ο offline generator εξάγει `reviewed_profession_modules`, `quota_bucket`, `approved_module_quota_buckets`, `approved_module_limits`, `approved_additional_quota_constraints`, `approved_module_conditions`, `approved_cross_domain_capabilities`, `explicitly_no_service_modules`, `review_status` στο `generated/business-service-review.csv`. Limits/πρόσθετοι περιορισμοί είναι κοινοί ανά Business/bucket, όχι ανά module/ειδικότητα. Στα Ξενοδοχεία, hotel_room=10 τύποι δεν αρκεί χωρίς sum(inventory_count)<=100. Εγκρίθηκαν **164/164 ειδικότητες Services σε 15 κλάδους**· δεν υπάρχουν πλέον εκκρεμείς ειδικότητες. Στην Υγεία και στα κτηνιατρικά ραντεβού **δεν** υφίσταται πλέον έλεγχος επαλήθευσης πριν από δημοσίευση: ελεύθερη δημοσίευση με ελεγχόμενες εισαγωγές (απόφαση ιδιοκτήτη, policy v17). Η Μετακίνηση αποκρύπτεται από το κοινό (μη επιλέξιμη κατηγορία, χωρίς Service types, εσωτερική διαχείριση) με server-side enforcement. Κενή λίστα modules σημαίνει ρητά «χωρίς Service module», όχι όλα επιτρέπονται. Η χωριστή `retail-product-policy-review.csv` καταγράφει 6 σημερινά product policies και εκκρεμείς ακριβείς νέους κωδικούς. Δεν αλλάζουμε generated CSV ως μόνιμη πηγή αποφάσεων. Μεσίτες/διαχειριστές αποκτούν property capability/20 χωρίς διπλή καταμέτρηση ή πλασματικό runtime root. Κάθε τελική γραμμή απαιτεί εγκεκριμένη λίστα ή ρητό «δεν υποστηρίζει Services», όχι κενό που σημαίνει όλα. Conditional άδειες δεν γίνονται ανεπιφύλακτες από τη λίστα modules.

Ενδεικτικές ερωτήσεις, **όχι ήδη εγκεκριμένα permissions**:

- Personal trainer: gym_session, gym_class; απαιτεί πράγματι gym_membership;
- Κομμωτήριο/barber: salon_appointment/package· ποιες θεραπείες δεν πρέπει να εμφανίζονται;
- Pet supplies shop: pet_product· όχι αυτόματα κτηνιατρικά ραντεβού.
- Οδοντίατρος/κλινική/φαρμακείο: διαφορετικά health types και τυχόν επαλήθευση επαγγέλματος.
- Car dealer vs συνεργείο vs πλυντήριο: διαφορετικά auto_* modules.
- Ξενοδοχείο/ενοικιάσεις: ξεχωριστός τύπος πόρου και κράτησης· τα προσωπικά ακίνητα δεν γίνονται hotel inventory.
- Mobility: παραμένει ρητά χωρίς Service types μέχρι να εγκριθεί αν υπάρχει νέο module ή αν αρκούν οι υφιστάμενες λειτουργίες μετακίνησης.

Μόνο μετά την έγκριση παράγεται κοινό versioned configuration για backend/UI. Διατηρούνται aliases και ιστορικά records μη επιτρεπόμενων πλέον τύπων με συμφωνημένη read/manage πολιτική.

### S4 — Quota buckets πριν εφαρμοστεί το 10

| Προτεινόμενο bucket | Παραδείγματα προς εξέταση | Κανόνας |
|---|---|---|
| professional_service | salon_appointment, auto_repair, health_appointment κ.ά. | Εγκρίθηκαν 10 ενεργές δημοσιευμένες κανονικές υπηρεσίες συνολικά ανά επιχείρηση· εκκρεμεί πλήρης χαρτογράφηση modules |
| menu_entry | menu_item | Εγκρίθηκαν 100 ενεργές δημοσιευμένες εγγραφές συνολικά ανά food-dining Business, μαζί φαγητά/ποτά· χωριστά από το 10 Services και το 50 προϊόντων |
| catalog_product | retail_product, pet_product | Σύνδεση με canonical προϊόν και το δικαίωμα προϊόντων, χωρίς διπλή καταμέτρηση |
| vehicle_inventory | auto_vehicle | Εγκρίθηκαν 50 ενεργά δημοσιευμένα οχήματα προς πώληση ανά Business, count-based και χωριστά από Services/προϊόντα. Δεσμεύσεις/κρατήσεις δεν μειώνουν εμπορικό απόθεμα |
| hospitality_inventory + hospitality_units | hotel_room | Εγκρίθηκαν ταυτόχρονα 10 ενεργοί δημοσιευμένοι τύποι και συνολικά 100 φυσικές μονάδες ανά Business. Πλήθος Service records και sum(inventory_count) είναι δύο διαφορετικά quotas· κρατήσεις δεν αφαιρούν εμπορική δυναμικότητα |
| rental_inventory | rental_property και συμβατές επαγγελματικές home_rental πηγές | Εγκρίθηκαν 20 ενεργά επαγγελματικά ακίνητα ανά Business, μαζί όλα τα types/πηγές· και για εξουσιοδοτημένους μεσίτες/διαχειριστές χωρίς αλλαγή root. Προσωπικός Premium χωριστά 1, υφιστάμενα αιτήματα/IDs προστατεύονται |
| bookable_resource | table_reservation, ent_booking κ.ά. | Διάκριση template υπηρεσίας, φυσικού πόρου και ωρών/κρατήσεων |

Στον εγκεκριμένο κλάδο Άθλησης/Fitness/Ευεξίας, classes/sessions/recovery και κάθε ξεχωριστά δημοσιευμένο membership/pass ανήκουν στο κοινό bucket των 10 υπηρεσιών. Για άλλους κλάδους, packages/courses και λοιποί τύποι χρειάζονται ακόμη ειδική έγκριση bucket. Δεν αρκεί να εξαιρεθούν τέσσερα ονόματα και να θεωρηθούν όλα τα υπόλοιπα ίδια. Τα Bookings και slots δεν μετρούν ως νέες Services. Drafts δεν κλειδώνουν όλες τις θέσεις, publish/re-publish δεν παρακάμπτουν quota και soft-delete δεν καταστρέφει ιστορικό.

### S5 — Προστασία των Bookings που ήδη υπάρχουν

Διατήρηση `service_id`, `booking_id`, `slot_id`, `client_id`, `business_id`, confirmed/pending transitions, notifications και idempotency. Τα booked slots ήδη προστατεύονται κατά το schedule edit (`services.py:842–885`). Οι υπάρχοντες date-range locks/holds/reconciliation δεν επανεγγράφονται για να ταιριάξουν σε νέο menu.

Quota/expiry υποχωρεί ως προς την εξυπηρέτηση υπάρχουσας κράτησης: ένας owner που υποβαθμίστηκε πρέπει να μπορεί να τη διαχειριστεί σύμφωνα με την εγκεκριμένη πολιτική, χωρίς να αγοράζει ξανά την υπηρεσία. Έλεγχος concurrency, pending hold expiry, cancellation και inventory release.

### S6 — Φόρμα / API / εμφάνιση / αναζήτηση

Επηρεαζόμενα υπάρχοντα αρχεία:

- `backend/models/service.py`, `backend/routes/services.py`, `backend/database.py`.
- `backend/services/date_range_booking.py`, `backend/services/date_range_utils.py` μόνο όπου απαιτείται συμβατή ένταξη.
- `backend/routes/rentals.py` για υπάρχουσες επαφές/αιτήσεις.
- `frontend/lib/config/serviceModules.ts`, `frontend/lib/config/serviceCategoryMatrix.ts`, `frontend/lib/fieldRegistry.ts`.
- `frontend/components/business/ServiceModal.tsx`, `ServiceSection.tsx`, `CategoryServiceCard.tsx`, `ServiceBookingModal.tsx`, `SlotManagerModal.tsx`, `HotelAvailabilityModal.tsx`, `BookingListModal.tsx`, `UserBookingListModal.tsx`.
- `frontend/app/(tabs)/profile.tsx`, `frontend/app/services.tsx`, `frontend/app/service/[id].tsx`, `frontend/lib/api/services.ts`, `frontend/lib/booking/dateRange.ts`.

Η παρουσία πεδίου στο model δεν εγγυάται ότι αποθηκεύεται από το profile handler ή εμφανίζεται σωστά. Απαιτείται ανά module mapping `field → form → payload → storage → response → card/detail/filter → edit`, με units, enum, price/currency, required conditions και μεταφράσεις.

## 5. Παραδοτέα ομάδας Services

1. Εγκεκριμένο matrix ειδικοτήτων και buckets με version και owner sign-off.
2. Μη καταστροφική επίλυση category change και migration dry-run report.
3. Διορθώσεις SVC-002…007 με tests πριν από πραγματικά quotas.
4. Πίνακας ανά module με booking mode, CTA, fields και ακριβή counts που καταναλώνει.
5. Backend/UI contract tests και booking concurrency/regression report.
6. Screenshots πραγματικών flows για slot/request/date-range/non-bookable, όχι mock μόνο.
7. Λίστα παλιών records που χρειάζονται review, χωρίς αυτόματη διαγραφή ή αντιγραφή.

Υπάρχουν backend tests `tests/test_date_range_booking.py` και `tests/test_date_range_booking_concurrency.py`, αλλά δεν εκτελέστηκαν εδώ γιατί χρησιμοποιούν test DB. Το παλιό `tests/test_business_categories.py` περιέχει προσδοκία **8 παλιών roots**, άρα δεν αποτελεί έγκυρο σημερινό baseline χωρίς ενημέρωση.
