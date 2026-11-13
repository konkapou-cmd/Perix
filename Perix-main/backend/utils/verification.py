"""Email verification policy (v19).

New registrations have 6 hours to confirm their email. Until then no
content can be added on perix.eu: every creation endpoint must call
`require_verified_email` first.
"""
from datetime import timedelta

from fastapi import HTTPException

from utils.helpers import now_utc

EMAIL_VERIFY_WINDOW_HOURS = 6

POLICY_VERSION = "v19"


def verify_deadline():
    return now_utc() + timedelta(hours=EMAIL_VERIFY_WINDOW_HOURS)


def require_verified_email(current_user) -> None:
    """Block content creation for accounts without a verified email."""
    if not getattr(current_user, "email_verified", False):
        raise HTTPException(
            status_code=403,
            detail="Email verification required: confirm your email before adding content.",
        )
