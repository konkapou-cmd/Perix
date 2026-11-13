# Δ — Tests αποδοχής, μετάβαση και παράδοση

## 1. Οργάνωση ανάθεσης χωρίς συγκρούσεις

| Πακέτο | Προαπαιτούμενα | Επιτρέπεται παράλληλη εργασία |
|---|---|---|
| A0: baseline / regression / migration audit | Κανένα | Services field audit, icon inventory και νομικός/εμπορικός έλεγχος |
| A1: actor / entitlements / Founder | D01, σαφές read contract | UI prototype με fixtures, όχι πραγματική χρέωση |
| A2: μηνύματα | A1, D07/D12/D13 | Services inquiry integration με κοινό send contract |
| A3: posts / gallery | A1, D04/D05/D11 | Μόνο χωριστές επιφάνειες με σαφή ownership αρχείων |
| A4: Αγγελίες / Products / ακίνητα | A1, D02/D03/D10 | Icons reuse, taxonomy review |
| B1: Services correctness | A0, μη καταστροφικό category update | Μπορεί να προηγηθεί των εμπορικών quotas |
| B2: επαγγελματικά permissions / buckets / quotas | A1 + B1 + εγκεκριμένο matrix D06 | Όχι ανεξάρτητα permissions frontend/backend |
| A5: Events plans | A1, έγκριση ανώτερων ορίων | Δεν απαιτεί City Ads billing |
| A6: City Ads | A1, D08/D09, payment/provider contracts | Creative UI με mock inventory, όχι πραγματική αγορά |
| C: icons | Υπάρχον inventory | Χωρίς changes σε taxonomy, Services permissions ή shared profile handlers |

**Σειριακή αντιστοίχιση Φ0–Φ9 και σειρά δημιουργίας νέων αρχείων:** βλ. [07-EXECUTION-PLAN.md](07-EXECUTION-PLAN.md). Εκεί ορίζονται η ακριβής αλληλουχία, τα νέα backend/frontend αρχεία ανά φάση, οι πύλες αποφάσεων και τα exit criteria.

Η σειρά δεν σημαίνει ότι ανατίθενται όλα σε ένα μεγάλο PR. Shared αρχεία όπως `database.py`, `profile.tsx`, `AuthContext.tsx`, `serviceModules.ts` χρειάζονται κοινό integration owner και μικρά διαδοχικά PRs.

## 2. Υποχρεωτικά acceptance tests

Οι ακόλουθες είναι **απαιτήσεις νέων tests**, όχι ήδη επιτυχημένα tests της εφαρμογής. Όπου υπάρχει ανοιχτή απόφαση, το test κλειδώνει αφού εγκριθεί η πολιτική.

### Λογαριασμός / Δημιουργία / authorization

| ID | Σενάριο | Αναμενόμενο |
|---|---|---|
| ACC-01 | Ίδιο session με personal και owned Business | Δημιουργία με σαφή actor, χωρίς νέο account ή αντιγραφή δεδομένων |
| ACC-02 | Business actor άλλου ιδιοκτήτη ή πλαστό plan | Server deny, ανεξάρτητα από client UI |
| ACC-03 | Identity switch με ανοιχτή φόρμα / δύο tabs | Κανένα post/service από λάθος actor |
| ACC-04 | Desktop/navbar/mobile/tab/profile/deep link | Ίδιες άδειες, reason codes και υπάρχουσες routes |
| ACC-05 | Legacy Artist profile/event/message | v18: ελεγχόμενη μη καταστροφική μετάβαση artist → Business ειδικότητες artists-performers· όλα τα υπάρχοντα δεδομένα/links διατηρούνται ή αντιστοιχίζονται ρητά, χωρίς αυτόματη διαγραφή |
| ACC-06 | Founder πριν/στο/μετά `free_until` | Σωστή εγκεκριμένη συμπεριφορά, ποτέ αυτόματη χρέωση ή διαγραφή |
| ACC-07 | Downgrade με υπάρχοντα bookings/applications | Ιστορικό και αναγκαία διαχείριση παραμένουν |

### Μηνύματα / media / retention

