"""Automatic text moderation for user-generated content.

Checks text against a curated list of bad words (EN/DE/EL) and porn-related
terms. When flagged, content is hidden globally and a report is created so an
admin can review/restore it.
"""
import re

from database import db
from utils.helpers import now_utc

# Curated multi-language bad words / offensive terms. Keep lowercase.
BAD_WORDS = [
    # English
    "fuck", "fucking", "shit", "bitch", "cunt", "nigger", "nigga", "faggot",
    "whore", "slut", "asshole", "dickhead", "motherfucker", "retard",
    # German
    "hurensohn", "fotze", "wichser", "arschloch", "scheisse", "scheiße",
    "hure", "schlampe", "nutte", "verpiss", "drecksau",
    # Greek
    "μαλάκας", "μαλακισμένο", "γαμώ", "γαμώτο", "πούστη", "πουτάνα",
    "αρχίδι", "σκατά",
    # Porn/sexual spam indicators (also in titles)
    "porn", "porno", "xxx", "sex", "sexy", "nude", "nudes", "naked",
    "escort", "onlyfans", "camgirl", "hot singles", "adult content",
    "sexytime", "milf", "anal", "pussy", "boobs", "tits", "cock", "dick",
]

COMPILED = [re.compile(r"\b" + re.escape(w) + r"\b", re.IGNORECASE) for w in BAD_WORDS]


def moderate_text(text: str | None) -> list[str]:
    """Return the list of matched bad-word categories (words) in the text."""
    if not text:
        return []
    found: list[str] = []
    lowered = text.lower()
    for word, pattern in zip(BAD_WORDS, COMPILED):
        if pattern.search(lowered):
            found.append(word)
    return found


def contains_violation(text: str | None) -> bool:
    return bool(moderate_text(text))


async def auto_moderate(
    collection: str,
    id_field: str,
    doc_id: str,
    target_type: str,
    texts: list,
) -> bool:
    """Hide content + create an auto report when any text matches bad words."""
    matches: list[str] = []
    for t in texts:
        matches.extend(moderate_text(t))
    if not matches:
        return False
    await db[collection].update_one(
        {id_field: doc_id},
        {"$set": {"is_hidden": True, "hidden_reason": "auto_moderation", "hidden_at": now_utc()}},
    )
    try:
        from routes.reports import create_auto_report
        await create_auto_report("system", target_type, doc_id, "Auto-flagged: " + ", ".join(sorted(set(matches))))
    except Exception:
        pass
    return True
