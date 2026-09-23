"""User/content reporting routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import db
from models.user import UserPublic
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])

TARGET_COLLECTIONS = {
    "post": ("posts", "post_id"),
    "comment": (None, None),  # comments live inside posts
    "event": ("events", "event_id"),
    "activity": ("activities", "activity_id"),
    "job": ("jobs", "job_id"),
    "service": ("services", "service_id"),
    "listing": ("listings", "listing_id"),
    "story": ("stories", "story_id"),
    "business": ("businesses", "business_id"),
    "artist": ("artists", "artist_id"),
    "user": ("users", "user_id"),
}

AUTO_HIDE_THRESHOLD = 2  # distinct reporters before auto-hiding content

MODERATION_POLICY_VERSION = "1.0"

MODERATION_POLICY = {
    "en": (
        "Reporting: any user may report content (posts, comments, events, activities, jobs, "
        "services, listings, stories, businesses, artists, users). Every report is stored securely "
        "with the reporting user's ID, the reason and a timestamp, and is kept even after the "
        "content or the account is removed. Decision: reported content remains available for human "
        "review until an administrator resolves the report. The administrator may at any time "
        "choose: Dismiss (no action), Hide (temporarily hidden - fully reversible), Restore (make "
        "visible again) or Purge (permanent deletion). Deleting an account removes its personal "
        "data and all its listings. Blocking: an administrator may block or unblock a user's email "
        "at any time. A blocked email cannot log in. This does not delete the account or the "
        "reports - they remain stored for review. Deleted accounts: the original email and name "
        "are archived so an account can be restored; a restored account must set a new password. "
        "Residual references are purged automatically (content 30 days, account record 365 days). "
        "Legal basis: these measures serve the legitimate interests of operating a safe service "
        "and protecting users (GDPR Art. 6(1)(f)), and data erasure follows GDPR Art. 17. "
        "Decisions are made in good faith, consistent with our Terms of Service."
    ),
    "de": (
        "Melden: Jede:r Nutzer:in kann Inhalte melden (Beiträge, Kommentare, Events, "
        "Aktivitäten, Jobs, Services, Anzeigen, Stories, Unternehmen, Künstler, Nutzer). Jede "
        "Meldung wird sicher gespeichert – mit der ID des Meldenden, dem Grund und einem "
        "Zeitstempel – und bleibt auch nach Entfernung des Inhalts oder des Kontos erhalten. "
        "Entscheidung: Gemeldete Inhalte bleiben bis zur Klärung für die menschliche Prüfung "
        "verfügbar. Die Administration kann jederzeit wählen: Verwerfen (keine Maßnahme), "
        "Ausblenden (vorübergehend – vollständig umkehrbar), Wiederherstellen (wieder sichtbar) "
        "oder Endgültig löschen (dauerhaft). Die Löschung eines Kontos entfernt dessen "
        "persönliche Daten und alle Anzeigen. Sperren: Die Administration kann eine "
        "E-Mail-Adresse jederzeit sperren oder entsperren. Eine gesperrte E-Mail kann sich nicht "
        "anmelden. Das Konto und die Meldungen werden dadurch nicht gelöscht – sie bleiben zur "
        "Prüfung gespeichert. Gelöschte Konten: Ursprüngliche E-Mail und Name werden archiviert, "
        "sodass ein Konto wiederhergestellt werden kann; ein wiederhergestelltes Konto muss ein "
        "neues Passwort setzen. Verbleibende Verweise werden automatisch bereinigt (Inhalte nach "
        "30 Tagen, Kontodatensatz nach 365 Tagen). Rechtsgrundlage: Diese Maßnahmen dienen den "
        "berechtigten Interessen eines sicheren Dienstbetriebs und des Nutzerschutzes (DSGVO "
        "Art. 6 Abs. 1 lit. f); die Löschung folgt DSGVO Art. 17. Entscheidungen erfolgen nach "
        "Treu und Glauben, im Einklang mit unseren Nutzungsbedingungen."
    ),
    "el": (
        "Αναφορές: κάθε χρήστης μπορεί να αναφέρει περιεχόμενο (δημοσιεύσεις, σχόλια, "
        "εκδηλώσεις, δραστηριότητες, θέσεις εργασίας, υπηρεσίες, αγγελίες, stories, "
        "επιχειρήσεις, καλλιτέχνες, χρήστες). Κάθε αναφορά αποθηκεύεται με ασφάλεια — με το ID "
        "του χρήστη που αναφέρει, τον λόγο και χρονική σήμανση — και παραμένει ακόμα κι αν "
        "αφαιρεθεί το περιεχόμενο ή ο λογαριασμός. Απόφαση: το αναφερόμενο περιεχόμενο "
        "παραμένει διαθέσιμο για ανθρώπινο έλεγχο μέχρι να επιλυθεί η αναφορά. Ο διαχειριστής "
        "μπορεί ανά πάσα στιγμή να επιλέξει: Απόρριψη (καμία ενέργεια), Απόκρυψη (προσωρινή — "
        "πλήρως αναστρέψιμη), Επαναφορά (ξανά ορατό) ή Οριστική διαγραφή (μόνιμη). Η διαγραφή "
        "λογαριασμού αφαιρεί τα προσωπικά δεδομένα και όλες τις αγγελίες του. Αποκλεισμός: ο "
        "διαχειριστής μπορεί να αποκλείσει ή να άρει τον αποκλεισμό ενός email ανά πάσα στιγμή. "
        "Ένα αποκλεισμένο email δεν μπορεί να συνδεθεί. Αυτό δεν διαγράφει τον λογαριασμό ούτε "
        "τις αναφορές — παραμένουν αποθηκευμένα για έλεγχο. Διαγραμμένοι λογαριασμοί: το "
        "αρχικό email και το όνομα αρχειοθετούνται ώστε να είναι δυνατή η επαναφορά· ένας "
        "επαναφερόμενος λογαριασμός πρέπει να ορίσει νέο κωδικό. Υπολειπόμενες αναφορές "
        "διαγράφονται αυτόματα (περιεχόμενο 30 ημέρες, εγγραφή λογαριασμού 365 ημέρες). Νομική "
        "βάση: τα μέτρα αυτά εξυπηρετούν τα έννομα συμφέροντα της ασφαλούς λειτουργίας της "
        "υπηρεσίας και της προστασίας των χρηστών (GDPR Άρθρο 6 παρ. 1 στ. στ') και η διαγραφή "
        "δεδομένων ακολουθεί το GDPR Άρθρο 17. Οι αποφάσεις λαμβάνονται καλόπιστα, σύμφωνα με "
        "τους Όρους Χρήσης μας."
    ),
}


@router.get("/policy")
async def moderation_policy(lang: Optional[str] = "en"):
    """Public description of the reporting, blocking and deletion rules."""
    return {
        "policy": MODERATION_POLICY.get((lang or "en").lower(), MODERATION_POLICY["en"]),
        "version": MODERATION_POLICY_VERSION,
        "effective": "23/09/2026",
        "last_updated": "23/09/2026",
    }


class ContentReportRequest(BaseModel):
    target_type: str
    target_id: str
    reason: str = "other"


@router.get("/my-status")
async def get_my_report_status(
    target_type: str,
    target_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """Whether the current user has already reported this target."""
    existing = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "target_type": target_type,
        "target_id": target_id,
    })
    return {"reported": existing is not None}


@router.post("/content")
async def report_content(
    payload: ContentReportRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """Report any piece of content. After enough distinct reports the content
    is hidden automatically pending admin review."""
    if payload.target_type not in TARGET_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Invalid target type")

    collection, id_field = TARGET_COLLECTIONS[payload.target_type]
    if collection is not None:
        doc = await db[collection].find_one({id_field: payload.target_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Content not found")

    # De-duplicate: one report per user per target
    existing = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have already reported this content")

    report_doc = {
        "report_id": generate_id("report"),
        "reporter_id": current_user.user_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "reason": payload.reason,
        "reported_at": now_utc(),
        "status": "pending",
        "source": "manual",
    }
    await db.reports.insert_one(report_doc)

    # Auto-hide after threshold of distinct reporters
    if collection is not None:
        distinct = await db.reports.distinct("reporter_id", {
            "target_type": payload.target_type,
            "target_id": payload.target_id,
        })
        if len(distinct) >= AUTO_HIDE_THRESHOLD:
            await db[collection].update_one(
                {id_field: payload.target_id},
                {"$set": {"is_hidden": True, "hidden_reason": "reported", "hidden_at": now_utc()}},
            )

    return {"report_id": report_doc["report_id"], "status": "pending"}


def create_auto_report(reporter_id: str, target_type: str, target_id: str, reason: str):
    """Helper used by the moderation pipeline (fire-and-forget)."""
    return db.reports.insert_one({
        "report_id": generate_id("report"),
        "reporter_id": reporter_id,
        "target_type": target_type,
        "target_id": target_id,
        "reason": reason,
        "reported_at": now_utc(),
        "status": "pending",
        "source": "auto_moderation",
    })