| ID | Σενάριο | Αναμενόμενο |
|---|---|---|
| MSG-01 | Free 30→31, Premium 200→201, text και media | 30/200 επιτυχημένες, επόμενη απορρίπτεται· friendship δεν παρακάμπτει |
| MSG-02 | 20 παράλληλα sends με 1 υπόλοιπο | Μόνο 1 νέα επιτυχία/usage entry, καμία υπερχρέωση |
| MSG-03 | Retry ίδιας αποστολής πριν/μετά timeout/commit | Ίδιο message ID, usage μόνο μία φορά |
| MSG-04 | Αποτυχία upload/insert/push/websocket | Καμία χαμένη μόνιμη πίστωση για μη αποθηκευμένο message, καμία διπλή αποστολή λόγω push failure |
| MSG-05 | Owner στέλνει ως Business και ως personal | Unlimited μόνο Business, σωστό personal counter |
| MSG-06 | Service/rental inquiries και direct media API | Ίδιο authorization/anti-abuse/quota contract, όχι bypass |
| MSG-07 | Νέος μήνας στη ζώνη Europe/Berlin (v18), boundary, αλλαγή plan | Server period σωστό, usage δεν χάνεται με αναβάθμιση/υποβάθμιση |
| MSG-08 | Διαγραφή συνομιλίας/retention | Δεν μειώνεται usage counter |
| MSG-09 | 16ο attachment και παράλληλες αποστολές σε chat | Ακριβώς 15 σύμφωνα με D07, μόνο στο συγκεκριμένο chat, κείμενο ασφαλές |
| MSG-10 | Ίδιο asset σε post/άλλο chat/hold | Καμία πρόωρη φυσική διαγραφή, retryable media cleanup |
| MSG-11 | Απλό μήνυμα 30 ημερών, active/closed context | v18: ενεργή υπόθεση κατά D12 προστατεύει· μετά το κλείσιμο επιστροφή στον κανόνα 30d από τη δημιουργία, όχι νέο 30ήμερο grace |
| MSG-12 | Πλαστό context ή context άλλου χρήστη | Deny, καμία παράταση retention από μη εξουσιοδοτημένο client |
| MSG-13 | Λείπει context λόγω παλιάς διαγραφής, report/dispute/legal hold | Ελεγχόμενη εξαίρεση/review, καμία σιωπηλή απώλεια στοιχείων |

### Περιεχόμενο / προϊόντα / γκαλερί

| ID | Σενάριο | Αναμενόμενο |
|---|---|---|
| CNT-01 | Free δημιουργεί Product/Activity/Home απευθείας από API | Deny για δημιουργία, όχι απαγόρευση αναζήτησης/κράτησης |
| CNT-02 | Αγγελία που επιχειρεί να λειτουργήσει ως απαγορευμένο Product | Εφαρμογή D02 με πραγματικούς validators, όχι μόνο renamed button |
| CNT-03 | Premium δεύτερο active Home / concurrent publish | Μόνο 1 active canonical ακίνητο |
| CNT-04 | Premium 13ο Post με επιτυχημένη/αποτυχημένη αποθήκευση | Αντικατάσταση παλαιότερου μόνο στην επιτυχία, retention 30 ημερών |
| CNT-05 | Free 4ο και Business 25ο Post | v18: Free 4ο απορρίπτεται με μήνυμα· Business 25ο αντικαθιστά το παλαιότερο και αφαιρεί αυτό + τα media του (ασφαλής καθαρισμός αν δεν χρησιμοποιούνται αλλού) |
| CNT-06 | Worker καθυστερεί / rerun cleanup / saved references | Ληγμένο post δεν εμφανίζεται, no orphan home_posts, idempotent cleanup |
| CNT-07 | Gallery 3/12/30 φωτογραφίες, 0/6/12 videos, API bypass | Server limits· v18 overflow: αυτόματη αντικατάσταση παλαιότερου χωριστά ανά είδος· avatar/cover ανέγγιχτα· shared asset ασφαλή |
| CNT-08 | Business 50→51 products σε profile/marketplace | Ένα canonical count, όχι διπλές εγγραφές ή double quota |
| CNT-09 | Αλλαγή κατηγορίας/legacy alias/παλιό URL | Υπάρχοντα IDs, Bookings, αιτήσεις και media δεν διαγράφονται |
| CNT-10 | Unapproved category/regulated product/invalid attributes | Deny ανεξάρτητα από πληρωμή ή υπαρκτό icon |

