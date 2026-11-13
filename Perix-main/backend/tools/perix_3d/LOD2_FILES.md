# LoD2 Sachsen-Anhalt — ποια επίσημα αρχεία να κατεβάσουμε

Ο importer (`lod2_import.py`) διαβάζει **τοπικά** CityGML2/ZIP από τον φάκελο:

`Perix-main/backend/tools/perix_3d/lod2_inbox/`

Το portal (https://www.lvermgeo.sachsen-anhalt.de/de/gdp-open-data.html) δεν είναι
προσβάσιμο από όλα τα περιβάλλοντα — γι' αυτό η λήψη γίνεται χειροκίνητα, μία φορά.

## Τι να κατεβάσεις

1. Geodatenportal Sachsen-Anhalt → Open Data → **3D-Gebäudemodelle LoD2** (CityGML 2.0).
2. Περιοχές (μία λήψη ανά δήμο, αρκεί):
   - **Stadt Magdeburg** (kreisfreie Stadt) — πλήρες LoD2 πακέτο πόλης.
   - **Hansestadt Gardelegen** (Altmarkkreis Salzwedel) — πακέτο δήμου/κοινότητας.
3. Μορφή: `.gml` / `.xml` CityGML 2.0 (με `bldg:Building`, `lod2Solid` ή
   `lod2MultiSurface`, `roofType`, `measuredHeight`), σκέτο ή μέσα σε `.zip`.
4. Αντιγραφή των αρχείων (όπως κατέβηκαν, χωρίς μετονομασία) στο `lod2_inbox/`.
5. Εκτέλεση: `python tools/perix_3d/lod2_import.py` (από `backend/`).

## Τι κάνει ο importer

- CRS: ETRS89/UTM32N (EPSG:25832) → WGS84 (κλειστός μαθηματικός τύπος, ~cm).
- Κρατά: περίγραμμα, μετρημένο ύψος, τύπο στέγης, υψόμετρα εδάφους, gml:id.
- Αντιστοιχίζει ΜΟΝΟ επιλεγμένα PERIX IDs (point-in-polygon + QA).
- Προτεραιότητα: επίσημο LoD2 > OSM outline > Microsoft prediction.
- Άδεια: **DL-DE BY 2.0** — υποχρεωτική αναφορά πηγής στο UI όταν ενεργοποιηθεί.

## Εναλλακτική πηγή (bkg.bund.de)

Αν το lvermgeo δεν αποκρίνεται, τα ίδια LoD2 διατίθενται κεντρικά από το
BKG (Bundesamt für Kartographie). Ίδια διαδικασία: λήψη → `lod2_inbox/`.
