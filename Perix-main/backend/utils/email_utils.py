"""Email sending via Resend API or generic SMTP.

Set RESEND_API_KEY (preferred) or SMTP_* env vars in the backend service.
If no provider is configured, send_email() returns False and callers should
fall back gracefully (e.g. return the token for development).
"""
import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "Perix <no-reply@perixapp.com>")
APP_WEB_URL = os.getenv("APP_WEB_URL", "https://app.perixapp.com")


def email_configured() -> bool:
    return bool(RESEND_API_KEY) or bool(SMTP_HOST)


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email. Returns True when delivered, False otherwise."""
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

    if SMTP_HOST:
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
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                    server.starttls()
                    if SMTP_USER:
                        server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(EMAIL_FROM, [to], msg.as_string())

            await asyncio.to_thread(_send)
            return True
        except Exception as e:
            logger.warning(f"SMTP send error: {e}")
            return False

    return False


async def send_verification_email(email: str, token: str) -> bool:
    link = f"{APP_WEB_URL}/verify-email?token={token}"
    html = (
        "<div style='font-family:sans-serif;max-width:480px;margin:auto'>"
        "<h2 style='color:#096BFF'>Perıx &#9728;</h2>"
        "<p>Welcome to Perix! Please confirm your email address to activate your account and enable password recovery.</p>"
        f"<p><a href='{link}' style='background:#59ABE3;color:#fff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:600'>Verify my email</a></p>"
        f"<p style='color:#666;font-size:13px'>If the button doesn't work, open this link:<br/>{link}</p>"
        "</div>"
    )
    return await send_email(email, "Verify your Perix email", html)


async def send_password_reset_email(email: str, token: str) -> bool:
    link = f"{APP_WEB_URL}/reset-password?token={token}"
    html = (
        "<div style='font-family:sans-serif;max-width:480px;margin:auto'>"
        "<h2 style='color:#096BFF'>Perıx &#9728;</h2>"
        "<p>You requested a password reset. Click below to choose a new password. This link expires in 1 hour.</p>"
        f"<p><a href='{link}' style='background:#59ABE3;color:#fff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:600'>Reset my password</a></p>"
        f"<p style='color:#666;font-size:13px'>If the button doesn't work, open this link:<br/>{link}</p>"
        "<p style='color:#999;font-size:12px'>If you didn't request this, you can safely ignore this email.</p>"
        "</div>"
    )
    return await send_email(email, "Reset your Perix password", html)
