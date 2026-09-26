"""Public legal pages (Privacy Policy, Terms of Service, Impressum).

Served at /privacy, /terms and /impressum. Content is kept in sync with the
in-app legal screens (frontend/app/privacy-policy.tsx and terms-of-service.tsx).
Age policy: 16+. Service providers: Cloudinary (media), Mux (video encoding),
MongoDB via Railway (database), Google Maps (maps). Payment providers: none.
"""

_CONTROLLER = "Perix Team"
_EMAIL_PRIVACY = "privacy@perix.app"
_EMAIL_SUPPORT = "support@perix.app"

_PRIVACY = {
    "en": {
        "title": "Privacy Policy",
        "updated": "Last updated: September 2026",
        "body": """
<h2>1. Data Controller</h2>
<p>The data controller responsible for your personal data is <strong>Perix (app.perixapp.com)</strong>, operated by the Perix Team.</p>
<p>Contact: <a href="mailto:privacy@perix.app">privacy@perix.app</a> (data protection) &middot; <a href="mailto:support@perix.app">support@perix.app</a> (support).</p>

<h2>2. What We Collect</h2>
<p>We collect the information you provide directly: name, email address, location, profile photos, posts, messages and any other content you choose to share.</p>

<h2>3. How We Use Your Data &mdash; Legal Bases (GDPR Art. 6)</h2>
<ul>
<li><strong>Performance of a contract (Art. 6(1)(b))</strong> &mdash; providing your account and the app&rsquo;s features.</li>
<li><strong>Legitimate interests (Art. 6(1)(f))</strong> &mdash; keeping the service secure, preventing fraud and abuse, moderating content and protecting users.</li>
<li><strong>Consent (Art. 6(1)(a))</strong> &mdash; where you have given consent, e.g. for optional notifications. You may withdraw consent at any time.</li>
<li><strong>Legal obligations (Art. 6(1)(c))</strong> &mdash; tax, accounting and law-enforcement requirements.</li>
</ul>

<h2>4. Service Providers</h2>
<p>We use the following processors to operate the service:</p>
<ul>
<li><strong>Cloudinary</strong> &mdash; image and video hosting</li>
<li><strong>Mux</strong> &mdash; video encoding and streaming</li>
<li><strong>MongoDB (hosted via Railway)</strong> &mdash; database storage</li>
<li><strong>Google Maps</strong> &mdash; map display and location search</li>
</ul>
<p>Perix has no payment processors. We are not involved in any payments between users or businesses.</p>

<h2>5. Data Retention</h2>
<ul>
<li>Account and content data &mdash; for as long as your account exists, then permanently deleted (business content is removed from public view immediately and deleted within 30 days).</li>
<li>Booking, payment and subscription records &mdash; as long as required by tax and financial law.</li>
<li>Technical identifiers for abuse/fraud prevention &mdash; up to 12 months.</li>
<li>Reports &mdash; retained for moderation without unnecessary personal details.</li>
</ul>

<h2>6. International Transfers</h2>
<p>Your data is stored on servers within the European Union. Where processors transfer data outside the EEA we rely on standard contractual clauses or equivalent safeguards under GDPR Chapter V.</p>

<h2>7. Data Security</h2>
<p>We take reasonable technical and organisational measures to protect your data. Data is encrypted in transit (HTTPS/TLS). Data at rest is stored on cloud infrastructure with encrypted storage managed by our hosting provider.</p>

<h2>8. Your Rights</h2>
<p>You have the right to access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20), objection (Art. 21) and to withdraw consent (Art. 7(3)). Contact us to exercise your rights &mdash; we respond within one month. You may also lodge a complaint with your national data-protection supervisory authority.</p>

<h2>9. Automated Decisions</h2>
<p>We do not make decisions with legal or similarly significant effects based solely on automated processing. Content flagged by automated moderation is always reviewed by a human.</p>

<h2>10. Account Deletion</h2>
<p>You can delete your account at any time in the app (Settings &rarr; Delete Account) or at <a href="/account-deletion">app.perixapp.com/account-deletion</a>.</p>

<h2>11. Age Policy</h2>
<p>Our service is intended for users aged <strong>16 or older</strong>. We do not knowingly collect personal information from children under 16.</p>

<h2>12. Changes</h2>
<p>We may update this policy from time to time. Material changes will be announced on this page.</p>
""",
    },
    "de": {
        "title": "Datenschutzerklärung",
        "updated": "Zuletzt aktualisiert: September 2026",
        "body": """
<h2>1. Verantwortlicher</h2>
<p>Verantwortlicher für deine personenbezogenen Daten ist <strong>Perix (app.perixapp.com)</strong>, betrieben vom Perix-Team.</p>
<p>Kontakt: <a href="mailto:privacy@perix.app">privacy@perix.app</a> (Datenschutz) &middot; <a href="mailto:support@perix.app">support@perix.app</a> (Support).</p>

<h2>2. Datenerhebung</h2>
<p>Wir erheben die Daten, die du uns direkt bereitstellst: Name, E-Mail-Adresse, Standort, Profilfotos, Beiträge, Nachrichten und sonstige Inhalte.</p>

<h2>3. Zwecke &mdash; Rechtsgrundlagen (DSGVO Art. 6)</h2>
<ul>
<li><strong>Vertragserfüllung (Art. 6 Abs. 1 lit. b)</strong> &mdash; Bereitstellung deines Kontos und der App-Funktionen.</li>
<li><strong>Berechtigte Interessen (Art. 6 Abs. 1 lit. f)</strong> &mdash; Sicherheit des Dienstes, Betrugs- und Missbrauchsprävention, Moderation und Schutz der Nutzer.</li>
<li><strong>Einwilligung (Art. 6 Abs. 1 lit. a)</strong> &mdash; wo du eingewilligt hast, z. B. für optionale Benachrichtigungen. Einwilligungen sind jederzeit widerrufbar.</li>
<li><strong>Rechtliche Verpflichtungen (Art. 6 Abs. 1 lit. c)</strong> &mdash; Steuer-, Buchhaltungs- und Behördenanforderungen.</li>
</ul>

<h2>4. Dienstleister</h2>
<ul>
<li><strong>Cloudinary</strong> &mdash; Bild- und Video-Hosting</li>
<li><strong>Mux</strong> &mdash; Video-Encoding und Streaming</li>
<li><strong>MongoDB (gehostet über Railway)</strong> &mdash; Datenbankspeicherung</li>
<li><strong>Google Maps</strong> &mdash; Kartendarstellung und Ortssuche</li>
</ul>
<p>Perix hat keine Zahlungsdienstleister. Wir sind an keinerlei Zahlungen zwischen Nutzern oder Unternehmen beteiligt.</p>

<h2>5. Speicherdauer</h2>
<ul>
<li>Konto- und Inhaltsdaten &mdash; solange das Konto besteht, danach dauerhaft gelöscht (Unternehmensinhalte werden sofort aus der Öffentlichkeit entfernt und innerhalb von 30 Tagen gelöscht).</li>
<li>Buchungs-, Zahlungs- und Abonnementdaten &mdash; solange steuer- und finanzrechtlich vorgeschrieben.</li>
<li>Technische Kennungen zur Missbrauchsprävention &mdash; bis zu 12 Monate.</li>
<li>Meldungen &mdash; für die Moderation ohne unnötige personenbezogene Details.</li>
</ul>

<h2>6. Internationale Übermittlungen</h2>
<p>Deine Daten werden auf Servern innerhalb der Europäischen Union gespeichert. Erfolgt eine Verarbeitung außerhalb des EWR, stützen wir uns auf Standardvertragsklauseln oder gleichwertige Garantien nach DSGVO Kapitel V.</p>

<h2>7. Datensicherheit</h2>
<p>Wir ergreifen angemessene technische und organisatorische Maßnahmen zum Schutz deiner Daten. Daten werden bei der Übertragung verschlüsselt (HTTPS/TLS). Ruhende Daten liegen auf Cloud-Infrastruktur mit verschlüsseltem Speicher unseres Hosting-Anbieters.</p>

<h2>8. Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21) und Widerruf der Einwilligung (Art. 7 Abs. 3). Wir antworten innerhalb eines Monats. Du kannst dich auch bei deiner nationalen Datenschutz-Aufsichtsbehörde beschweren.</p>

<h2>9. Automatisierte Entscheidungen</h2>
<p>Wir treffen keine Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung, die ausschließlich auf automatisierter Verarbeitung beruhen. Automatisch markierte Inhalte werden immer von einem Menschen geprüft.</p>

<h2>10. Kontolöschung</h2>
<p>Du kannst dein Konto jederzeit in der App löschen (Einstellungen &rarr; Konto löschen) oder unter <a href="/account-deletion">app.perixapp.com/account-deletion</a>.</p>

<h2>11. Altersrichtlinie</h2>
<p>Unser Dienst richtet sich an Nutzer ab <strong>16 Jahren</strong>. Wir erheben wissentlich keine Daten von Kindern unter 16.</p>

<h2>12. Änderungen</h2>
<p>Wir können diese Erklärung gelegentlich aktualisieren. Wesentliche Änderungen werden auf dieser Seite bekannt gegeben.</p>
""",
    },
    "el": {
        "title": "Πολιτική Απορρήτου",
        "updated": "Τελευταία ενημέρωση: Σεπτέμβριος 2026",
        "body": """
<h2>1. Υπεύθυνος Επεξεργασίας</h2>
<p>Υπεύθυνος επεξεργασίας για τα προσωπικά σου δεδομένα είναι το <strong>Perix (app.perixapp.com)</strong>, που λειτουργεί η ομάδα Perix.</p>
<p>Επικοινωνία: <a href="mailto:privacy@perix.app">privacy@perix.app</a> (προστασία δεδομένων) &middot; <a href="mailto:support@perix.app">support@perix.app</a> (υποστήριξη).</p>

<h2>2. Τι Συλλέγουμε</h2>
<p>Συλλέγουμε όσα μας παρέχεις: όνομα, email, τοποθεσία, φωτογραφίες προφίλ, δημοσιεύσεις, μηνύματα και όποιο άλλο περιεχόμενο επιλέξεις.</p>

<h2>3. Σκοποί — Νομικές Βάσεις (GDPR Άρθρο 6)</h2>
<ul>
<li><strong>Εκτέλεση σύμβασης (Άρθρο 6 παρ. 1 στ. β')</strong> — παροχή λογαριασμού και λειτουργιών της εφαρμογής.</li>
<li><strong>Έννομα συμφέροντα (Άρθρο 6 παρ. 1 στ. στ')</strong> — ασφάλεια της υπηρεσίας, πρόληψη απάτης, διαχείριση περιεχομένου και προστασία χρηστών.</li>
<li><strong>Συγκατάθεση (Άρθρο 6 παρ. 1 στ. α')</strong> — όπου έχεις συγκατατεθεί, π.χ. για προαιρετικές ειδοποιήσεις. Μπορείς να την ανακαλέσεις ανά πάσα στιγμή.</li>
<li><strong>Νομικές υποχρεώσεις (Άρθρο 6 παρ. 1 στ. γ')</strong> — φορολογικές, λογιστικές και αρχές επιβολής του νόμου.</li>
</ul>

<h2>4. Πάροχοι Υπηρεσιών</h2>
<ul>
<li><strong>Cloudinary</strong> — φιλοξενία εικόνων και βίντεο</li>
<li><strong>Mux</strong> — κωδικοποίηση και ροή βίντεο</li>
<li><strong>MongoDB (μέσω Railway)</strong> — αποθήκευση βάσης δεδομένων</li>
<li><strong>Google Maps</strong> — χάρτες και αναζήτηση τοποθεσίας</li>
</ul>
<p>Το Perix δεν έχει παρόχους πληρωμών. Δεν εμπλεκόμαστε σε καμία πληρωμή μεταξύ χρηστών ή επιχειρήσεων.</p>

<h2>5. Διατήρηση Δεδομένων</h2>
<ul>
<li>Δεδομένα λογαριασμού και περιεχομένου — όσο υπάρχει ο λογαριασμός, μετά οριστική διαγραφή (επιχειρηματικό περιεχόμενο απομακρύνεται άμεσα από το κοινό και διαγράφεται εντός 30 ημερών).</li>
<li>Αρχεία κρατήσεων, πληρωμών και συνδρομών — όσο απαιτεί ο φορολογικός και οικονομικός νόμος.</li>
<li>Τεχνικά αναγνωριστικά κατά της κατάχρησης — έως 12 μήνες.</li>
<li>Αναφορές — για διαχείριση χωρίς περιττά προσωπικά στοιχεία.</li>
</ul>

<h2>6. Διεθνείς Διαβιβάσεις</h2>
<p>Τα δεδομένα σου αποθηκεύονται σε διακομιστές εντός της ΕΕ. Όπου απαιτείται επεξεργασία εκτός ΕΟΧ, βασιζόμαστε σε τυποποιημένες συμβατικές ρήτρες ή ισοδύναμες εγγυήσεις (GDPR Κεφάλαιο V).</p>

<h2>7. Ασφάλεια Δεδομένων</h2>
<p>Λαμβάνουμε εύλογα τεχνικά και οργανωτικά μέτρα. Τα δεδομένα κρυπτογραφούνται κατά τη μεταφορά (HTTPS/TLS). Τα αποθηκευμένα δεδομένα βρίσκονται σε cloud υποδομή με κρυπτογραφημένο χώρο αποθήκευσης του παρόχου φιλοξενίας.</p>

<h2>8. Τα Δικαιώματά σου</h2>
<p>Δικαίωμα πρόσβασης (Άρθρο 15), διόρθωσης (16), διαγραφής (17), περιορισμού (18), φορητότητας (20), εναντίωσης (21) και ανάκλησης συγκατάθεσης (Άρθρο 7 παρ. 3). Απαντούμε εντός ενός μήνα. Μπορείς επίσης να υποβάλεις καταγγελία στην εθνική εποπτική αρχή.</p>

<h2>9. Αυτοματοποιημένες Αποφάσεις</h2>
<p>Δεν λαμβάνουμε αποφάσεις με έννομες συνέπειες βάσει αποκλειστικά αυτοματοποιημένης επεξεργασίας. Το αυτόματα επισημασμένο περιεχόμενο ελέγχεται πάντα από άνθρωπο.</p>

<h2>10. Διαγραφή Λογαριασμού</h2>
<p>Μπορείς να διαγράψεις τον λογαριασμό σου ανά πάσα στιγμή από την εφαρμογή (Ρυθμίσεις → Διαγραφή) ή στο <a href="/account-deletion">app.perixapp.com/account-deletion</a>.</p>

<h2>11. Πολιτική Ηλικίας</h2>
<p>Η υπηρεσία απευθύνεται σε χρήστες <strong>16 ετών και άνω</strong>. Δεν συλλέγουμε εν γνώσει μας δεδομένα ανηλίκων κάτω των 16.</p>

<h2>12. Αλλαγές</h2>
<p>Ενδέχεται να ενημερώνουμε αυτήν την πολιτική. Οι σημαντικές αλλαγές ανακοινώνονται σε αυτήν τη σελίδα.</p>
""",
    },
}

