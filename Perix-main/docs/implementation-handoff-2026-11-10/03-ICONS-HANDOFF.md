# Γ — Ανάθεση icons προϊόντων, ακινήτων και Services

## 1. Τι αναθέτουμε πραγματικά

**Όχι νέο σύνολο icons από το μηδέν.** Στο σημερινό working tree υπάρχει ήδη σύστημα illustrations:

- `frontend/components/icons/IllustratedIcon.tsx`: επιλογή illustration ανά kind/key, Ionicons fallback όταν λείπει.
- `frontend/lib/illustrationSources.generated.ts`: static require maps για roots, groups, υποκατηγορίες, προϊόντα και 35 modules.
- `frontend/lib/civicIllustrations.ts`: property types και άλλες ειδικές ομάδες.
- `frontend/assets/illustrations/`: υπάρχοντα WebP assets και sources/manifests.

Τα παραπάνω περιέχουν προϋπάρχουσα εργασία. **Δεν διαγράφονται, δεν αντικαθίστανται και δεν αναγεννώνται συνολικά** στο πλαίσιο απλής καταγραφής/ανάθεσης. Η προηγούμενη πρόταση για ανεξάρτητο `iconRegistry.ts` δεν υιοθετείται αυτόματα: θα δημιουργούσε δεύτερη πηγή αλήθειας.

Ο συνεργάτης λαμβάνει το [icon-inventory.csv](generated/icon-inventory.csv) και παραδίδει **gap report + στοχευμένες προσθήκες/διορθώσεις** στο υπάρχον σύστημα. Η επιλογή νέου καλλιτεχνικού ύφους απαιτεί ξεχωριστή έγκριση.

## 2. Πλήρης λίστα και τρόπος ανάγνωσης

Κάθε γραμμή CSV περιέχει:

| Στήλη | Ερμηνεία |
|---|---|
| domain | product-root, product-subcategory, business-root, business-group, business-subcategory, service-module, property-type ή creation-or-section |
| parent / key | Σταθερή διαδρομή. Το `key` μόνο του δεν είναι πάντα μοναδικό μεταξύ domains. |
| taxonomy_status | `current`, `proposed`, `current_proposed_retirement_or_move`, `backend_only_legacy_candidate` ή σαφής UI/artwork status |
| label_key | Σημερινό translation key όπου υπάρχει στην πηγή που ελέγχθηκε. Κενό δεν σημαίνει ότι δεν υπάρχουν αλλού μεταφράσεις. |
| current_ionicon / glyph_valid | Σημερινό glyph όπου έχει δηλωθεί. Ελεγμένο στην εγκατεστημένη glyph map. Κενό δεν είναι άδεια για αυθαίρετο glyph. |
| illustration / asset_exists | Πραγματική υπάρχουσα διαδρομή εικόνας και έλεγχος ύπαρξης, όχι υπόσχεση ότι κάθε caller την προβάλλει. |
| note | Legacy διευκρίνιση, προτεινόμενο fallback, περιορισμός ελέγχου |

Οι paths illustration μπορεί να περιέχουν `frontend/lib/../assets/...` επειδή παράγονται από τα πραγματικά static `require`. Επιλύονται στο `frontend/assets/...` και ελέγχθηκαν ως αρχεία.

### Κάλυψη που επαληθεύτηκε

| Σύνολο | Σημερινή taxonomy | Διαθέσιμο artwork |
|---|---:|---:|
| Product roots | 13 | 17 |
| Product subcategories | 122 frontend / 123 backend paths | 187 keys |
| Business roots | 15 | 15 |
| Business groups | 38 | 38 |
| Business subcategories | 164 | 174 keys στον γενικό subcategory map, όχι 174 επιχειρηματικά επαγγέλματα |
| Service modules | 35 | 35 |

Ο γενικός map περιλαμβάνει και άλλες υποκατηγορίες, π.χ. property/job keys. **Δεν αυξάνουμε το επιχειρηματικό δέντρο επειδή μετρήσαμε εικόνες.** Τα 187 product assets περιλαμβάνουν legacy keys και δεν ισοδυναμούν με την πρόταση 184 ενεργών paths.

Η πρόταση 17/184 έχει απογραφεί πλήρως στο `proposed-product-taxonomy.json` και στις αντίστοιχες CSV γραμμές. Οι τρεις οπτικές ειδικότητες `opticians`, `ophthalmologists`, `optical-stores` είναι προτεινόμενες, όχι σημερινές εγγραφές taxonomy. **Δεν βρέθηκε artwork για αυτές στον ελεγχθέντα map.** Προτεινόμενα fallback glyphs: `glasses-outline`, `eye-outline`, `glasses-outline`, με επαλήθευση glyph πριν χρήση.

## 3. Ακίνητα, Listings και Αγγελίες

Σημερινοί περιγραφόμενοι personal property types: `apartment`, `house`, `studio`, `room` στο `backend/models/listing.py`. Υπάρχει επίσης illustration mapping `commercial` στο `civicIllustrations.ts`. Αυτό δεν αποδεικνύει ότι το `commercial` είναι πλήρως υποστηριζόμενη επιλογή σε όλη τη ροή ακινήτων.

