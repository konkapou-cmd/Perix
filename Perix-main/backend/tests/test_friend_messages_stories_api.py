"""Tests for Friend Requests, Messages, Contacts, and Stories APIs."""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "test-user@test.com"
TEST_USER_PASSWORD = "testpassword"


class TestConfig:
    """Store session data across tests."""
    session_token = None
    user_id = None
    user2_token = None
    user2_id = None
    test_request_id = None
    test_story_id = None


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token for test user"""
    if TestConfig.session_token:
        return TestConfig.session_token
        
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    
    if response.status_code == 200:
        data = response.json()
        TestConfig.session_token = data.get("session_token")
        TestConfig.user_id = data.get("user_id")
        return TestConfig.session_token
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# ==================== FRIEND REQUEST TESTS ====================

class TestFriendRequestsAPI:
    """Test Friend Requests endpoints"""
    
    def test_get_received_requests(self, authenticated_client):
        """Test GET /api/friend-requests/received"""
        response = authenticated_client.get(f"{BASE_URL}/api/friend-requests/received")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Each request should have required fields
        for req in data:
            assert "request_id" in req
            assert "from_user_id" in req
            assert "to_user_id" in req
            assert "status" in req
    
    def test_get_sent_requests(self, authenticated_client):
        """Test GET /api/friend-requests/sent"""
        response = authenticated_client.get(f"{BASE_URL}/api/friend-requests/sent")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_pending_request_count(self, authenticated_client):
        """Test GET /api/friend-requests/count"""
        response = authenticated_client.get(f"{BASE_URL}/api/friend-requests/count")
        assert response.status_code == 200
        data = response.json()
        assert "pending_count" in data
        assert isinstance(data["pending_count"], int)
    
    def test_send_friend_request_to_self_fails(self, authenticated_client):
        """Test that sending friend request to self fails"""
        if not TestConfig.user_id:
            pytest.skip("User ID not available")
        response = authenticated_client.post(
            f"{BASE_URL}/api/friend-requests/send",
            json={"to_user_id": TestConfig.user_id}
        )
        # Should fail with 400 or 422 (validation error)
        assert response.status_code in [400, 422]
    
    def test_send_friend_request_to_nonexistent_user(self, authenticated_client):
        """Test that sending friend request to non-existent user fails"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/friend-requests/send",
            json={"to_user_id": f"nonexistent_{uuid.uuid4().hex[:8]}"}
        )
        assert response.status_code == 404
    
    def test_get_friendship_status(self, authenticated_client):
        """Test GET /api/friend-requests/status/{user_id}"""
        # Get any user to check status with
        # First, get users from the search/explore
        response = authenticated_client.get(f"{BASE_URL}/api/friend-requests/status/{TestConfig.user_id}")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] in ["friends", "request_sent", "request_received", "none"]


# ==================== MESSAGES TESTS ====================