_TERMS = {
    "en": {
        "title": "Terms of Service",
        "updated": "Last updated: September 2026",
        "body": """
<h2>1. Acceptance</h2><p>By accessing or using Perix you agree to these Terms. If you do not agree, you may not use the service.</p>
<h2>2. Eligibility</h2><p>You must be at least <strong>16 years old</strong> to use Perix.</p>
<h2>3. Our Role — Platform Only</h2><p>Perix is a neutral platform connecting users and businesses. Perix is <strong>not</strong> a party to any transactions, agreements or payments between users or between users and businesses. All arrangements happen directly between the parties. Perix does not guarantee the quality, safety or legality of any item, service, booking or content and is not liable for them.</p>
<h2>4. User Content</h2><p>You retain ownership of your content. By posting you grant us a worldwide, non-exclusive license to host, display, distribute and adapt your content within the platform. You are responsible for your content and must comply with applicable law.</p>
<h2>5. Acceptable Use</h2><p>You agree not to post harmful, abusive or illegal content, impersonate others, interfere with the service, spam or violate any law.</p>
<h2>6. Content Moderation</h2><p>We may, at our sole discretion, remove, hide or restrict content, suspend or terminate accounts, and process user reports. Automated actions are reviewed by a human. Our moderation rules are published at <a href="/api/reports/policy">/api/reports/policy</a>.</p>
<h2>7. Intellectual Property</h2><p>Perix and its original content, features and functionality are owned by Perix and protected by applicable intellectual-property law.</p>
<h2>8. Termination</h2><p>You may stop using the service and delete your account at any time. We may also suspend or terminate accounts for conduct that violates these Terms or harms others.</p>
<h2>9. Disclaimers</h2><p>Perix is provided "as is". We make no warranties regarding availability, accuracy or third-party content. Your use is at your sole risk.</p>
<h2>10. Limitation of Liability</h2><p>To the maximum extent permitted by law, Perix is not liable for indirect, incidental, special, consequential or punitive damages, nor for the acts or content of other users or businesses. Perix&rsquo;s total liability is limited to the greater of &euro;100 or the amounts you paid us in the 12 months before the claim. Nothing limits liability that cannot be limited by law.</p>
<h2>11. Indemnification</h2><p>You agree to indemnify Perix from claims, damages, losses and costs (including reasonable legal fees) arising from your use of the service, your content or your violation of these Terms.</p>
<h2>12. Governing Law</h2><p>These Terms are governed by the laws of Germany. Disputes shall be resolved in the courts of Magdeburg, Germany.</p>
<h2>13. EU Consumers</h2><p>EU consumers benefit from the mandatory consumer-protection provisions of their country of residence. For online disputes you may use the EU ODR platform at ec.europa.eu/consumers/odr. The Digital Services Act (EU 2022/2065) contact is <a href="mailto:support@perix.app">support@perix.app</a>.</p>
<h2>14. Changes</h2><p>We may modify these Terms. Material changes are announced on this page; continued use constitutes acceptance.</p>
<h2>15. Contact</h2><p>Questions? <a href="mailto:support@perix.app">support@perix.app</a></p>
""",
    },
    "de": {
        "title": "Nutzungsbedingungen",
        "updated": "Zuletzt aktualisiert: September 2026",
        "body": """
<h2>1. Annahme</h2><p>Mit der Nutzung von Perix stimmst du diesen Bedingungen zu. Andernfalls darfst du den Dienst nicht nutzen.</p>
<h2>2. Mindestalter</h2><p>Du musst mindestens <strong>16 Jahre alt</strong> sein.</p>
<h2>3. Unsere Rolle – Nur Plattform</h2><p>Perix ist eine neutrale Plattform, die Nutzer und Unternehmen verbindet. Perix ist <strong>keine</strong> Partei von Transaktionen, Vereinbarungen oder Zahlungen zwischen Nutzern oder zwischen Nutzern und Unternehmen. Alle Absprachen erfolgen direkt zwischen den Parteien. Perix garantiert nicht die Qualität, Sicherheit oder Rechtmäßigkeit von Artikeln, Dienstleistungen, Buchungen oder Inhalten und haftet nicht dafür.</p>
<h2>4. Nutzerinhalte</h2><p>Du behältst das Eigentum an deinen Inhalten. Durch das Posten gewährst du uns eine weltweite, nicht-exklusive Lizenz zum Hosten, Anzeigen, Verbreiten und Anpassen deiner Inhalte innerhalb der Plattform. Du bist für deine Inhalte verantwortlich.</p>
<h2>5. Zulässige Nutzung</h2><p>Keine schädlichen, missbräuchlichen oder illegalen Inhalte, keine Identitätsfälschung, keine Störung des Dienstes, kein Spam, kein Rechtsverstoß.</p>
<h2>6. Moderation</h2><p>Wir können nach eigenem Ermessen Inhalte entfernen, ausblenden oder einschränken, Konten sperren oder kündigen und Meldungen bearbeiten. Automatische Maßnahmen werden von einem Menschen geprüft. Unsere Moderationsregeln: <a href="/api/reports/policy">/api/reports/policy</a>.</p>
<h2>7. Geistiges Eigentum</h2><p>Perix und seine ursprünglichen Inhalte und Funktionen sind Eigentum von Perix und gesetzlich geschützt.</p>
<h2>8. Kündigung</h2><p>Du kannst den Dienst jederzeit verlassen und dein Konto löschen. Wir können Konten bei Verstößen gegen diese Bedingungen sperren oder kündigen.</p>
<h2>9. Haftungsausschluss</h2><p>Perix wird „wie besehen" bereitgestellt. Wir geben keine Garantien hinsichtlich Verfügbarkeit, Richtigkeit oder Inhalten Dritter. Die Nutzung erfolgt auf eigenes Risiko.</p>
<h2>10. Haftungsbeschränkung</h2><p>Soweit gesetzlich zulässig haftet Perix nicht für indirekte, beiläufige, besondere, Folge- oder Strafschäden und nicht für Handlungen oder Inhalte anderer Nutzer oder Unternehmen. Die Gesamthaftung ist auf den höheren Betrag von 100&nbsp;&euro; oder die in den letzten 12 Monaten an uns gezahlten Beträge begrenzt. Unbeschränkbare Haftung bleibt unberührt.</p>
<h2>11. Freistellung</h2><p>Du stellst Perix von Ansprüchen, Schäden, Verlusten und Kosten (einschließlich angemessener Anwaltskosten) frei, die aus deiner Nutzung, deinen Inhalten oder deinen Verstößen entstehen.</p>
<h2>12. Anwendbares Recht</h2><p>Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist Magdeburg, Deutschland.</p>
<h2>13. EU-Verbraucher</h2><p>EU-Verbraucher genießen die zwingenden Verbraucherschutzvorschriften ihres Wohnsitzlandes. Für Online-Streitigkeiten steht die EU-OS-Plattform (ec.europa.eu/consumers/odr) zur Verfügung. Kontakt nach dem Digital Services Act (EU 2022/2065): <a href="mailto:support@perix.app">support@perix.app</a>.</p>
<h2>14. Änderungen</h2><p>Wir können diese Bedingungen ändern. Wesentliche Änderungen werden auf dieser Seite bekannt gegeben; die weitere Nutzung gilt als Annahme.</p>
<h2>15. Kontakt</h2><p>Fragen? <a href="mailto:support@perix.app">support@perix.app</a></p>
""",
    },
    "el": {
        "title": "Όροι Χρήσης",
        "updated": "Τελευταία ενημέρωση: Σεπτέμβριος 2026",
        "body": """
<h2>1. Αποδοχή</h2><p>Χρησιμοποιώντας το Perix αποδέχεσαι αυτούς τους Όρους. Διαφορετικά δεν μπορείς να χρησιμοποιήσεις την υπηρεσία.</p>
<h2>2. Ηλικία</h2><p>Πρέπει να είσαι τουλάχιστον <strong>16 ετών</strong>.</p>
<h2>3. Ο Ρόλος μας — Μόνο Πλατφόρμα</h2><p>Το Perix είναι ουδέτερη πλατφόρμα που συνδέει χρήστες και επιχειρήσεις. Το Perix <strong>δεν</strong> είναι μέρος σε καμία συναλλαγή, συμφωνία ή πληρωμή μεταξύ χρηστών ή μεταξύ χρηστών και επιχειρήσεων. Όλα γίνονται απευθείας μεταξύ των μερών. Το Perix δεν εγγυάται την ποιότητα, ασφάλεια ή νομιμότητα αντικειμένων, υπηρεσιών, κρατήσεων ή περιεχομένου και δεν ευθύνεται γι' αυτά.</p>
<h2>4. Περιεχόμενο Χρήστη</h2><p>Διατηρείς την κυριότητα του περιεχομένου σου. Με τη δημοσίευση μας χορηγείς παγκόσμια, μη αποκλειστική άδεια φιλοξενίας, προβολής, διανομής και προσαρμογής εντός της πλατφόρμας. Ευθύνεσαι για το περιεχόμενό σου.</p>
<h2>5. Επιτρεπτή Χρήση</h2><p>Όχι επιβλαβές ή παράνομο περιεχόμενο, όχι πλαστοπροσωπία, όχι παρεμβολή στην υπηρεσία, όχι spam, όχι παραβίαση νόμων.</p>
<h2>6. Διαχείριση Περιεχομένου</h2><p>Μπορούμε κατά την κρίση μας να αφαιρέσουμε, αποκρύψουμε ή περιορίσουμε περιεχόμενο, να αναστείλουμε ή να τερματίσουμε λογαριασμούς και να επεξεργαστούμε αναφορές. Αυτόματες ενέργειες ελέγχονται από άνθρωπο. Κανόνες: <a href="/api/reports/policy">/api/reports/policy</a>.</p>
<h2>7. Πνευματική Ιδιοκτησία</h2><p>Το Perix και το πρωτότυπο περιεχόμενό του προστατεύονται από τη νομοθεσία περί πνευματικής ιδιοκτησίας.</p>
<h2>8. Τερματισμός</h2><p>Μπορείς να διαγράψεις τον λογαριασμό σου ανά πάσα στιγμή. Μπορούμε επίσης να αναστείλουμε ή να τερματίσουμε λογαριασμούς για παραβιάσεις.</p>
<h2>9. Αποποίηση Εγγυήσεων</h2><p>Το Perix παρέχεται «ως έχει». Δεν δίνουμε εγγυήσεις για διαθεσιμότητα, ακρίβεια ή περιεχόμενο τρίτων. Η χρήση γίνεται με δική σου ευθύνη.</p>
<h2>10. Περιορισμός Ευθύνης</h2><p>Στο μέγιστο επιτρεπόμενο από τον νόμο, το Perix δεν ευθύνεται για έμμεσες, συμπτωματικές, ειδικές ή ποινικές ζημίες, ούτε για πράξεις ή περιεχόμενο άλλων χρηστών ή επιχειρήσεων. Η συνολική ευθύνη περιορίζεται στο υψηλότερο μεταξύ 100&nbsp;€ ή των ποσών που μας πλήρωσες τους τελευταίους 12 μήνες. Η εκ του νόμου απεριόριστη ευθύνη δεν επηρεάζεται.</p>
<h2>11. Αποζημίωση</h2><p>Συμφωνείς να αποζημιώσεις το Perix για αξιώσεις, ζημίες, απώλειες και κόστη (συμπ. εύλογων νομικών εξόδων) από τη χρήση, το περιεχόμενό σου ή παραβιάσεις.</p>
<h2>12. Εφαρμοστέο Δίκαιο</h2><p>Ισχύει το δίκαιο της Γερμανίας. Δικαιοδοσία: Μαγδεμβούργο, Γερμανία.</p>
<h2>13. Καταναλωτές ΕΕ</h2><p>Οι καταναλωτές της ΕΕ απολαμβάνουν τις υποχρεωτικές διατάξεις προστασίας της χώρας κατοικίας τους. Για ηλεκτρονικές διαφορές: πλατφόρμα ΗΔ της ΕΕ (ec.europa.eu/consumers/odr). Σημείο επαφής DSA (EU 2022/2065): <a href="mailto:support@perix.app">support@perix.app</a>.</p>
<h2>14. Αλλαγές</h2><p>Ενδέχεται να τροποποιήσουμε αυτούς τους Όρους. Οι σημαντικές αλλαγές ανακοινώνονται εδώ· η συνέχιση χρήσης ισοδυναμεί με αποδοχή.</p>
<h2>15. Επικοινωνία</h2><p>Ερωτήσεις; <a href="mailto:support@perix.app">support@perix.app</a></p>
""",
    },
}