`rental_property` και `hotel_room` είναι ξεχωριστά Service modules με τα ήδη υπάρχοντα icons. Δεν μετατρέπονται σε προσωπικό `home_rental` και δεν συγχέονται με το label Marketplace Listings.

Προτεινόμενα UI fallback icons:

| Έννοια | Glyph | Κατάσταση |
|---|---|---|
| Νέα Αγγελία | megaphone-outline | Νέο UI action/kind προς οριστικοποίηση, όχι σημερινό API listing_type |
| Προσωπικό Item | pricetag-outline | Label ανά δικαίωμα |
| Items ενότητα | bag-handle-outline | Προτεινόμενο section fallback |
| Listings/ακίνητα ενότητα | home-outline | Προτεινόμενο section fallback |

Η ακριβής σημασία Free Αγγελίας vs Product είναι η απόφαση D02, όχι απόφαση του icon contractor.

## 4. Οδηγίες σχεδιασμού/ενσωμάτωσης

1. Χρήση υπάρχοντος `IllustratedIcon` kind και key. Ίδια taxonomy διαδρομή → ίδιο artwork σε picker, filter, form, card και detail.
2. Μην προσθέτετε emoji ως εναλλακτικό σύστημα. Ionicons μέσω της εγκατεστημένης `@expo/vector-icons` είναι fallback/μικρά λειτουργικά controls, όχι αφορμή αντικατάστασης όλου του artwork.
3. Τηρείται υφιστάμενο art style, αναγνωσιμότητα σε μικρό μέγεθος, διαφάνεια, ασφαλές padding, κοινό οπτικό βάρος. Preview σε πραγματικές διαστάσεις UI και σε φωτεινό/σκούρο/επιλεγμένο φόντο.
4. Σταθερά names, χωρίς αλλαγή slug/ID/API contract. Legacy aliases επιλύονται σε canonical artwork στον υπάρχοντα μηχανισμό, δεν γίνονται νέες ενεργές κατηγορίες.
5. Στατικά `require` συμβατά με Expo bundling· όχι dynamic filesystem paths στο runtime.
6. Εικόνα είναι διακοσμητική όταν υπάρχει διπλανό κείμενο (`accessible=false` όπως σήμερα). Icon-only κουμπί παίρνει μεταφρασμένο accessibility label. Όχι μόνο χρώμα για selected/disabled κατάσταση.
7. Οικογένειες cuisines ξεχωρίζουν με label, όχι εθνικές σημαίες/στερεότυπα. Ρυθμιζόμενη επαγγελματική άδεια δεν δηλώνεται από ένα medical icon.
8. Δεν αλλάζει ο contractor permissions, subscription gates, Booking mode, quota ή taxonomy activation. Οι proposed γραμμές απαιτούν product-owner έγκριση.

## 5. Επιφάνειες ελέγχου

- Marketplace: `frontend/lib/marketplace/marketplaceTaxonomy.ts`, `components/marketplace/MarketplaceCategoryPicker.tsx`, `MarketplaceCategoryFilter.tsx`, `components/user/ListingModal.tsx`.
- Services: `frontend/lib/config/serviceCategoryMatrix.ts`, `serviceModules.ts`, `components/business/ServiceModal.tsx`, `CategoryServiceCard.tsx`, `ServiceSection.tsx`, `app/services.tsx`, booking lists.
- Profile/create/home: `frontend/components/profile/UserProfilePremium.tsx`, `BusinessProfilePremium.tsx`, `components/user/CreationSheet.tsx`, `components/business/BusinessActionsModal.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/home.tsx`.
- Επιλογή κατηγοριών και Locator: οι σημερινοί callers του `IllustratedIcon`, χωρίς γενική επανασχεδίαση χάρτη/navigation.
- Μεταφράσεις: `frontend/i18n/locales/`.

## 6. Παραδοτέα / κριτήρια αποδοχής

- Inventory με αποτέλεσμα ανά γραμμή: reuse / missing / visual revision / pending taxonomy approval. Όχι μία συνολική ένδειξη «έγιναν τα icons».
- 100% κάλυψη των **ενεργών** keys, ομαδικά και μεμονωμένα. Για proposed keys, κάλυψη μόνο αφού εγκριθεί ενεργοποίηση.
- Έλεγχος glyph map, υπαρκτά static assets, σωστό fallback και κανένα broken image στο web/iOS/Android.
- Συμβατότητα aliases και no slug/API changes.
- Contact sheet ή screenshots πραγματικών selectors/cards, με labels και selected/disabled states.
- Source artwork, άδεια χρήσης/provenance, manifests και μόνο οι στοχευμένες αλλαγές στον υπάρχοντα generation workflow.
- Επιτυχία `node --test tests/illustrated-icons.test.cjs` από `frontend/`, με ενημέρωση προσδοκιών μόνο όταν έχει πράγματι εγκριθεί νέα taxonomy/artwork.

Ο σημερινός έλεγχος πέρασε 4/4. Δεν έγινε εδώ παραγωγή/επεξεργασία εικόνων και δεν εγκρίθηκε οπτικά κάθε υφιστάμενο αρχείο.
