# Α — Ανάθεση εμπορικού μοντέλου και ενιαίας Δημιουργίας

Κατάσταση: σχεδιασμός. Οι αποφάσεις D01–D13 στο [README](README.md) αποτελούν μέρος της ανάθεσης. Paths σχετικές με `Perix-main/`.

## 0. Κλειστές αποφάσεις v18 — υπερισχύουν όπου υπάρχει σύγκρουση

- **D01:** Προσωπικό Free/Premium και Business entitlement **ξεχωριστά**. Το Business δεν δίνει αυτόματα Premium.
- **D02:** Αγγελία = `item_kind=classified_ad` (φωτό + περιγραφή, προαιρετική τιμή, χωρίς εμπορικά πεδία). **3 ενεργές ανά Free, 30 ημέρες.**
- **D03:** Premium ιδιώτης: **10 ενεργά προσωπικά προϊόντα** σε επιτρεπόμενες κατηγορίες.
- **D04:** 4ο Free post **απορρίπτεται** με μήνυμα ορίου.
- **D05:** Business **24 ενεργά posts· το 25ο αντικαθιστά το παλαιότερο και διαγράφει αυτό και τα media του**· προφίλ έως 1 έτος.
- **D07:** Μήνας Europe/Berlin· group chats ίδιοι κανόνες· 15 **αρχεία**/συνομιλία· μετά το κλείσιμο υπόθεσης επιστροφή στον κανόνα 30d από δημιουργία.
- **D08:** Εντύπωση ≥50% viewport για ≥1s, μία ανά επισκέπτη/διαφήμιση/πόλη/τοπική ημέρα, anti-refresh 10 λεπτά, κοινή κατάσταση home+results.
- **D09:** Δοκιμαστικές τιμές ως στόχος σχεδιασμού· πάροχος/ΦΠΑ στη Φ8 sandbox.
- **D10:** Taxonomy 17/184 σε 2 φάσεις με aliases· 3 οπτικές ειδικότητες στην Υγεία, χωρίς έλεγχο (ελεγχόμενες εισαγωγές).
- **D11:** Υπέρβαση γκαλερί → **αυτόματη αντικατάσταση παλαιότερου** (χωριστά φωτό/βίντεο)· avatar/cover ανέγγιχτα.
- **D12:** Ενεργή υπόθεση κατά το εγκεκριμένο mapping (booking pending/confirmed κ.λπ.).
- **D13:** Η ταυτότητα `artist` **αφαιρείται** με ελεγχόμενη μη καταστροφική μετάβαση σε Business ειδικότητες artists-performers.
- **D14:** Χωρίς έλεγχο επαλήθευσης προς το παρόν.

Όπου οι ενότητες παρακάτω περιγράφουν τις ίδιες αποφάσεις ως «προτεινόμενες/ανοιχτές», ισχύει η v18.

## 1. Στόχος και μη διαπραγματεύσιμες εγγυήσεις

Ένας αυθεντικοποιημένος άνθρωπος, ο υπάρχων `user_id`, μπορεί να ενεργεί προσωπικά ή ως ιδιοκτήτης Business. **Δεν δημιουργούμε δεύτερο login, δεν συγχωνεύουμε εγγραφές βάσει email και δεν αλλάζουμε υπάρχοντα IDs.** Το email δεν είναι απόδειξη ιδιοκτησίας επιχείρησης: χρησιμοποιείται `owner_id` και server authorization.

Διαχωρίζονται:

- **Ποιος συνδέθηκε:** ο αυθεντικοποιημένος χρήστης/session.
- **Ως ποιος ενεργεί:** verified actor `user` και `business`. Η ξεχωριστή ταυτότητα `artist` **καταργείται** με ελεγχόμενη μετάβαση σε Business ειδικότητες artists-performers (D13).
- **Τι δικαιούται:** effective plan + Founder/grace rules + επαγγελματική ειδικότητα/επαλήθευση.
- **Πόσο δικαιούται:** quotas ανά actor, όχι κοινή μεταβλητή που αλλάζει με το identity switch.
- **Τι αγόρασε για προβολή:** City Ads campaign ανεξάρτητη από τα βασικά entitlements.

Οι σημερινές λειτουργίες Bookings, αιτήσεων εργασίας, Artist Events, προϊόντων, rentals και media πρέπει να παραμείνουν λειτουργικές. Καμία αναδόμηση διαδρομών «για καθαρότητα» και καμία διπλή canonical εγγραφή προϊόντος.

## 2. Κουμπί «Δημιουργία»: η βασική απαίτηση UI