### Services / Events / Bookings

| ID | Σενάριο | Αναμενόμενο |
|---|---|---|
| SVC-T01 | Και οι 35 τύποι, ανά root και booking mode | Configuration contract και round-trip χωρίς απώλεια πεδίων |
| SVC-T02 | Λείπει/αλλοιώνεται root/subcategory/status στο create/update | Canonical server data ή σαφές deny, ποτέ αόρατο published record |
| SVC-T03 | Partial update μόνο name με υπάρχουσα gallery/λίστες | Δεν αδειάζουν μη υποβληθέντα δεδομένα· explicit empty έχει ξεχωριστή δοκιμή |
| SVC-T04 | Enabled services + άδειο types / mobility / unknown type | Fail closed για νέα δημοσίευση |
| SVC-T05 | Κάθε approved επάγγελμα και πολλαπλές ειδικότητες | Μόνο τα εγκεκριμένα modules, όχι γενικό root allow |
| SVC-T06 | 10 services + menu/rooms/products/bookings | Σωστά buckets D06, χωρίς αυθαίρετο unlimited ή λάθος cap |
| SVC-T07 | Publish/re-publish/reactivate παράλληλα | Atomic quota, όχι count-then-insert race |
| SVC-T08 | Slot/request/none/date-range Bookings | Σωστή υπάρχουσα ροή· none δεν γίνεται bookable λόγω CTA |
| SVC-T09 | Edit schedule, cancel/deactivate, pending/confirmed bookings | Booked slots/ιστορικό προστατεύονται, σωστή αποδέσμευση inventory |
| SVC-T10 | Hotel capacity, concurrent bookings, date blocks, DST, holds | Καμία υπερκράτηση, υπολογισμός τιμής server-side, σωστά expiry/refunds όπου ισχύουν |
| SVC-T11 | Nightlife πραγματικές table/VIP προσφορές και κοινό quota | Άδειες υπό τους εγκεκριμένους όρους, και οι δύο τύποι στο ίδιο 10, φυσικά τραπέζια/κρατήσεις δεν μετρούν ως νέες Services |
| SVC-T12 | Overnight 23:00→02:00, recurrence, timezone/DST | Πραγματικές ημερομηνίες/διαστήματα, σωστές επικαλύψεις την επόμενη ημέρα, χωρίς σιωπηλή μετατόπιση legacy δεδομένων· μετά την υλοποίηση του εγκεκριμένου σχεδιασμού |
| SVC-T13 | Απλή/VIP προσφορά ίδιου φυσικού τραπεζιού | Κοινή διαθεσιμότητα και τεκμηριωμένος lifecycle αιτημάτων/δεσμεύσεων· pending VIP δεν δηλώνεται πληρωμένο ή εγγυημένη κατανομή πόρου |
| SVC-T14 | Professional consultation/package/retainer | Κοινό 10, αντικείμενο/επαλήθευση ανά πραγματική ειδικότητα, consultation time_slot και package/retainer none με συμβατό inquiry, όχι αυτόματες συμβάσεις/χρεώσεις |
| SVC-T15 | Μεσιτικές/διαχειριστικές υπηρεσίες έναντι συγκεκριμένων ακινήτων | Γενικές υπηρεσίες στο 10, συγκεκριμένα ακίνητα σε χωριστό εγκεκριμένο capability/20 με εξουσιοδότηση· χωρίς destructive root αλλαγή ή προσωπικό όριο ενός σπιτιού. Απαιτείται capability-aware υλοποίηση, όχι πλαστό runtime root/module |
| SVC-T16 | Beauty appointment/package/course | Κοινό 10, συνάφεια όλων των συστατικών με εγκεκριμένες ειδικότητες, appointment/package time_slot και course αρχικό request χωρίς υποσχέσεις αυτόματης διαχείρισης συνεδριών |
| SVC-T17 | Beauty ρυθμιζόμενη πράξη με missing/pending επαλήθευση | Η συγκεκριμένη νέα προσφορά παραμένει μη ενεργή· category/plan/self-declaration δεν αρκούν, ενώ μη ρυθμιζόμενη περιποίηση δεν παίρνει άσχετη ιατρική απαίτηση |
| SVC-T18 | Beauty σειρά συνεδριών έναντι εκπαίδευσης | salon_course περιγράφει πραγματική σειρά περιποίησης, όχι σεμινάριο· συμβατά keys/IDs και σαφή labels, χωρίς νέο session redemption/scheduling σύστημα |
| SVC-T19 | Education τέσσερις τύποι και πέντε ειδικότητες | Συναφές πραγματικό διδακτικό αντικείμενο/format, κοινό 10 χωρίς counts μαθητών/ωρών/κρατήσεων ή αυτόματους ισχυρισμούς αναγνώρισης/πιστοποίησης |
| SVC-T20 | Edu_course έναντι salon_course | edu_course παραμένει none/inquiry, όχι request-mode Booking· κανένα νέο εγγραφολόγιο/παρουσιολόγιο/δίδακτρα/αυτόματος προγραμματισμός course |
| SVC-T21 | Εκπαιδευτικό workshop έναντι δημόσιου Event | Διάκριση βάσει σκοπού: πραγματική διδασκαλία μπορεί να είναι Service σε συγκεκριμένη ημερομηνία, δημόσια συναυλία/παράσταση/έκθεση δεν μετονομάζεται για Event quota bypass |
| SVC-T22 | Food menu 100→101 και πολλαπλές κουζίνες | 100 ενεργά δημοσιευμένα είδη συνολικά ανά επιχείρηση, 101ο publish/reactivation απορρίπτεται με concurrency safety· κοινός counter, όχι 100 ανά κουζίνα |
| SVC-T23 | Menu / table / product buckets | Μενού στο 100, table offers στο κοινό 10, προϊόντα στα δικά τους permissions/quota· no Booking/order/payment στο menu_item και no quota bypass με relabeling |
| SVC-T24 | Food-court / cafe / bakery πραγματικά δικαιώματα | Δικό τους πραγματικό μενού και εξουσιοδοτημένοι κρατήσιμοι πόροι μόνο, όχι ξένα μενού ή αυτόματη δέσμευση κοινόχρηστων τραπεζιών· προστασία legacy menus πάνω από νέο όριο |
| SVC-T25 | Επαγγελματικά ακίνητα 20→21 across πηγές | Κοινό 20 ανά Business και εγκεκριμένα property types, ιδιοκτησία/εξουσιοδότηση, μοναδική canonical καταμέτρηση, atomic publish/reactivation· προσωπικό Premium χωριστά στο 1 |
| SVC-T26 | Rental identity / management / inquiry | Σωστό Business badge/actor/παραλήπτης σε συμβατές Service/Listing πηγές, management για εγκεκριμένους μεσίτες/διαχειριστές χωρίς αλλαγή root, διατήρηση request/inquiry και IDs χωρίς πωλήσεις/hotel/μισθωτήρια/πληρωμές |
| SVC-T27 | Δημόσια θέση επαγγελματικού ακινήτου | Approximate εξ ορισμού σε όλα τα δημόσια API/χάρτες/details, exact μόνο με ρητή authorized επιλογή, καμία office fallback θέση ή έμμεση διαρροή ακριβών στοιχείων· ασφαλής legacy μετάβαση |
| SVC-T28 | Hotel 10 τύποι και sum(inventory_count) 100 | Και οι δύο έλεγχοι ταυτόχρονα σε publish/reactivate/inventory update με business-wide concurrency safety, όχι τεχνικό model bound 1000 ή quotas υπηρεσιών/ακινήτων |
| SVC-T29 | Hotel εμπορικό απόθεμα έναντι ημερήσιας διαθεσιμότητας | Held/occupied μονάδες συνεχίζουν να μετρούν στο 100· nightly availability, date blocks, guest limits, server-side quote και αποδέσμευση hold/cancellation διατηρούνται με regression tests |
| SVC-T30 | Hotel ίδιο stock σε διαφορετικά Service IDs | Audit SVC-018 και αποφυγή ανεξάρτητης πώλησης ίδιου physical stock, χωρίς υπόσχεση νέων rate plans/multi-hotel/room assignment/πληρωμών· παλιές κρατήσεις και IDs ασφαλή |
| SVC-T31 | Retail έξι ειδικότητες και conditional custom | Προϊόντα στα συναφή επιτρεπόμενα paths/50, πραγματική καταγεγραμμένη custom δυνατότητα στο κοινό 10, όχι επισκευές/τεχνικές εγκαταστάσεις μέσω retail_custom |
| SVC-T32 | Retail product matrix κενά / νέοι κωδικοί | Gifts/florists κενά δεν γίνονται unrestricted allow, ακριβή νέα paths με ρητή έγκριση και matching backend/frontend validation· ίδιο enforcement σε Listings και legacy product-like Services |
| SVC-T33 | Retail canonical / personalization / inquiries | Προαιρετική εξατομίκευση δεν δημιουργεί αυτόματα ανεξάρτητο product/service αντίγραφο, ίδιο canonical record σε profile/Marketplace, non-booking browse/quote χωρίς νέο checkout/πληρωμή/εκτέλεση παραγγελίας |
| SVC-T34 | Automotive 16 ειδικότητες και 50 οχήματα | Σωστά δικαιώματα πώλησης/ενοικίασης/επισκευής/πλυσίματος, 51ο vehicle publish/reactivation απορρίπτεται με concurrency safety, rental/repair/wash στο κοινό 10 χωρίς νέες προσφορές για στόλο/ώρες/κρατήσεις |
| SVC-T35 | Automotive deferred ειδικότητες και modes | Οι πέντε χωρίς-module ειδικότητες (μαθήματα/ασφάλειες/leasing/οδική βοήθεια/ανταλλακτικά) δεν βαφτίζουν άσχετες auto_* προσφορές· auto_vehicle none, τα τρία time_slot, καμία πληρωμή/leasing/insurance ενεργοποίηση, ελαστικά μόνο με εγκεκριμένη taxonomy |
| SVC-T36 | Healthcare πέντε ειδικότητες και πραγματικό πεδίο άσκησης | Ιατροί/οδοντίατροι/κλινικές μόνο υπηρεσίες που ασκούν, φαρμακεία μόνο πραγματικές συμβουλές/μετρήσεις, mental-health συνεδρίες χωρίς αυθαίρετες πράξεις· κοινό 10, time_slot, no medical-records/prescriptions/telemedicine/πληρωμές |
| SVC-T37 | Healthcare επαγγελματική επαλήθευση | Νέα ρυθμιζόμενη υπηρεσία παραμένει μη ενεργή με missing/pending/ανεπαρκή πραγματική επαλήθευση· category/plan/self-declared clinic δεν αρκούν, legacy ελέγχεται χωριστά χωρίς αυτόματη διαγραφή· οπτικές proposed ειδικότητες δεν ενεργοποιούνται πριν taxonomy ένταξη |
| SVC-T38 | Pets τρεις ειδικότητες και canonical προϊόντα | Κτηνίατροι μόνο pet_appointment με gate επαλήθευσης, grooming ραντεβού + εγκεκριμένα pet_care προϊόντα, supplies μόνο προϊόντα (ραντεβού με πρόσθετη ειδικότητα/δυνατότητα)· 10 Services/50 προϊόντα, time_slot/browse, χωρίς medical-records/payments |
| SVC-T39 | Pets χωρίς αυτόματη κτηνιατρική | Supplies/grooming δεν αποκτούν κτηνιατρικά δικαιώματα από το root· product-like pet_product οδεύει σε ένα canonical record, no duplication, νέοι product paths απαιτούν ρητή έγκριση |
| SVC-T40 | Mobility μη δημόσιος κλάδος | public-transport/taxi-services δεν εμφανίζονται σε δημόσιους pickers/register/create/category lists· απευθείας μη εξουσιοδοτημένη δημιουργία απορρίπτεται server-side· κανένα Service module/booking· υπάρχοντα mobility δεδομένα/εμφανίσεις δεν διαγράφονται |
| VER-* | Πολιτική επαλήθευσης ρυθμιζόμενων υπηρεσιών | Οι 8 αποδοχές VER-01…08 του [06-VERIFICATION-POLICY.md](06-VERIFICATION-POLICY.md) είναι **αναφορά για μελλοντική επανενεργοποίηση** — ανενεργές προς το παρόν λόγω της αναιρεμένης υποχρέωσης ελέγχου (ελεγχόμενες εισαγωγές) |
| EVT-01 | 4 βασικά Events, future/ongoing/cancelled/draft/recurring | Σωστό εγκεκριμένο active query, 5ο δεν περνά παράλληλα |
| EVT-02 | Event Pro/Organizer downgrade, παλιά Events, Artist Events | Εγκεκριμένα όρια μόνο, όχι διαγραφή ιστορικού ή αλλαγή Artist δικαιωμάτων |

