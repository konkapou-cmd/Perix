"""Job applications & job posting policy (v19), feature-flagged.

Every enforcement switch is OFF by default: nothing changes in production
until the flags are enabled after the 1-1 tests.
- JOB_APPLICATIONS_ENFORCEMENT=1 -> personal job applications:
    Free 3/month, Premium unlimited
- JOB_POSTS_ENFORCEMENT=1        -> Business job positions: 10/year
"""
import os
from typing import Optional

JOB_APPLICATIONS_ENFORCEMENT = os.environ.get("JOB_APPLICATIONS_ENFORCEMENT", "0") == "1"
JOB_POSTS_ENFORCEMENT = os.environ.get("JOB_POSTS_ENFORCEMENT", "0") == "1"

FREE_JOB_APPLICATIONS_PER_MONTH = 3
PREMIUM_JOB_APPLICATIONS = None  # unlimited
BUSINESS_JOB_POSTS_PER_YEAR = 10

POLICY_VERSION = "v19"


def personal_job_application_limit(user_doc: Optional[dict]) -> Optional[int]:
    """Monthly job-application limit for personal actors; None = unlimited (Premium)."""
    plan = (user_doc or {}).get("account_plan")
    if plan == "premium_user":
        return PREMIUM_JOB_APPLICATIONS
    return FREE_JOB_APPLICATIONS_PER_MONTH


def business_job_posts_per_year() -> int:
    return BUSINESS_JOB_POSTS_PER_YEAR