### Σημερινές πραγματικές είσοδοι

| Υπάρχον αρχείο | Σημερινός ρόλος / ζητούμενο |
|---|---|
| `frontend/components/TopNavbar.tsx` | Κουμπί δημιουργίας desktop· διατήρηση θέσης/πλοήγησης |
| `frontend/components/GlobalWebChrome.tsx:61–113,130–168` | Ξεχωριστά handlers Business/User και modals. Εδώ συνδέεται το κοινό action resolver. |
| `frontend/context/CreateFlowContext.tsx` | Σημερινά `openCreateSheet` / `openBizActions`. Επέκταση με συμβατότητα προς τους callers. |
| `frontend/app/(tabs)/_layout.tsx:165–181` | Mobile/tab actions, όχι μόνο desktop navbar |
| `frontend/components/user/CreationSheet.tsx:7–43` | `camera`, `activity`, `home_rental`, `product`· προσθήκη Αγγελίας και plan-aware labels |
| `frontend/components/business/BusinessActionsModal.tsx:26–58` | Δημιουργία product/service/event/job· δεν αντικαθιστούμε τις υπάρχουσες φόρμες |
| `frontend/components/profile/IdentityDropdown.tsx` | Σημερινή αλλαγή ταυτότητας. Παραμένει διαθέσιμη. |
| `frontend/context/AuthContext.tsx:23–36,94–120` | Ήδη active identity και έλεγχος εγκυρότητας αποθηκευμένης ταυτότητας στο bootstrap |
| `frontend/app/(tabs)/profile.tsx:559` και οι create/edit handlers | Διατήρηση `openProduct`, `openService`, `openEvent`, `openJob`, `openActivity` και υπαρχόντων forms |

### Ζητούμενη συμπεριφορά

1. Μία συνεπής εμπειρία Δημιουργίας σε web/mobile/profile. Ορατό «Δημοσιεύεις ως …» πριν τη φόρμα και πριν την τελική αποθήκευση.
2. Αν υπάρχουν προσωπική και επιχειρηματική ταυτότητα, επιλογή actor ή δύο σαφείς ενότητες στο ίδιο μενού. **Όχι άθροιση δικαιωμάτων και ασαφές ποιος δημοσιεύει.**
3. Free: Post/φωτογραφία και Αγγελία. Premium: επιπλέον προσωπικό προϊόν, Activity, ένα ενεργό ακίνητο. Business: οι υπάρχουσες επαγγελματικές ενέργειες μόνο όταν επιτρέπονται από ειδικότητα και plan· City Ad ως ξεχωριστή αγορά.
4. Κλειδωμένη ενέργεια εμφανίζει αιτία (`plan_required`, `quota_reached`, `category_not_allowed`, `verification_required`) και μόνο όπου ταιριάζει δυνατότητα αναβάθμισης. Δεν παρουσιάζουμε αγορά συνδρομής ως λύση σε μη επιτρεπόμενο επάγγελμα.
5. Κοινός resolver για navbar, tab button, profile, direct/deep links. Έλεγχος ξανά στον server σε κάθε mutation.
6. Το identity της ανοιχτής φόρμας παραμένει ρητό. Αλλαγή active identity σε άλλη καρτέλα δεν πρέπει να δημοσιεύσει ως άλλος actor κατά λάθος. Ακυρωμένο/αποτυχημένο API δεν χάνει το draft.
7. Υπάρχον camera/post flow επαναχρησιμοποιείται. Φωτογραφίες γκαλερί και posts έχουν χωριστά quotas.

## 3. Πίνακας στόχου entitlements