_IMPRESSUM = {
    "en": {
        "title": "Impressum / Legal Notice",
        "body": """
<p><strong>Perix</strong> (app.perixapp.com)</p>
<p>Operated by the Perix Team.</p>
<p>Contact: <a href="mailto:support@perix.app">support@perix.app</a></p>
<p>Data protection: <a href="mailto:privacy@perix.app">privacy@perix.app</a></p>
<p>Perix is a platform connecting users and businesses. Perix is not a party to transactions between users or businesses.</p>
""",
    },
    "de": {
        "title": "Impressum",
        "body": """
<p><strong>Perix</strong> (app.perixapp.com)</p>
<p>Betrieben vom Perix-Team.</p>
<p>Kontakt: <a href="mailto:support@perix.app">support@perix.app</a></p>
<p>Datenschutz: <a href="mailto:privacy@perix.app">privacy@perix.app</a></p>
<p>Perix ist eine Plattform, die Nutzer und Unternehmen verbindet. Perix ist keine Partei von Transaktionen zwischen Nutzern oder Unternehmen.</p>
""",
    },
    "el": {
        "title": "Impressum / Νόμιμη Σημείωση",
        "body": """
<p><strong>Perix</strong> (app.perixapp.com)</p>
<p>Λειτουργεί η ομάδα Perix.</p>
<p>Επικοινωνία: <a href="mailto:support@perix.app">support@perix.app</a></p>
<p>Προστασία δεδομένων: <a href="mailto:privacy@perix.app">privacy@perix.app</a></p>
<p>Το Perix είναι πλατφόρμα που συνδέει χρήστες και επιχειρήσεις. Δεν είναι μέρος σε συναλλαγές μεταξύ χρηστών ή επιχειρήσεων.</p>
""",
    },
}