### City Ads / πληρωμές

| ID | Σενάριο | Αναμενόμενο |
|---|---|---|
| ADS-01 | 25 παράλληλες αγορές ίδιας πόλης/ημέρας | Το πολύ 24 έγκυρες δεσμεύσεις, unique inventory enforced |
| ADS-02 | Πολυήμερη αγορά με γεμάτη ενδιάμεση ημέρα | Καμία κρυφή μερική αγορά/χρέωση χωρίς όλα τα συμφωνημένα dates |
| ADS-03 | Hold expires, late/duplicate/out-of-order webhook | Idempotent transitions, no overbook/διπλή χρέωση, προβλεπόμενο refund |
| ADS-04 | Fake success redirect, invalid signature, unpaid/rejected creative | Καμία ενεργοποίηση |
| ADS-05 | Α θέση: 2 exposures → Β, 2 Β → Α | Εναλλαγή μόνο του ζεύγους, οι άλλες 11 ανεπηρέαστες |
| ADS-06 | Refresh/preload/background/continuous visibility/πολλαπλά tabs | Μόνο έγκυρα deduplicated impressions D08 |
| ADS-07 | Home και results, διαφορετικοί viewers, επόμενη local day | Σωστή εγκεκριμένη κοινή/χωριστή viewer state, daily reset και isolation |
| ADS-08 | 0/1/13/24 διαθέσιμες καμπάνιες, Α ή Β λείπει | Καμία κενή ενεργή θέση/υπέρβαση 12 λογικών καρτών, προβλεπόμενη fallback συμπεριφορά |
| ADS-09 | Berlin αναζήτηση από άλλη πόλη, DST, city name aliases | Σταθερό city_id/timezone, όχι GPS/text-only targeting |
| ADS-10 | Ads outage / failed creative / legacy Stories | Οργανικά results λειτουργούν, σαφές sponsored label, no legacy-as-paid misrepresentation |