| Δυνατότητα | Free προσωπικός actor | Premium προσωπικός actor | Business actor |
|---|---|---|---|
| Εξερχόμενα/μήνα | 30 | 200 | Χωρίς εμπορικό όριο, με anti-abuse |
| Media αποστολές | Μέσα στις 30 | Μέσα στις 200 | Χωρίς εμπορικό όριο |
| Media που παραμένουν στο chat | 15 τελευταία αρχεία ανά συνομιλία, D07 | Ίδιο | Ίδιο |
| Posts | 3, φωτογραφία + κείμενο | 12, φωτογραφία ή video + κείμενο | 24, διάκριση feed/profile D05 |
| Retention posts | 30 ημέρες | 30 ημέρες | Προφίλ έως 1 έτος, D05 |
| Gallery φωτογραφίες / video | 3 / 0 | 12 / 6 | 30 / 12 |
| Αγγελίες | Ναι, D02 | Ναι, D02 | Επαγγελματικές καταχωρίσεις βάσει δικαιωμάτων |
| Προσωπικά προϊόντα | Όχι | Ναι, όριο D03 | 50 ενεργά επαγγελματικά προϊόντα |
| Activities | Όχι δημιουργία | Ναι δημιουργία | Βάσει ειδικών δικαιωμάτων, όχι αυθαίρετη επέκταση |
| Προσωπικό home listing | Όχι | 1 ενεργό | Υπάρχουσα διαφορετική επαγγελματική ροή |
| Επαγγελματικά ακίνητα ενοικίασης | Όχι | Δεν μεταφέρεται προσωπικό δικαίωμα | 20 ενεργά δημοσιευμένα συνολικά ανά εξουσιοδοτημένο Business Rentals ή μεσιτικό/διαχειριστή, χωριστά από 10 Services/50 προϊόντα· approximate δημόσια θέση εξ ορισμού |
| Ξενοδοχειακή δυναμικότητα | Όχι | Όχι από προσωπικό plan | 10 ενεργοί δημοσιευμένοι τύποι hotel_room και συνολικά έως 100 φυσικές μονάδες ταυτόχρονα ανά εξουσιοδοτημένο Hotel Business· χωριστά buckets και διατήρηση date_range |
| Οχήματα προς πώληση | Όχι | Όχι από προσωπικό plan | 50 ενεργά δημοσιευμένα οχήματα ανά εξουσιοδοτημένο Automotive Business, count-based vehicle_inventory· ενοικιάσεις/επισκευές/πλυσίματα στο κοινό 10 Services με τα σημερινά modes |
| Business Services | Όχι | Όχι | 10 ενεργές δημοσιευμένες κανονικές υπηρεσίες συνολικά ανά επιχείρηση, από όλες τις εγκεκριμένες ειδικότητες· χωριστά όρια μενού/προϊόντων/οχημάτων/δωματίων/ακινήτων D06 |
| Επαγγελματικό μενού | Όχι | Όχι | 100 ενεργές δημοσιευμένες εγγραφές φαγητών/ποτών ανά επιχείρηση Εστίασης, με σχετικά δικαιώματα· δεν καταναλώνουν τις 10 Services ή το 50 προϊόντων |
| Business Events | Όχι | Όχι | 4 βασικά· ανώτερο όριο μόνο μετά έγκριση |
| Jobs | Δεν προστίθεται επαγγελματική δημιουργία | Ίδιο | Διατήρηση σημερινής ροής· νέο αριθμητικό όριο δεν έχει αποφασιστεί |
| City Ads | Όχι αγορά ως ιδιώτης | Όχι αγορά ως ιδιώτης | Ξεχωριστή χρέωση |

Συμμετοχή/αναζήτηση/κρατήσεις δεν απαγορεύονται επειδή απαγορεύεται η **δημιουργία**. Δεν επιβάλλουμε Premium για να κάνει ένας Free χρήστης αίτηση εργασίας ή κράτηση.

## 4. Κεντρικός μηχανισμός δικαιωμάτων

### Επέκταση υπαρχόντων αρχείων

- `backend/models/user.py`, `backend/models/business.py`: additive πεδία personal plan και Business entitlement/subscription, χωρίς αφαίρεση legacy πεδίων.
- `backend/routes/auth.py`: ασφαλή defaults Free, όχι εμπιστοσύνη σε client plan. Σύνδεση ιδιοκτησίας αντί για νέο λογαριασμό.
- `backend/routes/dependencies.py`: επαναχρησιμοποίηση `resolve_actor`, έλεγχος actor ownership σε όλες τις νέες δυνατότητες.
- `backend/routes/businesses.py:191–194`: το σημερινό gate είναι no-op `True`· δεν αρκεί αλλαγή αυτής της συνάρτησης χωρίς πλήρη Founder migration.
- `backend/database.py`: indexes και conventions. Υπάρχουν σχόλια/προσαρμογές FerretDB· **να επαληθευθούν οι πραγματικές δυνατότητες deployment** πριν επιλεγούν transactions/TTL/locks.
- `frontend/context/AuthContext.tsx`: λήψη server-computed snapshot entitlements ανά actor· το UI δεν υπολογίζει συνδρομή από το email ή το role.

### Νέα αρχεία/συμβόλαια — προτεινόμενα, όχι σημερινά endpoints

Προτεινόμενη ενσωμάτωση με τις υπάρχουσες συμβάσεις: `backend/services/entitlements.py`, `backend/models/subscription.py`, `backend/routes/subscriptions.py`, shared publish/quota helpers. Το τελικό naming εγκρίνεται στο πρώτο PR.

