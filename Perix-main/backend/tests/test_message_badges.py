"""
Test cases for notification badges showing unread message count on Messages tab.
Tests:
1. GET /api/messages/unread-count returns correct count of unread messages
2. POST /api/messages/mark-read/{other_user_id} marks messages as read and returns count
3. Count updates after messages are read
4. Count returns 0 when no unread messages exist
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8000').rstrip('/')


def make_friends(sender_session, sender_user_id, receiver_session, receiver_user_id):
    resp = sender_session.post(f"{BASE_URL}/api/friend-requests/send", json={"to_user_id": receiver_user_id})
    assert resp.status_code == 200, f"Friend request failed: {resp.text}"
    request_id = resp.json()["request_id"]
    resp = receiver_session.post(f"{BASE_URL}/api/friend-requests/accept/{request_id}")
    assert resp.status_code == 200, f"Accept friend request failed: {resp.text}"

class TestMessageBadges:
    """Tests for unread message count badge feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create test users for message testing"""
        # Use separate sessions for each user to avoid cookie conflicts
        self.sender_session = requests.Session()
        self.sender_session.headers.update({"Content-Type": "application/json"})
        self.receiver_session = requests.Session()
        self.receiver_session.headers.update({"Content-Type": "application/json"})
        
        # Create sender user
        unique_id = uuid.uuid4().hex[:8]
        self.sender_email = f"TEST_badge_sender_{unique_id}@example.com"
        self.sender_password = "testpassword123"
        
        sender_resp = self.sender_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Badge Sender",
            "email": self.sender_email,
            "password": self.sender_password
        })
        assert sender_resp.status_code == 200, f"Failed to register sender: {sender_resp.text}"
        sender_data = sender_resp.json()
        self.sender_token = sender_data["session_token"]
        self.sender_user_id = sender_data["user"]["user_id"]
        
        # Create receiver user
        self.receiver_email = f"TEST_badge_receiver_{unique_id}@example.com"
        self.receiver_password = "testpassword123"
        
        receiver_resp = self.receiver_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Badge Receiver",
            "email": self.receiver_email,
            "password": self.receiver_password
        })
        assert receiver_resp.status_code == 200, f"Failed to register receiver: {receiver_resp.text}"
        receiver_data = receiver_resp.json()
        self.receiver_token = receiver_data["session_token"]
        self.receiver_user_id = receiver_data["user"]["user_id"]
        
        self.sender_session.headers.update({"Authorization": f"Bearer {self.sender_token}"})
        self.receiver_session.headers.update({"Authorization": f"Bearer {self.receiver_token}"})
        make_friends(self.sender_session, self.sender_user_id, self.receiver_session, self.receiver_user_id)
        
        yield
        
        # Cleanup - no explicit cleanup needed as test users are prefixed with TEST_
    
    def test_unread_count_returns_zero_initially(self):
        """Test GET /api/messages/unread-count returns 0 when no messages exist"""
        response = self.receiver_session.get(f"{BASE_URL}/api/messages/unread-count")
        
        assert response.status_code == 200
        data = response.json()
        assert "unread_count" in data
        assert data["unread_count"] == 0
        print(f"✓ Initial unread count is 0")
    
    def test_unread_count_increments_after_receiving_message(self):
        """Test unread count increases when a message is received"""
        # Send a message from sender to receiver
        send_resp = self.sender_session.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": self.receiver_user_id, "text": "Test message for badge count"}
        )
        assert send_resp.status_code == 200
        
        # Check unread count for receiver
        count_resp = self.receiver_session.get(f"{BASE_URL}/api/messages/unread-count")
        
        assert count_resp.status_code == 200
        data = count_resp.json()
        assert data["unread_count"] == 1
        print(f"✓ Unread count is 1 after receiving message")
    
    def test_unread_count_accumulates_multiple_messages(self):
        """Test unread count accumulates for multiple messages"""
        # Send multiple messages
        for i in range(3):
            send_resp = self.sender_session.post(
                f"{BASE_URL}/api/messages",
                json={"to_user_id": self.receiver_user_id, "text": f"Test message {i+1}"}
            )
            assert send_resp.status_code == 200
        
        # Check unread count (should be 3 new messages)
        count_resp = self.receiver_session.get(f"{BASE_URL}/api/messages/unread-count")
        
        assert count_resp.status_code == 200
        data = count_resp.json()
        # Could be 3 or more depending on previous test state
        assert data["unread_count"] >= 3
        print(f"✓ Unread count is {data['unread_count']} after multiple messages")
    
    def test_mark_messages_read_success(self):
        """Test POST /api/messages/mark-read/{other_user_id} marks messages as read"""
        # Send 2 messages to ensure we have unread messages
        for i in range(2):
            send_resp = self.sender_session.post(
                f"{BASE_URL}/api/messages",
                json={"to_user_id": self.receiver_user_id, "text": f"Message to be marked read {i+1}"}
            )
            assert send_resp.status_code == 200
        
        # Get count before marking read (should be at least 2)
        count_before = self.receiver_session.get(
            f"{BASE_URL}/api/messages/unread-count"
        ).json()["unread_count"]
        
        assert count_before >= 2, f"Expected at least 2 unread messages, got {count_before}"
        
        # Mark messages from sender as read
        mark_resp = self.receiver_session.post(
            f"{BASE_URL}/api/messages/mark-read/{self.sender_user_id}"
        )
        
        assert mark_resp.status_code == 200
        data = mark_resp.json()
        assert "marked_read" in data
        assert data["marked_read"] >= 2
        print(f"✓ Marked {data['marked_read']} messages as read")
        
        # Verify count is now 0
        count_after = self.receiver_session.get(
            f"{BASE_URL}/api/messages/unread-count"
        ).json()["unread_count"]
        
        assert count_after == 0
        print(f"✓ Unread count decreased from {count_before} to {count_after}")
    
    def test_mark_read_returns_zero_when_no_unread(self):
        """Test mark-read returns 0 when there are no unread messages from that user"""
        # Create a new user with no messages (needs own session to avoid cookie issues)
        unique_id = uuid.uuid4().hex[:8]
        new_user_email = f"TEST_badge_new_{unique_id}@example.com"
        
        new_user_session = requests.Session()
        new_user_session.headers.update({"Content-Type": "application/json"})
        
        new_user_resp = new_user_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "New User",
            "email": new_user_email,
            "password": "testpassword123"
        })
        assert new_user_resp.status_code == 200
        new_user_id = new_user_resp.json()["user"]["user_id"]
        new_user_token = new_user_resp.json()["session_token"]
        new_user_session.headers.update({"Authorization": f"Bearer {new_user_token}"})
        
        # Try to mark messages from new user as read (should be 0)
        mark_resp = self.receiver_session.post(
            f"{BASE_URL}/api/messages/mark-read/{new_user_id}"
        )
        
        assert mark_resp.status_code == 200
        data = mark_resp.json()
        assert data["marked_read"] == 0
        print(f"✓ Marked 0 messages as read (no messages from new user)")
    
    def test_unread_count_requires_authentication(self):
        """Test that unread count endpoint requires authentication"""
        # Use a fresh session without any cookies/auth
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/messages/unread-count")
        assert response.status_code == 401
        print(f"✓ Unread count requires authentication")
    
    def test_mark_read_requires_authentication(self):
        """Test that mark-read endpoint requires authentication"""
        # Use a fresh session without any cookies/auth
        fresh_session = requests.Session()
        response = fresh_session.post(f"{BASE_URL}/api/messages/mark-read/{self.sender_user_id}")
        assert response.status_code == 401
        print(f"✓ Mark read requires authentication")
    
    def test_count_only_for_messages_to_current_user(self):
        """Test that count only includes messages TO the current user, not FROM"""
        # Create a fresh receiver (needs own session)
        unique_id = uuid.uuid4().hex[:8]
        fresh_receiver_email = f"TEST_badge_fresh_{unique_id}@example.com"
        
        fresh_session = requests.Session()
        fresh_session.headers.update({"Content-Type": "application/json"})
        
        fresh_resp = fresh_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Fresh Receiver",
            "email": fresh_receiver_email,
            "password": "testpassword123"
        })
        assert fresh_resp.status_code == 200
        fresh_token = fresh_resp.json()["session_token"]
        fresh_user_id = fresh_resp.json()["user"]["user_id"]
        fresh_session.headers.update({"Authorization": f"Bearer {fresh_token}"})
        make_friends(fresh_session, fresh_user_id, self.sender_session, self.sender_user_id)
        
        # Fresh user sends a message (should not count against their unread)
        send_resp = fresh_session.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": self.sender_user_id, "text": "Message from fresh user"}
        )
        assert send_resp.status_code == 200
        
        # Check fresh user's unread count (should still be 0)
        count_resp = fresh_session.get(f"{BASE_URL}/api/messages/unread-count")
        
        assert count_resp.status_code == 200
        data = count_resp.json()
        assert data["unread_count"] == 0
        print(f"✓ Sent messages don't count as unread for sender")


class TestMultiUserBadge:
    """Test badge behavior with multiple senders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create test users for multi-user message testing"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Use separate sessions for each user to avoid cookie conflicts
        receiver_session = requests.Session()
        receiver_session.headers.update({"Content-Type": "application/json"})
        sender1_session = requests.Session()
        sender1_session.headers.update({"Content-Type": "application/json"})
        sender2_session = requests.Session()
        sender2_session.headers.update({"Content-Type": "application/json"})
        
        # Create receiver
        self.receiver_email = f"TEST_multi_receiver_{unique_id}@example.com"
        receiver_resp = receiver_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Multi Receiver",
            "email": self.receiver_email,
            "password": "testpassword123"
        })
        assert receiver_resp.status_code == 200
        receiver_data = receiver_resp.json()
        self.receiver_token = receiver_data["session_token"]
        self.receiver_user_id = receiver_data["user"]["user_id"]
        self.receiver_session = receiver_session
        
        # Create sender 1
        self.sender1_email = f"TEST_multi_sender1_{unique_id}@example.com"
        sender1_resp = sender1_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Multi Sender 1",
            "email": self.sender1_email,
            "password": "testpassword123"
        })
        assert sender1_resp.status_code == 200
        sender1_data = sender1_resp.json()
        self.sender1_token = sender1_data["session_token"]
        self.sender1_user_id = sender1_data["user"]["user_id"]
        self.sender1_session = sender1_session
        
        # Create sender 2
        self.sender2_email = f"TEST_multi_sender2_{unique_id}@example.com"
        sender2_resp = sender2_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Multi Sender 2",
            "email": self.sender2_email,
            "password": "testpassword123"
        })
        assert sender2_resp.status_code == 200
        sender2_data = sender2_resp.json()
        self.sender2_token = sender2_data["session_token"]
        self.sender2_user_id = sender2_data["user"]["user_id"]
        self.sender2_session = sender2_session
        
        self.receiver_session.headers.update({"Authorization": f"Bearer {self.receiver_token}"})
        self.sender1_session.headers.update({"Authorization": f"Bearer {self.sender1_token}"})
        self.sender2_session.headers.update({"Authorization": f"Bearer {self.sender2_token}"})
        make_friends(self.sender1_session, self.sender1_user_id, self.receiver_session, self.receiver_user_id)
        make_friends(self.sender2_session, self.sender2_user_id, self.receiver_session, self.receiver_user_id)
        
        yield
    
    def test_unread_count_from_multiple_senders(self):
        """Test badge counts messages from multiple senders correctly"""
        # Get initial count (could be non-zero from other tests)
        initial_count = self.receiver_session.get(
            f"{BASE_URL}/api/messages/unread-count"
        ).json()["unread_count"]
        
        # Sender 1 sends 2 messages (use sender1's session)
        for i in range(2):
            resp = self.sender1_session.post(
                f"{BASE_URL}/api/messages",
                json={"to_user_id": self.receiver_user_id, "text": f"Message from sender 1 - {i+1}"}
            )
            assert resp.status_code == 200
        
        # Sender 2 sends 3 messages (use sender2's session)
        for i in range(3):
            resp = self.sender2_session.post(
                f"{BASE_URL}/api/messages",
                json={"to_user_id": self.receiver_user_id, "text": f"Message from sender 2 - {i+1}"}
            )
            assert resp.status_code == 200
        
        # Total unread should have increased by 5 (use receiver's session)
        count_resp = self.receiver_session.get(
            f"{BASE_URL}/api/messages/unread-count"
        )
        
        assert count_resp.status_code == 200
        data = count_resp.json()
        assert data["unread_count"] == initial_count + 5
        print(f"✓ Total unread count increased by 5 (from {initial_count} to {data['unread_count']})")
    
    def test_mark_read_only_marks_specific_sender(self):
        """Test that mark-read only marks messages from specific sender"""
        # Send messages from both senders (use their own sessions)
        s1_resp = self.sender1_session.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": self.receiver_user_id, "text": "Message from sender 1 for selective read"}
        )
        assert s1_resp.status_code == 200
        
        s2_resp = self.sender2_session.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": self.receiver_user_id, "text": "Message from sender 2 for selective read"}
        )
        assert s2_resp.status_code == 200
        
        # Get initial count after sending both messages (use receiver's session)
        initial_count = self.receiver_session.get(
            f"{BASE_URL}/api/messages/unread-count"
        ).json()["unread_count"]
        
        assert initial_count >= 2, f"Should have at least 2 unread messages, got {initial_count}"
        
        # Mark only sender 1's messages as read (use receiver's session)
        mark_resp = self.receiver_session.post(
            f"{BASE_URL}/api/messages/mark-read/{self.sender1_user_id}"
        )
        
        assert mark_resp.status_code == 200
        marked = mark_resp.json()["marked_read"]
        assert marked >= 1, f"Should have marked at least 1 message, marked {marked}"
        
        # Check remaining count - sender 2's messages still unread (use receiver's session)
        final_count = self.receiver_session.get(
            f"{BASE_URL}/api/messages/unread-count"
        ).json()["unread_count"]
        
        # Sender 2's message(s) should still be unread
        assert final_count >= 1, f"Should have at least 1 unread message from sender 2, got {final_count}"
        assert final_count < initial_count, f"Count should have decreased after marking read"
        print(f"✓ Mark-read only affected sender 1's messages. Count went from {initial_count} to {final_count}")