Icons: εφαρμόζονται επιπλέον τα κριτήρια του [03-ICONS-HANDOFF.md](03-ICONS-HANDOFF.md), μαζί με screenshots σε πραγματικά μεγέθη και accessibility tests.

## 3. Ασφαλής μετάβαση δεδομένων

1. **Baseline**: version/commit και working-tree diff της έκδοσης ανάθεσης, collection counts ανά actor/type/status, references/media usage και indexes. Απομονωμένο backup με δοκιμή restore. Μην συμπεριληφθούν secrets/προσωπικά δεδομένα σε παραδοτέα audit.
2. **Dry run μόνο**: έκθεση όσων υπερβαίνουν νέα quotas, παλιών/missing fields, Founder ημερομηνιών, άκυρων root/type, asset aliases και active bookings. Κανένα delete.
3. **Additive schema**: νέα optional fields και server fallbacks. Τα παλιά clients μπορούν να διαβάσουν/λειτουργήσουν κατά τη μεταβατική περίοδο χωρίς να παρακάμπτουν server enforcement όταν ενεργοποιηθεί.
4. **Backfill με operation/version markers**: idempotent, μικρά batches, audit counts, δυνατότητα resume. Δεν χρησιμοποιείται destructive Business category endpoint για μαζική αλλαγή root.
5. **Messages usage**: επιλογή έναρξης νέας περιόδου ή ελεγχόμενη μεταφορά usage. Δεν βαφτίζεται πλήρης μηνιαία κατανάλωση η καταμέτρηση surviving messages αν έχουν ήδη διαγραφεί. Εγκεκριμένη cutoff date.
6. **Legacy retention**: η προσθήκη TTL σε `created_at` μπορεί να σβήσει αμέσως παλιό ιστορικό. Πρώτα εγκεκριμένο schedule, logical expiry και dry-run review, μετά purge. Holds/contexts δεν υποστηρίζονται από ένα τυφλό global TTL.
7. **Canonical products**: mapping αρχικού service/listing ID, redirects/read adapters όπου χρειάζονται, no duplicates. Καμία μαζική διαγραφή product-like Services πριν αποδειχθεί συμβατότητα αναφορών.
8. **Shadow evaluation**: resolver/quotas/retention υπολογίζονται χωρίς enforcement και συγκρίνονται με legacy συμπεριφορά. Καταγραφή reason-code διαφορών χωρίς αποκάλυψη μηνυμάτων.
9. **Feature flags σταδιακά**: actor rights → correctness fixes → quota → retention logical hide → delayed purge. City Ads κρατήσεις και billing με ξεχωριστό flag και sandbox provider.
10. **Production gate**: approved D decisions, tests, restore rehearsal, Founder sampling, observability και νομική/εμπορική έγκριση. Καμία πραγματική χρέωση μόνο επειδή πέρασε ένα UI preview.