Προτεινόμενο read contract: `GET /api/account/entitlements?actor_type=...&actor_id=...`, με server ownership check και πεδία `policy_version`, `effective_plan`, `subscription_status`, `founder_until`, `allowed_actions`, `limits`, `usage`, `remaining`, `reason_codes`, `next_reset_at`. Τα quotas returned στο UI είναι ενδεικτικά μέχρι το atomic mutation.

Νέα collections όπου χρειάζονται: `subscriptions`, `monthly_usage`, idempotency/send-operation ledger, `promotion_campaigns`, `ad_slot_reservations`, `payment_records`, bounded viewer rotation state. Το entitlement resolver μπορεί να είναι computed· **δεν απαιτείται** να δημιουργηθεί materialized `account_entitlements` collection χωρίς ανάγκη.

**Επαλήθευση ρυθμιζόμενων υπηρεσιών:** capability ανά Business+ειδικότητα+χώρα, χειροκίνητη εσωτερική ουρά ελέγχου, προσωρινό αποδεικτικό με metadata-only retention και audit log χωρίς έκθεση εγγράφων. Αναλυτικά στο [06-VERIFICATION-POLICY.md](06-VERIFICATION-POLICY.md) και στο `regulated_verification_policy` του JSON εγκρίσεων. Η δημοσίευση ρυθμιζόμενης υπηρεσίας παραμένει ανενεργή μέχρι ενεργό verified capability εντός πεδίου.

Μετρητές/unique constraints περιλαμβάνουν actor type και ID. Το ακριβές quota μήνα χρησιμοποιεί server-defined `period_key` και όχι την ώρα συσκευής. Client δεν επιτρέπεται να αλλάζει plan/counters/Founder.

### Founder και αλλαγές προγράμματος

Η δημιουργία σήμερα γράφει `plan_type: founder`, `free_until`, `trial_expires_at` +365 ημέρες (`businesses.py:225–264`). Διατήρηση ημερομηνιών και δωρεάν περιόδου. Δεν συμπληρώνουμε αυτόματα payment method ούτε μετατρέπουμε expiry σε χρέωση.

Downgrade/expiry: να εγκριθεί πολιτική read/edit/export και «μπλοκάρισμα νέας δημοσίευσης» αντί καταστροφικής διαγραφής παλιού περιεχομένου. Ενεργές κρατήσεις και αιτήσεις εργασίας πρέπει να μπορούν να εξυπηρετηθούν. Αν μια επιχείρηση έχει 20 Events, δεν διαγράφονται για να χωρέσουν στα 4.

## 5. Μηνύματα: quota, ταυτότητα, context και retention

### Σημερινές είσοδοι που πρέπει να ενωθούν

| Αρχείο | Εργασία |
|---|---|
| `backend/models/message.py` | Νέα verified sender identity, canonical conversation ID, nullable contexts και idempotency key με συμβατότητα |
| `backend/routes/messages.py:593–628` | Κατάργηση παλιού friendship/count-based quota όταν ενεργοποιηθεί το νέο· δεν επηρεάζονται block/moderation |
| `backend/routes/messages.py:971` | Media send: ίδιο quota/identity/context service, όχι δεύτερος ασύνδετος περιορισμός |
| `backend/routes/services.py:605–655` | Inquiry γράφει απευθείας message με `service_id`· σύνδεση στο κοινό send service |
| `backend/routes/rentals.py:375` | Inquiry γράφει απευθείας message· ίδια πολιτική για να μην παρακάμπτεται το quota |
| `frontend/app/(tabs)/messages/[id].tsx`, `frontend/lib/api/messages.ts` | Υπόλοιπο/επαναφορά, business sender, read-only media tombstones και συμβατά conversation links |
| `backend/utils/cleanup.py` | Νέο scheduled retention με context resolver και προστασία media references |

Τα Event/Activity chats χρησιμοποιούν διαφορετικές ροές και πρέπει να ελεγχθούν ξεχωριστά πριν εφαρμοστεί κοινό όριο (D07). Η ύπαρξη άλλης collection δεν αποτελεί αυτόματα εξαίρεση.

### Ακριβείς εγγυήσεις αποστολής

