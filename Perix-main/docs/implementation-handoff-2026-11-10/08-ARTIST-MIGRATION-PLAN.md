# Η — Σχέδιο μετάβασης ταυτότητας Artist → Business (D13)

Κατάσταση: **εγκεκριμένο σχέδιο (v18), όχι εκτελεσμένη μετάβαση.** Απόφαση: η ξεχωριστή ταυτότητα `artist` αφαιρείται επειδή υπάρχει ήδη Business κατηγορία artists-performers (djs, bands, singers, comedians, magicians, dancers, actors, mcs-hosts, cultural-groups).

## 1. Στόχος

Ένας actor λιγότερος στο σύστημα, χωρίς απώλεια δεδομένων, links ή κρατήσεων. Κάθε υπάρχον artist profile/event/message αντιστοιχίζεται ρητά σε Business με ειδικότητα artists-performers ή σε ρητά εγκεκριμένη εξαίρεση.

## 2. Μη καταστροφικοί κανόνες

1. **Καμία διαγραφή πριν την ολοκλήρωση του mapping.** Τα artist docs παραμένουν αναγνώσιμα καθ' όλη τη μετάβαση.
2. **Ένα Business ανά artist**, μέσω της υπάρχουσας ροής δημιουργίας (access code, μία επιχείρηση ανά ιδιοκτήτη). Όπου ο owner έχει ήδη Business, το artist συγχωνεύεται σε αυτό μόνο με ρητή αντιστοίχιση ειδικότητας.
3. **Mapping πίνακας:** artist_id → νέο/υπάρχον business_id + ειδικότητα artists-performers. Για κάθε artist event, το `artist_id` γίνεται `business_id` στο νέο profile· το παλιό ID διατηρείται ως `legacy_artist_id` για συμβατότητα URL.
4. **Artist Events** μεταφέρονται ως Business Events με τα υπάρχοντα event_id/URLs, χωρίς αλλαγή ορίων ιστορικών εγγραφών.
5. **Μηνύματα/συνομιλίες:** τα `to_artist_id` references επιλύονται στο νέο business_id μέσω του mapping· νέα μηνύματα δεν δημιουργούν artist conversations.
6. **Προφίλ/γκαλερί/media:** διατηρούνται με το αρχικό ownership· το Business υιοθετεί avatar/cover όπου υπάρχουν.
7. **Δημιουργία artist:** απενεργοποιείται σε auth/register/create flows **μόνο αφού** ολοκληρωθεί το mapping και ο έλεγχος συμβατότητας.

## 3. Ενδεικτική σειρά εκτέλεσης (μετά Φ0)

1. Dry-run απογραφή: πλήθος artists, events, messages, references ανά artist.
2. Πιλοτικό mapping σε απομονωμένο περιβάλλον με πλήρη επαλήθευση URLs/δεδομένων.
3. Δημιουργία/σύνδεση Business με ειδικότητα artists-performers ανά artist.
4. Backfill event/message/conversation references μέσω idempotent batches.
5. Απενεργοποίηση δημιουργίας artist (server + UI) με feature flag.
6. Παρακολούθηση λήξης legacy artist ροών και τελικός καθαρισμός μόνο με έγκριση.

## 4. Αποδοχή

| ID | Έλεγχος |
|---|---|
| ART-01 | Κάθε artist αποκτά αντιστοιχισμένο Business· κανένα ορφανό |
| ART-02 | Artist Event ανοίγει με το ίδιο event_id και σωστό Business badge |
| ART-03 | Παλιά conversation links λειτουργούν μέσω mapping |
| ART-04 | Καμία διαγραφή πριν την ολοκλήρωση· rollback δυνατό |
| ART-05 | Δημιουργία artist απορρίπτεται μετά την απενεργοποίηση |
