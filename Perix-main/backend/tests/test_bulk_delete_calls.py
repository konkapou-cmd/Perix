"""
Test bulk delete call history feature:
- DELETE /api/calls/history (bulk delete all calls)
- DELETE /api/calls/history/{call_id} (single delete)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")

# Test credentials
TEST_USER_EMAIL = "refactor.test@example.com"
TEST_USER_PASSWORD = "testpass123"
TEST_PEER_EMAIL = "test_call_peer@example.com"
TEST_PEER_PASSWORD = "testpassword123"


class TestBulkDeleteCallHistory:
    """Tests for bulk delete call history feature"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as primary test user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("session_token")
            self.user_id = data.get("user", {}).get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Primary user login failed")
        
        # Login as peer user
        peer_login = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_PEER_EMAIL,
            "password": TEST_PEER_PASSWORD
        })
        if peer_login.status_code == 200:
            peer_data = peer_login.json()
            self.peer_token = peer_data.get("session_token")
            self.peer_user_id = peer_data.get("user", {}).get("user_id")
        else:
            self.peer_token = None
            self.peer_user_id = None
        
        yield

    # ==========================
    # GET /api/calls/history Tests
    # ==========================
    
    def test_get_call_history_returns_array(self):
        """Test GET /api/calls/history returns array"""
        response = self.session.get(f"{BASE_URL}/api/calls/history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/calls/history returns array with {len(data)} calls")

    def test_get_call_history_without_auth_fails(self):
        """Test GET /api/calls/history without auth returns 401/403"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/calls/history")
        assert response.status_code in [401, 403]
        print(f"PASS: GET /api/calls/history without auth returns {response.status_code}")

    # ==========================
    # DELETE /api/calls/history/{call_id} Tests (Single Delete)
    # ==========================

    def test_delete_single_call_not_found(self):
        """Test DELETE /api/calls/history/{call_id} with invalid ID returns 404"""
        response = self.session.delete(f"{BASE_URL}/api/calls/history/nonexistent_call_id")
        assert response.status_code == 404
        print("PASS: DELETE /api/calls/history/nonexistent_call_id returns 404")

    def test_delete_single_call_without_auth(self):
        """Test DELETE /api/calls/history/{call_id} without auth returns 401/403"""
        no_auth_session = requests.Session()
        response = no_auth_session.delete(f"{BASE_URL}/api/calls/history/some_call_id")
        assert response.status_code in [401, 403]
        print(f"PASS: DELETE single call without auth returns {response.status_code}")

    # ==========================
    # DELETE /api/calls/history Tests (Bulk Delete)
    # ==========================

    def test_bulk_delete_calls_without_auth(self):
        """Test DELETE /api/calls/history (bulk) without auth returns 401/403"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        response = no_auth_session.delete(f"{BASE_URL}/api/calls/history")
        assert response.status_code in [401, 403]
        print(f"PASS: DELETE /api/calls/history (bulk) without auth returns {response.status_code}")

    def test_bulk_delete_calls_returns_deleted_count(self):
        """Test DELETE /api/calls/history (bulk) returns deleted_count"""
        response = self.session.delete(f"{BASE_URL}/api/calls/history")
        assert response.status_code == 200
        data = response.json()
        assert "deleted_count" in data
        assert "message" in data
        assert isinstance(data["deleted_count"], int)
        print(f"PASS: DELETE /api/calls/history returns deleted_count={data['deleted_count']}, message='{data['message']}'")

    def test_bulk_delete_removes_all_calls(self):
        """Test DELETE /api/calls/history (bulk) removes all user's calls"""
        # First check how many calls exist before
        before_response = self.session.get(f"{BASE_URL}/api/calls/history")
        assert before_response.status_code == 200
        before_count = len(before_response.json())
        print(f"Before bulk delete: {before_count} calls")
        
        # Perform bulk delete
        delete_response = self.session.delete(f"{BASE_URL}/api/calls/history")
        assert delete_response.status_code == 200
        deleted_data = delete_response.json()
        deleted_count = deleted_data.get("deleted_count", 0)
        print(f"Bulk delete response: deleted_count={deleted_count}")
        
        # Verify no calls remain
        after_response = self.session.get(f"{BASE_URL}/api/calls/history")
        assert after_response.status_code == 200
        after_count = len(after_response.json())
        
        assert after_count == 0, f"Expected 0 calls after bulk delete, got {after_count}"
        print(f"PASS: After bulk delete: {after_count} calls (was {before_count})")

    def test_bulk_delete_idempotent(self):
        """Test DELETE /api/calls/history (bulk) can be called multiple times"""
        # First delete
        response1 = self.session.delete(f"{BASE_URL}/api/calls/history")
        assert response1.status_code == 200
        
        # Second delete (should still succeed with deleted_count=0)
        response2 = self.session.delete(f"{BASE_URL}/api/calls/history")
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2.get("deleted_count") == 0
        print("PASS: Bulk delete is idempotent - second call returns deleted_count=0")


class TestBulkDeleteIntegration:
    """Integration tests for bulk delete with call creation"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as primary test user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("session_token")
            self.user_id = data.get("user", {}).get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Primary user login failed")
        
        yield

    def test_endpoint_accessibility(self):
        """Test that both delete endpoints are accessible"""
        # Test bulk delete endpoint exists
        bulk_response = self.session.delete(f"{BASE_URL}/api/calls/history")
        assert bulk_response.status_code in [200, 204]
        print(f"PASS: Bulk delete endpoint accessible, status={bulk_response.status_code}")
        
        # Test single delete endpoint exists (with invalid ID to check routing)
        single_response = self.session.delete(f"{BASE_URL}/api/calls/history/invalid_id")
        assert single_response.status_code == 404  # Not found is expected for invalid ID
        print("PASS: Single delete endpoint accessible, returns 404 for invalid ID")