- Μία επιτυχημένη εξερχόμενη αποστολή = μία χρέωση χρήσης, είτε text είτε media. Τα εισερχόμενα δεν μετρούν.
- Usage counter ανεξάρτητος από `db.messages`. Η διαγραφή ή retention δεν επιστρέφει quota.
- Atomic reserve/check και idempotent commit μαζί με τη δημιουργία μηνύματος. Καθόλου `count` και μετά `insert` χωρίς προστασία ανταγωνισμού.
- Unique send operation `(authenticated_user_id, sender_actor_type, sender_actor_id, client_request_id)` και quota `(actor_type, actor_id, period_key)`. Μία last-idempotency-key πάνω στον μηνιαίο μετρητή **δεν επαρκεί** για πολλά retries.
- Αν το storage δεν υποστηρίζει κατάλληλες multi-document transactions, απαιτείται durable operation state machine/reconciliation. Όχι «atomic» ως απλή υπόσχεση πάνω σε ανεξάρτητα writes.
- Αποτυχία upload/authorization/insert δεν αφαιρεί μόνιμα αποστολή· timeout μετά το commit επιστρέφει το ίδιο μήνυμα στο retry. Push/WebSocket failure δεν αναιρεί επιτυχή αποστολή.
- Unlimited ισχύει μόνο σε server-verified Business actor. Προσωπική αποστολή ιδιοκτήτη δεν γίνεται unlimited επειδή έχει επιχείρηση.
- Διατηρούνται block/report, anti-spam, authorization και policy σε **όλες** τις εισόδους, όχι μόνο `/messages`.

### Context και χρονική διατήρηση

Προτεινόμενα νέα fields: `conversation_id`, `sender_identity_type`, `sender_identity_id`, `context_type`, `context_id`, `expires_at`, `retention_policy_version`. Επιτρεπόμενα context types μόνο server-validated: booking, activity, event, service, item/listing, job. Επιβεβαίωση πρόσβασης στον συγκεκριμένο πόρο· δεν αρκεί υπαρκτό ID.

Κοινό μήνυμα: λήξη σε 30 ημέρες από δημιουργία. Ενεργή συγκεκριμένη υπόθεση προστατεύει τα σχετικά μηνύματα. Μετά το κλείσιμο χρειάζεται D07: **η αρχική λογική επιστροφής στο όριο 30 ημερών δεν ταυτίζεται με νέο επιπλέον 30ήμερο μετά το κλείσιμο**. Ο developer δεν επιλέγει μόνος του μία από αυτές τις δύο πολιτικές.

Ο resolver ορίζει terminal states για κάθε domain, όχι μόνο «υπάρχει link». Legacy messages χωρίς ασφαλή συσχέτιση δεν συνδέονται με εικασία από το κείμενο. Υπάρχον `service_id` inquiry μπορεί να αξιοποιηθεί μόνο μετά authorization/κατάσταση.

Legal hold/dispute/report προστατεύονται χωριστά, ελάχιστα και με περιορισμένη πρόσβαση. Συμφωνία Terms/Privacy και χωρίς επαναλαμβανόμενα popups ανά μήνυμα. Αν κάποιο context λείπει λόγω παλιού cleanup, quarantine/review, όχι αυθαίρετη απώλεια αποδεικτικών.

### Παράθυρο media 15

Αρχική απαίτηση: **15 τελευταία αρχεία ανά συνομιλία**, όχι 15 σε όλο τον λογαριασμό. Με σημερινό ένα attachment/message συμπίπτει με 15 media messages. Για πολλά attachments απαιτείται ρητή καταμέτρηση αρχείων.

Νέο upload επιβεβαιώνεται και το message αποθηκεύεται πριν αποσυρθεί παλιότερο media. Σειρά με server sequence + ID για ισοβαθμίες. Μηνύματα κειμένου/λεζάντες δεν διαγράφονται άθελά μας μαζί με attachment. Πρώτα logical detach/tombstone, μετά retryable cleanup job σε Cloudinary/Mux εφόσον δεν υπάρχει άλλη αναφορά ή hold. Φυσική διαγραφή αρχείου και Mongo writes δεν είναι μία πραγματική transaction: χρειάζεται outbox/retry, όχι ψευδής ατομικότητα. Προτεραιότητα media window και αποδεικτικών καθορίζεται με D07/νομικό έλεγχο.

## 6. Posts και γκαλερί

Επέκταση `backend/models/post.py`, `backend/routes/posts.py`, `backend/routes/feed.py`, `backend/utils/cleanup.py`, `frontend/components/profile/ProfilePosts.tsx`, `UserProfilePremium.tsx`, `BusinessProfilePremium.tsx`, `GalleryCustomizer.tsx`, `frontend/lib/constants/mediaLimits.ts`.

