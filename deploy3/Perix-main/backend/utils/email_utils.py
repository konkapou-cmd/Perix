"""Email sending via Resend API or generic SMTP.

Set RESEND_API_KEY (preferred) or SMTP_* env vars in the backend service.
If no provider is configured, send_email() returns False. Callers must never
expose verification or password reset tokens in public API responses.
"""
import asyncio
import logging
import os
import ssl
from email.utils import parseaddr

import httpx

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "Perix <no-reply@perixapp.com>")
APP_WEB_URL = os.getenv("APP_WEB_URL", "https://app.perix.eu").rstrip("/")

_BRAND_PRIMARY = "#096BFF"
_BRAND_SOFT = "#59ABE3"


def email_configured() -> bool:
    return bool(RESEND_API_KEY) or bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


async def send_email(to: str, subject: str, html: str) -> bool:
    """Return True when the provider accepts the message, not proof of delivery."""
    if RESEND_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": EMAIL_FROM,
                        "to": [to],
                        "subject": subject,
                        "html": html,
                    },
                )
                if resp.status_code in (200, 201):
                    return True
                logger.warning(f"Resend send failed: {resp.status_code} {resp.text[:300]}")
                return False
        except Exception as e:
            logger.warning(f"Resend send error: {e}")
            return False

    if SMTP_HOST and SMTP_USER and SMTP_PASS:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = EMAIL_FROM
            msg["To"] = to
            msg.attach(MIMEText(html, "html"))

            def _send() -> None:
                tls_context = ssl.create_default_context()
                if SMTP_PORT == 465:
                    server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=tls_context)
                else:
                    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
                with server:
                    if SMTP_PORT != 465:
                        server.starttls(context=tls_context)
                    server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(parseaddr(EMAIL_FROM)[1], [to], msg.as_string())

            await asyncio.to_thread(_send)
            return True
        except Exception as e:
            logger.warning(f"SMTP send error: {e}")
            return False

    return False


def _email_shell(title: str, kicker: str, body_html: str) -> str:
    """Shared warm, readable mail layout with Perix brand colors."""
    return (
        "<div style='margin:0;padding:28px 12px;background-color:#F3F8FE;"
        "font-family:\"Segoe UI\",Helvetica,Arial,sans-serif;color:#263238;'>"
        "<div style='max-width:520px;margin:0 auto;background-color:#FFFFFF;"
        "border-radius:16px;overflow:hidden;border:1px solid #E3EEF9;'>"
        "<div style='background:linear-gradient(135deg,#096BFF 0%,#59ABE3 100%);"
        "padding:26px 32px;'>"
        "<div style='font-size:22px;font-weight:700;color:#FFFFFF;'>Perix &#9728;</div>"
        f"<div style='font-size:13px;color:#E8F3FF;margin-top:4px;'>{kicker}</div>"
        "</div>"
        "<div style='padding:30px 32px;'>"
        f"<div style='font-size:18px;font-weight:600;color:{_BRAND_PRIMARY};'>{title}</div>"
        f"{body_html}"
        "</div>"
        "<div style='background-color:#F7FBFF;padding:16px 32px;text-align:center;'>"
        f"<span style='font-size:12px;color:{_BRAND_SOFT};font-weight:600;'>Perix</span>"
        "<span style='font-size:12px;color:#93A3B8;'> &#183; Explore your city, your way</span>"
        "</div>"
        "</div>"
        "</div>"
    )


def _action_button(link: str, label: str) -> str:
    return (
        f"<p style='margin:26px 0;text-align:center;'>"
        f"<a href='{link}' style='display:inline-block;background-color:{_BRAND_PRIMARY};"
        f"color:#FFFFFF;font-size:15px;font-weight:600;padding:13px 30px;"
        f"border-radius:26px;text-decoration:none;'>{label}</a>"
        f"</p>"
        f"<p style='font-size:13px;color:#6B7A90;line-height:1.6;'>"
        f"If the button doesn't work, copy and paste this link into your browser:<br/>{link}</p>"
    )


async def send_verification_email(email: str, token: str) -> bool:
    link = f"{APP_WEB_URL}/verify-email?token={token}"
    body = (
        "<p style='font-size:14px;line-height:1.7;color:#44566C;margin:14px 0 0;'>"
        "Hi! Thanks for joining Perix. To activate your account and keep "
        "password recovery available, please confirm your email address.</p>"
        + _action_button(link, "Verify my email")
        + "<p style='font-size:12px;color:#93A3B8;line-height:1.6;margin:22px 0 0;"
        "padding-top:16px;border-top:1px solid #EDF3FA;'>"
        "This confirmation link is single-use and may expire &mdash; if it stops "
        "working, simply request a new one from the app. Didn't create a Perix "
        "account? You can safely ignore this email.</p>"
    )
    html = _email_shell("Confirm your email address", "A warm welcome from your local city guide", body)
    return await send_email(email, "Verify your Perix email", html)


async def send_password_reset_email(email: str, token: str) -> bool:
    link = f"{APP_WEB_URL}/reset-password?token={token}"
    body = (
        "<p style='font-size:14px;line-height:1.7;color:#44566C;margin:14px 0 0;'>"
        "We received a request to reset the password for your Perix account. "
        "Click the button below to choose a new password.</p>"
        + _action_button(link, "Reset my password")
        + "<p style='font-size:12px;color:#93A3B8;line-height:1.6;margin:22px 0 0;"
        "padding-top:16px;border-top:1px solid #EDF3FA;'>"
        "This link expires in 1 hour and can be used only once. If you didn't "
        "request a password reset, you can safely ignore this email &mdash; your "
        "password will not change.</p>"
    )
    html = _email_shell("Reset your password", "Here to help you get back in", body)
    return await send_email(email, "Reset your Perix password", html)