def _page_html(title: str, updated: str, body: str, back_links: bool = True) -> str:
    nav = ""
    if back_links:
        nav = (
            '<nav style="margin-bottom:18px;font-size:14px">'
            '<a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; '
            '<a href="/impressum">Impressum</a> &middot; <a href="/account-deletion">Delete account</a>'
            "</nav>"
        )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="index"/>
<title>{title} — Perix</title>
<style>
  body {{ font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
         background:#f7fafc; color:#264348; margin:0; padding:24px 16px 64px; }}
  .card {{ max-width:760px; margin:0 auto; background:#fff; border-radius:16px;
          padding:32px; box-shadow:0 4px 16px rgba(0,0,0,0.06); }}
  h1 {{ font-size:24px; margin:0 0 4px; }}
  h2 {{ font-size:17px; margin:24px 0 8px; }}
  p, li {{ line-height:1.6; color:#4a5a60; font-size:15px; }}
  a {{ color:#096BFF; }}
  .muted {{ color:#8a9aa3; font-size:13px; margin:6px 0 20px; }}
  nav a {{ margin-right:12px; }}
</style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p class="muted">{updated}</p>
    {nav}
    {body}
  </div>
</body>
</html>"""


def privacy_page_html(lang: str = "en") -> str:
    p = _PRIVACY.get(lang, _PRIVACY["en"])
    return _page_html(p["title"], p["updated"], p["body"])


def terms_page_html(lang: str = "en") -> str:
    t = _TERMS.get(lang, _TERMS["en"])
    return _page_html(t["title"], t["updated"], t["body"])


def impressum_page_html(lang: str = "en") -> str:
    i = _IMPRESSUM.get(lang, _IMPRESSUM["en"])
    return _page_html(i["title"], "", i["body"])