Σήμερα posts έχουν `expires_at=None` (`posts.py:163`) και cleanup επιστρέφει 0 (`cleanup.py:55–57`). Η αντιγραφή για home feed δημιουργείται στο ίδιο create handler. Η νέα πολιτική πρέπει να χειρίζεται **posts και home_posts**, προφίλ, saved references, reactions/comments, caches και shared media.

- Free: έως 3 posts, φωτογραφία/κείμενο, 30 ημέρες. Overflow D04.
- Premium: 12, 30 ημέρες, το 13ο αντικαθιστά το παλαιότερο **μόνο αφού επιτύχει η νέα δημοσίευση**.
- Business: 24 και ετήσια διατήρηση προφίλ, υλοποίηση μετά D05. Αν επιλεγεί feed window + archive, χρειαζόμαστε ξεχωριστά `feed_visible_until`/`profile_expires_at`, όχι διαγραφή του canonical post στο 25ο.
- Το «1 έτος» χρειάζεται καθορισμό calendar year ή 365 ημέρες. Δεν εφαρμόζεται άμεσο purge σε όλα τα παλιά posts χωρίς εγκεκριμένη μετάβαση.
- Logical expiry εφαρμόζεται στα read queries ακόμη και αν καθυστερεί ο worker. Cleanup σε batches, dry run και idempotency. Τα media αφαιρούνται μόνο αν δεν χρησιμοποιούνται αλλού.

Gallery: server enforcement σε create/update/gallery routes, όχι μόνο στο gallery modal. Σήμερα backend User και Business χρησιμοποιούν 15, frontend gallery 20/10. Τα νέα 3/12/30 photos και 0/6/12 videos προκύπτουν από τον resolver. Avatar/cover, tagged/fan gallery, post attachments δεν συγχωνεύονται σε ένα quota. Overflow D11.

## 7. Items / Αγγελίες / ακίνητα / επαγγελματικά προϊόντα

Υπάρχον storage: `listing_type=product|home_rental`. Το label «Listings» της διεπαφής δεν είναι άδεια δημιουργίας δεύτερης collection με αντίγραφα.

| Αρχεία | Ζητούμενο |
|---|---|
| `backend/models/listing.py`, `backend/routes/listings.py` | Additive `item_kind=classified_ad` ή αντίστοιχο discriminator μετά D02, συμβατότητα παλιών records και API |
| `backend/utils/product_permissions.py` | Συνδυασμός plan quota και ακριβών επαγγελματικών δικαιωμάτων, όχι permissive fallback· συμπλήρωση Retail matrix ιδίως gifts-souvenirs/florists με χωριστή έγκριση νέων paths, συμβατότητα taxonomy και legacy product-like Service εισόδων |
| `frontend/components/user/ListingModal.tsx`, `frontend/lib/api/listings.ts` | Επαναχρησιμοποίηση φόρμας/τύπων, ξεχωριστή Αγγελία και context actor |
| `frontend/lib/marketplace/marketplaceTaxonomy.ts` και backend taxonomy | Versioned συμφωνία/aliases, όχι ενεργοποίηση κατηγορίας μόνο επειδή υπάρχει icon |
| `frontend/components/marketplace/MarketplaceCategoryPicker.tsx`, `frontend/hooks/marketplace/useViewportListings.ts` | Συνεπή φίλτρα, legacy links, νέο kind, City Ads ανεξάρτητα από οργανικά αποτελέσματα |

Ένα canonical product ID για profile και marketplace. Διατήρηση `profile_only` / `profile_and_marketplace`, price/stock/media. Τα 50 products αφορούν ενεργά προϊόντα και όχι διπλή καταμέτρηση ανά επιφάνεια προβολής.

Η πρόταση 17/184 υπάρχει στο JSON του πακέτου. Υφιστάμενα root aliases `home_garden`, `sports`, `books` παραμένουν αναγνώσιμα. Προτεινόμενο `baby_kids/kids_clothing → fashion/kids_clothing` και μεταφορά `mobility_aids` χρειάζονται alias map και read compatibility, όχι απλό rewrite. Τα `household_clearance`, `bundles`, `uncategorized_parts` δεν διαγράφονται από παλιά δεδομένα επειδή προτείνεται να μη δημιουργούνται νέα.

Product-like Services (`retail_product`, `pet_product`, `auto_vehicle`) δεν αντιγράφονται μαζικά σε listings. Πρώτα audit/counts, mapping old service ID σε canonical product, διατήρηση αναφορών/κρατήσεων/URL. Η εργασία Services περιγράφεται στο έγγραφο Β.