### Rollback

Απενεργοποίηση νέου UI/νέων αγορών δεν πρέπει να εγκαταλείπει πληρωμένες καμπάνιες ή δεσμευμένες θέσεις. Billing reconciliation/εξυπηρέτηση ενεργών Bookings συνεχίζεται. Additive fields/indexes παραμένουν μέχρι ασφαλή μετέπειτα migration.

Αν υπήρξε logical expiry, μπορεί να γίνει ασφαλές unhide όπου επιτρέπεται. **Μετά τη φυσική διαγραφή media δεν υπάρχει απλό rollback από feature flag.** Γι' αυτό το purge είναι τελευταίο, με καθυστέρηση/backup και εγκεκριμένα holds. Δεν υποσχόμαστε αποκατάσταση που παραβιάζει νόμιμη διαγραφή.

## 4. Παρακολούθηση και τελική παράδοση

Απαιτούμενα metrics: quota denials ανά reason/actor, send idempotency conflicts, pending operation age, negative/over-limit counters, orphan contexts/assets, cleanup lag, slot oversell violations, holds expiry, payment reconciliation mismatch, paid-but-not-serving campaigns. Logs χωρίς κείμενα συνομιλιών ή card secrets.

Κάθε ανάδοχος παραδίδει:

- Λίστα αρχείων/διαδρομών που άλλαξε και compatibility notes.
- Contract/schema/index changes με migrations και dry-run/rollback commands.
- Tests και **πραγματικά αποτελέσματα** (pass/fail/skipped), όχι μόνο λίστα επιθυμητών tests.
- Screenshots/recordings για αλλαγές UI σε web/mobile.
- Τυχόν νέα env keys με placeholders, ποτέ secrets.
- Ενημερωμένο audit log με resolved/unresolved findings και αναφορές σε PRs.
- Ονομαστικό sign-off για D01–D13 που αφορούν το παραδοτέο.

## 5. Τι εκτελέστηκε σε αυτό το πακέτο

- Offline inventory generator: επιτυχία, κανένα configuration mismatch στα Service modules/modes, κανένα missing referenced asset ή invalid declared current glyph στα ελεγχθέντα σύνολα.
- `node --test tests/illustrated-icons.test.cjs`: **4 passed / 0 failed**.
- Backend/API/Booking/πληρωμές/production migrations: **δεν εκτελέστηκαν**.
- Δεν άλλαξε application source ούτε έγινε commit/push/deploy. Τα αρχεία που προστέθηκαν είναι τεκμηρίωση, CSV/JSON και εργαλεία offline απογραφής αυτού του πακέτου.