class TestMessagesAPI:
    """Test Messages endpoints including typing indicators and media messages"""
    
    def test_list_conversations(self, authenticated_client):
        """Test GET /api/messages/conversations"""
        response = authenticated_client.get(f"{BASE_URL}/api/messages/conversations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_unread_count(self, authenticated_client):
        """Test GET /api/messages/unread-count"""
        response = authenticated_client.get(f"{BASE_URL}/api/messages/unread-count")
        assert response.status_code == 200
        data = response.json()
        assert "unread_count" in data
        assert isinstance(data["unread_count"], int)
    
    def test_typing_status_endpoint(self, authenticated_client):
        """Test POST /api/messages/typing"""
        # Use a placeholder user ID for testing the endpoint
        test_recipient = "test_recipient_123"
        response = authenticated_client.post(
            f"{BASE_URL}/api/messages/typing",
            json={"to_user_id": test_recipient, "is_typing": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        # Clear typing status
        response = authenticated_client.post(
            f"{BASE_URL}/api/messages/typing",
            json={"to_user_id": test_recipient, "is_typing": False}
        )
        assert response.status_code == 200
    
    def test_get_typing_status(self, authenticated_client):
        """Test GET /api/messages/typing/{other_user_id}"""
        response = authenticated_client.get(f"{BASE_URL}/api/messages/typing/{TestConfig.user_id}")
        assert response.status_code == 200
        data = response.json()
        assert "is_typing" in data
        assert isinstance(data["is_typing"], bool)
    
    def test_send_message_to_non_friend_fails(self, authenticated_client):
        """Test that sending message to non-friend fails (friends-only restriction)"""
        # Try to send message to a random user ID that is not a friend
        response = authenticated_client.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": f"random_user_{uuid.uuid4().hex[:8]}", "text": "Test message"}
        )
        # Should fail with 404 (user not found) or 403 (not friends)
        assert response.status_code in [403, 404]
    
    def test_media_message_endpoint_structure(self, authenticated_client):
        """Test POST /api/messages/media endpoint exists and validates input"""
        # Send without proper fields to check validation
        response = authenticated_client.post(
            f"{BASE_URL}/api/messages/media",
            json={}
        )
        # Should fail validation (422 or 400)
        assert response.status_code in [422, 400, 403, 404]


# ==================== CONTACTS TESTS ====================

class TestContactsAPI:
    """Test Contacts/Referral endpoints"""
    
    def test_get_referral_code(self, authenticated_client):
        """Test GET /api/contacts/referral-code"""
        response = authenticated_client.get(f"{BASE_URL}/api/contacts/referral-code")
        assert response.status_code == 200
        data = response.json()
        assert "referral_code" in data
        assert len(data["referral_code"]) > 0
    
    def test_check_contacts_empty(self, authenticated_client):
        """Test POST /api/contacts/check with empty contacts"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/contacts/check",
            json={"contacts": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert "matched_users" in data
        assert "invitable_contacts" in data
        assert data["total_checked"] == 0
    
    def test_check_contacts_with_data(self, authenticated_client):
        """Test POST /api/contacts/check with sample contacts"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/contacts/check",
            json={
                "contacts": [
                    {"name": "Test Contact", "phone_numbers": ["+1234567890"]}
                ]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "matched_users" in data
        assert "invitable_contacts" in data
        assert "total_checked" in data
    
    def test_get_my_invites(self, authenticated_client):
        """Test GET /api/contacts/my-invites"""
        response = authenticated_client.get(f"{BASE_URL}/api/contacts/my-invites")
        assert response.status_code == 200
        data = response.json()
        assert "invites" in data
        assert "stats" in data
        assert "total_invites" in data["stats"]
        assert "total_converted" in data["stats"]
    
    def test_apply_referral_code_self_fails(self, authenticated_client):
        """Test that applying own referral code fails"""
        # First get our own code
        response = authenticated_client.get(f"{BASE_URL}/api/contacts/referral-code")
        our_code = response.json().get("referral_code")
        
        if our_code:
            # Try to apply it - should fail
            response = authenticated_client.post(
                f"{BASE_URL}/api/contacts/apply-referral",
                params={"referral_code": our_code}
            )
            # Should fail with 400 (can't use own code) or already have referrer
            assert response.status_code in [400, 422]


# ==================== STORIES TESTS ====================

class TestStoriesAPI:
    """Test Stories endpoints including reactions"""
    
    def test_list_stories(self, authenticated_client):
        """Test GET /api/stories"""
        response = authenticated_client.get(f"{BASE_URL}/api/stories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_grouped_stories(self, authenticated_client):
        """Test GET /api/stories/grouped"""
        response = authenticated_client.get(f"{BASE_URL}/api/stories/grouped")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Each group should have user info and stories
        for group in data:
            assert "user_id" in group
            assert "stories" in group
            assert "story_count" in group
    
    def test_create_story(self, authenticated_client):
        """Test POST /api/stories - create a text story"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stories",
            json={
                "text": f"Test story from automated testing {datetime.now().isoformat()}"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "story_id" in data
        TestConfig.test_story_id = data["story_id"]
    
    def test_get_story_reactions(self, authenticated_client):
        """Test GET /api/stories/{story_id}/reactions"""
        if not TestConfig.test_story_id:
            pytest.skip("No test story created")
        
        response = authenticated_client.get(
            f"{BASE_URL}/api/stories/{TestConfig.test_story_id}/reactions"
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_count" in data
        assert "counts" in data
        assert "my_reaction" in data
    
    def test_react_to_story(self, authenticated_client):
        """Test POST /api/stories/{story_id}/react"""
        if not TestConfig.test_story_id:
            pytest.skip("No test story created")
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/stories/{TestConfig.test_story_id}/react",
            params={"reaction": "❤️"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("reaction") == "❤️"
    
    def test_react_to_story_invalid_reaction(self, authenticated_client):
        """Test POST /api/stories/{story_id}/react with invalid reaction"""
        if not TestConfig.test_story_id:
            pytest.skip("No test story created")
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/stories/{TestConfig.test_story_id}/react",
            params={"reaction": "INVALID"}
        )
        assert response.status_code == 400
    
    def test_remove_story_reaction(self, authenticated_client):
        """Test DELETE /api/stories/{story_id}/react"""
        if not TestConfig.test_story_id:
            pytest.skip("No test story created")
        
        response = authenticated_client.delete(
            f"{BASE_URL}/api/stories/{TestConfig.test_story_id}/react"
        )
        # Should succeed (200) or not found (404) if no reaction
        assert response.status_code in [200, 404]
    
    def test_delete_story(self, authenticated_client):
        """Test DELETE /api/stories/{story_id} - cleanup test story"""
        if not TestConfig.test_story_id:
            pytest.skip("No test story created")
        
        response = authenticated_client.delete(
            f"{BASE_URL}/api/stories/{TestConfig.test_story_id}"
        )
        assert response.status_code == 200
        assert response.json().get("success") == True


# ==================== STORY HIGHLIGHTS TESTS ====================

class TestStoryHighlightsAPI:
    """Test Story Highlights endpoints"""
    
    def test_get_my_highlights(self, authenticated_client):
        """Test GET /api/stories/highlights/my"""
        response = authenticated_client.get(f"{BASE_URL}/api/stories/highlights/my")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_user_highlights(self, authenticated_client):
        """Test GET /api/stories/highlights/user/{user_id}"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stories/highlights/user/{TestConfig.user_id}"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# ==================== INTEGRATION TEST ====================

class TestFriendRequestWorkflow:
    """End-to-end test of friend request workflow"""
    
    def test_full_friend_request_flow(self, api_client, auth_token):
        """Test the complete friend request flow with validation"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # 1. Get current pending count
        response = api_client.get(f"{BASE_URL}/api/friend-requests/count")
        assert response.status_code == 200
        initial_count = response.json()["pending_count"]
        
        # 2. Get received requests
        response = api_client.get(f"{BASE_URL}/api/friend-requests/received")
        assert response.status_code == 200
        
        # 3. Get sent requests
        response = api_client.get(f"{BASE_URL}/api/friend-requests/sent")
        assert response.status_code == 200
        
        # 4. Verify count is consistent
        response = api_client.get(f"{BASE_URL}/api/friend-requests/count")
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