## 8. Events και πιο ισχυρά Business πακέτα

Αρχεία `backend/models/event.py`, `backend/routes/events.py`, `frontend/components/business/EventsSection.tsx`, `frontend/components/profile/BusinessProfilePremium.tsx`, `frontend/lib/api/events.ts`.

Σήμερα create ελέγχει Business ownership/subscription αλλά δεν έχει τα 4/30/100. Υπάρχει ξεχωριστή Artist ροή που διατηρείται. Βασικό quota 4 ενεργά δημοσιευμένα Events. Προτεινόμενος ορισμός «μελλοντικά ή σε εξέλιξη, μη ακυρωμένα» εγκρίνεται πριν γραφτεί query· ξεχωριστή ημερομηνία πραγματικού recurring Event καταλαμβάνει θέση. Τα drafts δεν μετρούν, η δημοσίευση/re-publish πρέπει να ελέγχεται ατομικά.

Οι προτάσεις Event Pro 30 και Organizer 100 δεν ενεργοποιούνται χωρίς έγκριση τιμής/ορίων. Η ειδικότητα (χώρος, club, καλλιτέχνης κ.λπ.) δείχνει πιθανή ανάγκη, **όχι αυτόματη αγορά ή αυτόματη αναβάθμιση**. Τα κοινά μαθήματα/ραντεβού παραμένουν Services, όχι τεχνητά Events.

Πριν διαγραφεί ληγμένο Event/Activity από το σημερινό cleanup +1 ημέρα, διατηρείται η ελάχιστη κατάσταση που χρειάζονται booking, messages, reports και αποδεικτικά. Δεν διαγράφουμε την πηγή από την οποία ο retention resolver μαθαίνει ότι η υπόθεση ολοκληρώθηκε.

## 9. City Ads — ανεξάρτητο πληρωμένο προϊόν

### Χωρητικότητα και εναλλαγή (νεότερη κατεύθυνση)

- **24 δεσμευόμενες θέσεις ανά πόλη και τοπική ημερομηνία**, όχι 12 συνολικά.
- 12 λογικές θέσεις carousel με ζεύγη `1↔13 … 12↔24`. Υπάρχουν έως 12 επιλέξιμες κάρτες στη λίστα κάθε φορά· πόσες χωρούν στο viewport εξαρτάται από τη συσκευή.
- Για κάθε viewer/city/day/pair: αρχικά Α, μετά από 2 έγκυρες εκθέσεις Α→Β, μετά από 2 Β→Α. Ανεξάρτητα ανά θέση, όχι αλλαγή ολόκληρης της δωδεκάδας.
- Δεν μετρά impression από fetch, preload, background, refresh ή rerender. Προτείνεται visibility threshold και dwell με session/server deduplication (D08). Η ίδια παρατεταμένη έκθεση δεν μετρά διαρκώς μέχρι να αλλάξουν όλες οι διαφημίσεις.
- Όταν λείπει το Β, παραμένει η ενεργή Α· όταν υπάρχει μόνο Β, προτείνεται προβολή Β χωρίς κενό Α. Ακριβής πολιτική initial fairness/rotation με λιγότερες αγορές εγκρίνεται, χωρίς να πωλείται εγγυημένο πλήθος views.
- Impression response αλλάζει state για την **επόμενη επιλέξιμη έκθεση**, όχι αμέσως πάνω στο δάχτυλο χρήστη κατά το click. Κοινή κατάσταση home/results προτείνεται προς D08. Reset στην τοπική ημερομηνία πόλης, όχι στο timezone επισκέπτη.

### Κράτηση / πληρωμή / κατάσταση

Campaign ανήκει σε Business, σταθερό `city_id`, IANA timezone πόλης, ημερομηνίες και ένα creative. Search-selected city υπερισχύει φυσικής θέσης. Υφιστάμενος μηχανισμός επιλογής πόλης πρέπει πρώτα να εξεταστεί, όχι να δημιουργηθεί δεύτερο ασύνδετο city registry.

Πολυήμερη αγορά καταναλώνει μία θέση σε **κάθε** ημέρα. Ορίζονται σαφώς inclusive εμπορικές ημέρες και τεχνικό end-exclusive διάστημα· σωστός χειρισμός DST. Η θέση μπορεί να αλλάζει slot index μεταξύ ημερών μόνο εφόσον η επιχείρηση δεν αγόρασε συγκεκριμένη θέση και η ημερήσια αντιστοίχιση παραμένει σταθερή.

