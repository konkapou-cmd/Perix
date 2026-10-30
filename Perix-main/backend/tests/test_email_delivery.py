"""Isolated delivery regressions using the real email utility module."""
import smtplib
import ssl
from email import message_from_string
from unittest.mock import AsyncMock, MagicMock

import pytest

from utils import email_utils


@pytest.fixture(autouse=True)
def delivery(monkeypatch):
    for name, value in {
        "RESEND_API_KEY": "",
        "SMTP_HOST": "smtp.example.com",
        "SMTP_PORT": 587,
        "SMTP_USER": "smtp-user",
        "SMTP_PASS": "test-password",
        "EMAIL_FROM": "Perix Support <support@example.com>",
    }.items():
        monkeypatch.setattr(email_utils, name, value)
    smtp = MagicMock()
    smtp_ssl = MagicMock()
    http = MagicMock(side_effect=AssertionError("Unexpected HTTP transport"))
    monkeypatch.setattr(smtplib, "SMTP", smtp)
    monkeypatch.setattr(smtplib, "SMTP_SSL", smtp_ssl)
    monkeypatch.setattr(email_utils.httpx, "AsyncClient", http)
    return smtp, smtp_ssl, http


@pytest.mark.parametrize("port", [465, 587])
async def test_smtp_uses_verified_tls_and_parsed_envelope_sender(monkeypatch, delivery, port):
    smtp, smtp_ssl, http = delivery
    monkeypatch.setattr(email_utils, "SMTP_PORT", port)

    assert email_utils.email_configured() is True
    assert await email_utils.send_email("reader@example.com", "Test subject", "<p>Hello</p>") is True

    transport = smtp_ssl if port == 465 else smtp
    server = transport.return_value
    if port == 465:
        smtp.assert_not_called()
        server.starttls.assert_not_called()
        context = transport.call_args.kwargs["context"]
        transport.assert_called_once_with("smtp.example.com", 465, timeout=20, context=context)
    else:
        smtp_ssl.assert_not_called()
        smtp.assert_called_once_with("smtp.example.com", 587, timeout=20)
        context = server.starttls.call_args.kwargs["context"]
        server.starttls.assert_called_once_with(context=context)
        assert [call[0] for call in server.method_calls] == ["starttls", "login", "sendmail"]
    assert isinstance(context, ssl.SSLContext)
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED
    server.login.assert_called_once_with("smtp-user", "test-password")
    sender, recipients, raw_message = server.sendmail.call_args.args
    assert sender == "support@example.com"
    assert recipients == ["reader@example.com"]
    message = message_from_string(raw_message)
    assert message["From"] == "Perix Support <support@example.com>"
    assert message["Subject"] == "Test subject"
    assert message["To"] == "reader@example.com"
    assert message.get_payload(0).get_payload(decode=True) == b"<p>Hello</p>"
    http.assert_not_called()


@pytest.mark.parametrize("missing", ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"])
async def test_missing_smtp_credentials_disable_delivery(monkeypatch, delivery, missing):
    monkeypatch.setattr(email_utils, missing, "")

    assert email_utils.email_configured() is False
    assert await email_utils.send_email("reader@example.com", "Subject", "Body") is False
    for transport in delivery:
        transport.assert_not_called()


@pytest.mark.parametrize("port", [465, 587])
@pytest.mark.parametrize("failure", ["connect", "login", "sendmail"])
async def test_smtp_exceptions_return_false(monkeypatch, delivery, port, failure):
    monkeypatch.setattr(email_utils, "SMTP_PORT", port)
    transport = delivery[1] if port == 465 else delivery[0]
    if failure == "connect":
        transport.side_effect = OSError("Transport unavailable")
    else:
        getattr(transport.return_value, failure).side_effect = OSError("Delivery failed")

    assert await email_utils.send_email("reader@example.com", "Subject", "Body") is False
    delivery[2].assert_not_called()


@pytest.mark.parametrize("status, expected", [(200, True), (201, True), (400, False), (500, False)])
async def test_resend_takes_precedence_over_smtp(monkeypatch, delivery, status, expected):
    smtp, smtp_ssl, http = delivery
    monkeypatch.setattr(email_utils, "RESEND_API_KEY", "test-resend-key")
    http.side_effect = None
    client = http.return_value.__aenter__.return_value
    client.post = AsyncMock(return_value=MagicMock(status_code=status, text="Provider response"))

    assert email_utils.email_configured() is True
    assert await email_utils.send_email("reader@example.com", "Subject", "<p>Body</p>") is expected
    http.assert_called_once_with(timeout=20)
    client.post.assert_awaited_once_with(
        "https://api.resend.com/emails",
        headers={"Authorization": "Bearer test-resend-key", "Content-Type": "application/json"},
        json={
            "from": "Perix Support <support@example.com>",
            "to": ["reader@example.com"],
            "subject": "Subject",
            "html": "<p>Body</p>",
        },
    )
    smtp.assert_not_called()
    smtp_ssl.assert_not_called()


async def test_resend_exception_returns_false_without_smtp_fallback(monkeypatch, delivery):
    smtp, smtp_ssl, http = delivery
    monkeypatch.setattr(email_utils, "RESEND_API_KEY", "test-resend-key")
    http.side_effect = None
    client = http.return_value.__aenter__.return_value
    client.post = AsyncMock(side_effect=OSError("Provider unavailable"))

    assert await email_utils.send_email("reader@example.com", "Subject", "Body") is False
    client.post.assert_awaited_once()
    smtp.assert_not_called()
    smtp_ssl.assert_not_called()


@pytest.mark.parametrize(
    "function, path, subject",
    [
        (email_utils.send_verification_email, "verify-email", "Verify your Perix email"),
        (email_utils.send_password_reset_email, "reset-password", "Reset your Perix password"),
    ],
)
@pytest.mark.parametrize("sent", [True, False])
async def test_email_links_use_app_web_url(monkeypatch, function, path, subject, sent):
    monkeypatch.setattr(email_utils, "APP_WEB_URL", "https://perix.eu")
    send = AsyncMock(return_value=sent)
    monkeypatch.setattr(email_utils, "send_email", send)

    assert await function("reader@example.com", "test-link-token") is sent
    send.assert_awaited_once()
    recipient, actual_subject, html = send.await_args.args
    assert recipient == "reader@example.com"
    assert actual_subject == subject
    link = f"https://perix.eu/{path}?token=test-link-token"
    assert f"href='{link}'" in html
    assert f"<br/>{link}" in html
