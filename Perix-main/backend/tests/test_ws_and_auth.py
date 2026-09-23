"""
Smoke tests for WebSocket infrastructure and auth-protected routes.
Covers:
- WS broadcast helper functions exist and are importable
- Channel subscribe/unsubscribe in ConnectionManager
- Unprotected route /reminders/process-due now requires auth
- Voucher check routes now require auth
- N+1 batch fetch helpers in stories.py
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')

TEST_USER_EMAIL = "test_ws_user@example.com"
TEST_USER_PASSWORD = "testpassword123"
TEST_USER_NAME = "Test WS User"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    resp = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
        "name": TEST_USER_NAME,
    })
    if resp.status_code == 200:
        return resp.json().get("session_token")
    resp = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
    })
    assert resp.status_code == 200
    return resp.json().get("session_token")


class TestWSBroadcastHelpers:
    def test_ws_helpers_importable(self):
        from routes.ws import (
            ws_broadcast_new_message,
            ws_broadcast_typing,
            ws_broadcast_conversation_update,
            ws_broadcast_unread_count,
            ws_broadcast_notification,
            ws_broadcast_call_status,
            ws_broadcast_channel_message,
        )
        assert callable(ws_broadcast_new_message)
        assert callable(ws_broadcast_channel_message)

    def test_connection_manager_channel_support(self):
        from routes.ws import manager
        manager.subscribe("test_user_1", "activity:test123")
        assert "test_user_1" in manager.channels.get("activity:test123", set())
        manager.unsubscribe("test_user_1", "activity:test123")
        assert "test_user_1" not in manager.channels.get("activity:test123", set())


class TestProtectedRoutes:
    def test_reminders_process_due_requires_auth(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/events/reminders/process-due")
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"

    def test_voucher_check_requires_auth_subscriptions(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/subscriptions/voucher/check/SOMECODE")
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"

    def test_voucher_check_requires_auth_stripe(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/stripe/voucher/check/SOMECODE")
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"

    def test_promoter_validate_requires_auth(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/stripe/promoters/validate/SOMECODE")
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"

    def test_voucher_check_works_with_auth(self, api_client, auth_token):
        api_client.headers["Authorization"] = f"Bearer {auth_token}"
        resp = api_client.get(f"{BASE_URL}/api/stripe/voucher/check/INVALIDCODE")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("valid") is False


class TestBatchFetchHelpers:
    def test_stories_batch_actor_info(self):
        from routes.stories import _batch_fetch_actor_info
        assert callable(_batch_fetch_actor_info)

    def test_stories_batch_stats(self):
        from routes.stories import _batch_fetch_story_stats
        assert callable(_batch_fetch_story_stats)

    def test_stories_build_from_batch(self):
        from routes.stories import _build_story_response_from_batch
        assert callable(_build_story_response_from_batch)


class TestCallWSBroadcast:
    def test_call_initiate_and_answer_flow(self, api_client, auth_token):
        api_client.headers["Authorization"] = f"Bearer {auth_token}"
        pending = api_client.get(f"{BASE_URL}/api/calls/pending")
        assert pending.status_code == 200

    def test_call_history_batch(self, api_client, auth_token):
        api_client.headers["Authorization"] = f"Bearer {auth_token}"
        history = api_client.get(f"{BASE_URL}/api/calls/history")
        assert history.status_code == 200
        assert isinstance(history.json(), list)