class TestBadgeEndpointEdgeCases:
    """Edge case tests for badge endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for edge case tests"""
        # Use dedicated session for each user to avoid cookie issues
        self.user_session = requests.Session()
        self.user_session.headers.update({"Content-Type": "application/json"})
        
        unique_id = uuid.uuid4().hex[:8]
        
        # Create test user
        self.user_email = f"TEST_edge_user_{unique_id}@example.com"
        user_resp = self.user_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Edge User",
            "email": self.user_email,
            "password": "testpassword123"
        })
        assert user_resp.status_code == 200
        user_data = user_resp.json()
        self.user_token = user_data["session_token"]
        self.user_id = user_data["user"]["user_id"]
        
        self.user_session.headers.update({"Authorization": f"Bearer {self.user_token}"})
        
        yield
    
    def test_mark_read_with_invalid_user_id(self):
        """Test mark-read with non-existent user ID"""
        response = self.user_session.post(
            f"{BASE_URL}/api/messages/mark-read/invalid_user_id_12345"
        )
        
        # Should return 200 with 0 marked (graceful handling)
        assert response.status_code == 200
        data = response.json()
        assert data["marked_read"] == 0
        print(f"✓ Mark-read with invalid user ID returns 0")
    
    def test_marking_already_read_messages(self):
        """Test that marking already-read messages returns 0"""
        # Create sender (use separate session)
        sender_session = requests.Session()
        sender_session.headers.update({"Content-Type": "application/json"})
        
        unique_id = uuid.uuid4().hex[:8]
        sender_email = f"TEST_edge_sender_{unique_id}@example.com"
        sender_resp = sender_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Edge Sender",
            "email": sender_email,
            "password": "testpassword123"
        })
        assert sender_resp.status_code == 200
        sender_data = sender_resp.json()
        sender_user_id = sender_data["user"]["user_id"]
        sender_session.headers.update({"Authorization": f"Bearer {sender_data['session_token']}"})
        make_friends(sender_session, sender_user_id, self.user_session, self.user_id)
        
        # Send a message (use sender's session)
        send_resp = sender_session.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": self.user_id, "text": "Message to mark read twice"}
        )
        assert send_resp.status_code == 200
        
        # Mark as read first time (use user's session)
        first_mark = self.user_session.post(
            f"{BASE_URL}/api/messages/mark-read/{sender_user_id}"
        )
        assert first_mark.status_code == 200
        first_count = first_mark.json()["marked_read"]
        
        # Mark as read second time
        second_mark = self.user_session.post(
            f"{BASE_URL}/api/messages/mark-read/{sender_user_id}"
        )
        assert second_mark.status_code == 200
        second_count = second_mark.json()["marked_read"]
        
        assert second_count == 0
        print(f"✓ First mark: {first_count}, Second mark: {second_count} (no double-counting)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