Unique inventory `(city_id, local_date, slot_number)` για 1..24. Παράλληλες αγορές δεν επιτρέπεται να πουλήσουν την 25η. Πολυήμερη προσωρινή κράτηση all-or-nothing ή πλήρως αναστρέψιμη durable saga. Όχι κρυφές μερικώς δεσμευμένες ημέρες.

Προτεινόμενα states: draft → held → payment_pending → review → scheduled → active → completed, και expired/rejected/cancelled/refund_pending/refunded. Χωριστά payment και moderation status ώστε η σειρά έγκρισης/πληρωμής να μη δημιουργεί ψευδή ενεργοποίηση.

- Holds με server expiry. Webhook signature verification, provider event idempotency, server-computed ποσά σε ακέραια cents και currency. Καμία ενεργοποίηση από client redirect «success».
- Καθυστερημένη πληρωμή μετά τη λήξη hold: επανέλεγχος inventory, όχι overbooking. Αν δεν υπάρχει θέση, προβλεπόμενο refund ή εγκεκριμένη νέα περίοδος.
- Approval και playable media απαιτούνται πριν την ενεργοποίηση. Αποτυχημένο/transcoding video δεν καταλαμβάνει αόριστα πληρωμένη ενεργή προβολή χωρίς πολιτική αποζημίωσης.
- Χορηγούμενη σήμανση σε carousel και viewer, click targets με έλεγχο ιδιοκτησίας/δημοσίευσης και ασφαλή allowlist διαδρομών. Analytics με ελαχιστοποίηση προσωπικών δεδομένων.

### Πού ενσωματώνεται

Υπάρχοντα `backend/models/story.py`, `backend/routes/stories.py`, `frontend/components/home/CityAdCircles.tsx`, `frontend/components/stories/CityAdViewer.tsx`, `frontend/hooks/useFeedData.ts`, `frontend/lib/api/stories.ts`, `frontend/app/(tabs)/home.tsx`.

Επαναχρησιμοποιούμε το οπτικό μέρος, όχι την αποθήκευση/λήξη Stories για πληρωμένες καμπάνιες. Προτεινόμενα νέα `backend/models/promotion.py`, `backend/routes/promotions.py`, `backend/services/ad_inventory.py`, `frontend/lib/api/promotions.ts` και κοινό City Ads results component/hook. Registration στο υπάρχον `backend/server.py`.

Αρχική και αποτελέσματα Businesses/Services/Events/Items/ακινήτων/Jobs χρησιμοποιούν την ίδια πηγή campaign data της επιλεγμένης πόλης. Κοινός adapter, όχι πολλαπλά συστήματα πληρωμών. Οι ακριβείς result containers αποτυπώνονται στο PR inventory πριν το wiring, συμπεριλαμβανομένων Locator views όπου υπάρχουν. City Ads failure δεν μπλοκάρει οργανικά αποτελέσματα.

Τα legacy Stories παραμένουν με ξεχωριστό adapter/flag κατά τη μετάβαση. Δεν μετατρέπονται αυτόματα σε πληρωμένες καμπάνιες ούτε απεικονίζονται ως πληρωμένες χωρίς συναλλαγή.

## 10. Εμπορικές προτάσεις — απενεργοποιημένες μέχρι έγκριση

| Πρόγραμμα | Μήνας | Έτος | Event quota |
|---|---:|---:|---:|
| Free | 0 € | 0 € | — |
| Premium | 6,90 € | 69 € | — |
| Business | 29,90 € | 299 € | 4 |
| Event Pro | 89,90 € | Δεν έχει οριστεί | 30 προτεινόμενα |
| Organizer | 179,90 € | Δεν έχει οριστεί | 100 προτεινόμενα |

Προτεινόμενα City Ads: 3 ημέρες 7,90 €, 7 ημέρες 14,90 €, 14 ημέρες 26,90 €, 30 ημέρες 44,90 €, video +20%. Δεν έχει εγκριθεί αν τιμές περιλαμβάνουν ΦΠΑ, ανά πόλη διαφοροποίηση, επιστροφές ή εμπορική καταλληλότητα υπό τη νέα χωρητικότητα 24. Δεν αντιγράφουμε τιμές τρίτων ως τεκμηριωμένο κόστος/κέρδος.

Όροι/Privacy: `frontend/app/terms-of-service.tsx`, `frontend/app/privacy-policy.tsx`, `frontend/i18n/locales/`. Πραγματικές δυνατότητες και νομικά κείμενα ενεργοποιούνται συγχρονισμένα, όχι υποσχέσεις retention πριν υπάρχει ο worker.
