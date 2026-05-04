"""
Test Call History, Subscriptions, and Messages Delete Features

Features tested:
1. GET /api/calls/history - Call history returns records with other_user object
2. DELETE /api/calls/history/{call_id} - Delete call from history
3. GET /api/subscriptions/plans - Get subscription plan pricing
4. POST /api/subscriptions/create - Create PayPal subscription
5. DELETE /api/messages/conversation/{user_id} - Delete conversation
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "refactor.test@example.com"
TEST_USER_PASSWORD = "testpass123"

# Additional test user for call tests
TEST_USER2_EMAIL = "test_call_peer@example.com"
TEST_USER2_PASSWORD = "testpassword123"
TEST_USER2_NAME = "Call Peer User"


@pytest.fixture(scope="module")
def session():
    """Create a requests session"""
    return requests.Session()


@pytest.fixture(scope="module")
def auth_token(session):
    """Login with test user and get auth token"""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    
    if response.status_code != 200:
        # Try to register if login fails
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Refactor Test User",
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
    
    assert response.status_code in [200, 201], f"Auth failed: {response.text}"
    data = response.json()
    assert "session_token" in data
    return data["session_token"], data["user"]["user_id"]


@pytest.fixture(scope="module")
def auth_token2(session):
    """Get auth token for second test user"""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER2_EMAIL,
        "password": TEST_USER2_PASSWORD
    })
    
    if response.status_code != 200:
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": TEST_USER2_NAME,
            "email": TEST_USER2_EMAIL,
            "password": TEST_USER2_PASSWORD
        })
    
    assert response.status_code in [200, 201], f"Auth failed: {response.text}"
    data = response.json()
    return data["session_token"], data["user"]["user_id"]


class TestCallHistoryAPI:
    """Test call history endpoints"""
    
    def test_get_call_history_returns_array(self, session, auth_token):
        """GET /api/calls/history returns an array"""
        token, user_id = auth_token
        response = session.get(
            f"{BASE_URL}/api/calls/history",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"Call history returned {len(data)} records")
    
    def test_get_call_history_without_auth_fails(self):
        """GET /api/calls/history without auth returns 401"""
        # Use fresh session without any auth headers
        response = requests.get(f"{BASE_URL}/api/calls/history")
        assert response.status_code == 401
    
    def test_initiate_call_creates_record(self, session, auth_token, auth_token2):
        """POST /api/calls/initiate creates a call record"""
        token, user_id = auth_token
        token2, user2_id = auth_token2
        
        response = session.post(
            f"{BASE_URL}/api/calls/initiate",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "to_user_id": user2_id,
                "call_type": "video"
            }
        )
        
        assert response.status_code == 200, f"Initiate call failed: {response.text}"
        data = response.json()
        assert "call_id" in data
        assert "channel" in data
        assert "token" in data
        assert data["call_type"] == "video"
        assert data["status"] == "pending"
        
        # Store call_id for later tests
        TestCallHistoryAPI.created_call_id = data["call_id"]
        print(f"Created call: {data['call_id']}")
    
    def test_call_history_contains_other_user_object(self, session, auth_token):
        """GET /api/calls/history includes other_user object in each record"""
        token, user_id = auth_token
        
        # Wait for call to be recorded
        time.sleep(0.5)
        
        response = session.get(
            f"{BASE_URL}/api/calls/history",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            # Check first record has other_user object
            record = data[0]
            assert "other_user" in record, "Call record should have other_user field"
            assert "is_outgoing" in record, "Call record should have is_outgoing field"
            
            if record["other_user"]:
                other_user = record["other_user"]
                assert "user_id" in other_user, "other_user should have user_id"
                assert "name" in other_user, "other_user should have name"
                print(f"Call record has other_user: {other_user.get('name')}")
        else:
            pytest.skip("No call history records to verify")
    
    def test_delete_call_history_success(self, session, auth_token):
        """DELETE /api/calls/history/{call_id} deletes a call record"""
        token, user_id = auth_token
        
        if not hasattr(TestCallHistoryAPI, 'created_call_id'):
            pytest.skip("No call_id available - run test_initiate_call_creates_record first")
        
        call_id = TestCallHistoryAPI.created_call_id
        
        response = session.delete(
            f"{BASE_URL}/api/calls/history/{call_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Delete failed: {response.text}"
        data = response.json()
        assert data.get("message") == "Call deleted" or "call_id" in data
        print(f"Successfully deleted call: {call_id}")
    
    def test_delete_call_history_not_found(self, session, auth_token):
        """DELETE /api/calls/history with invalid call_id returns 404"""
        token, user_id = auth_token
        
        response = session.delete(
            f"{BASE_URL}/api/calls/history/invalid_call_id_12345",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 404
    
    def test_delete_call_history_without_auth(self):
        """DELETE /api/calls/history without auth returns 401"""
        # Use fresh session without any auth headers
        response = requests.delete(f"{BASE_URL}/api/calls/history/any_call_id")
        assert response.status_code == 401


class TestSubscriptionPlansAPI:
    """Test subscription plans endpoints"""
    
    def test_get_subscription_plans_returns_pricing(self, session, auth_token):
        """GET /api/subscriptions/plans returns pricing information"""
        token, user_id = auth_token
        
        response = session.get(
            f"{BASE_URL}/api/subscriptions/plans",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Note: This may fail if PayPal is not configured in sandbox
        if response.status_code == 500:
            error_msg = response.json().get("detail", "")
            if "PayPal" in error_msg:
                pytest.skip(f"PayPal not configured: {error_msg}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check response structure
        assert "monthly_plan_id" in data, "Response should have monthly_plan_id"
        assert "yearly_plan_id" in data, "Response should have yearly_plan_id"
        assert "monthly_price" in data, "Response should have monthly_price"
        assert "yearly_price" in data, "Response should have yearly_price"
        assert "trial_days" in data, "Response should have trial_days"
        assert "currency" in data, "Response should have currency"
        
        # Verify pricing values
        assert data["monthly_price"] == 9.99, f"Monthly price should be 9.99, got {data['monthly_price']}"
        assert data["yearly_price"] == 99.00, f"Yearly price should be 99.00, got {data['yearly_price']}"
        assert data["currency"] == "USD"
        assert data["trial_days"] == 10
        
        print(f"Subscription plans: Monthly=${data['monthly_price']}, Yearly=${data['yearly_price']}")
    
    def test_get_subscription_plans_without_auth(self):
        """GET /api/subscriptions/plans without auth returns 401"""
        # Use fresh session without any auth headers
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 401


class TestSubscriptionCreateAPI:
    """Test subscription creation endpoint"""
    
    @pytest.fixture(scope="class")
    def test_business(self, session, auth_token):
        """Create a test business for subscription testing"""
        token, user_id = auth_token
        
        # First check if user has a business
        response = session.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code == 200 and response.json():
            business = response.json()
            return business["business_id"]
        
        # Create a test business
        response = session.post(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "TEST_Subscription_Business",
                "root_category": "food_drink",
                "subcategory": "restaurant",
                "description": "Test business for subscription testing",
                "address": "123 Test St",
                "latitude": 37.7749,
                "longitude": -122.4194
            }
        )
        
        if response.status_code in [200, 201]:
            return response.json()["business_id"]
        else:
            pytest.skip(f"Could not create test business: {response.text}")
    
    def test_create_subscription_requires_business(self, session, auth_token):
        """POST /api/subscriptions/create requires a valid business_id"""
        token, user_id = auth_token
        
        response = session.post(
            f"{BASE_URL}/api/subscriptions/create",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "business_id": "invalid_business_id",
                "plan_type": "monthly"
            }
        )
        
        # Should return 403 (not authorized) for invalid business
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
    
    def test_create_subscription_with_valid_business(self, session, auth_token, test_business):
        """POST /api/subscriptions/create with valid business initiates PayPal"""
        token, user_id = auth_token
        business_id = test_business
        
        if not business_id:
            pytest.skip("No test business available")
        
        response = session.post(
            f"{BASE_URL}/api/subscriptions/create",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "business_id": business_id,
                "plan_type": "monthly"
            }
        )
        
        # This may fail if PayPal is not configured
        if response.status_code == 500:
            error_msg = response.json().get("detail", "")
            if "PayPal" in error_msg:
                pytest.skip(f"PayPal not configured: {error_msg}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "subscription_id" in data, "Response should have subscription_id"
        assert "approval_url" in data, "Response should have approval_url"
        assert "status" in data, "Response should have status"
        
        print(f"Created subscription: {data['subscription_id']}, status: {data['status']}")
    
    def test_create_subscription_without_auth(self):
        """POST /api/subscriptions/create without auth returns 401"""
        # Use fresh session without any auth headers
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/create",
            json={"business_id": "any", "plan_type": "monthly"}
        )
        assert response.status_code == 401


class TestMessageDeleteAPI:
    """Test message deletion endpoints"""
    
    def test_send_message_to_peer(self, session, auth_token, auth_token2):
        """Send a test message for delete testing"""
        token, user_id = auth_token
        token2, user2_id = auth_token2
        
        response = session.post(
            f"{BASE_URL}/api/messages",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "to_user_id": user2_id,
                "text": "TEST_Message for delete testing"
            }
        )
        
        assert response.status_code in [200, 201], f"Send message failed: {response.text}"
        data = response.json()
        assert "message_id" in data
        
        TestMessageDeleteAPI.test_message_id = data["message_id"]
        TestMessageDeleteAPI.peer_user_id = user2_id
        print(f"Sent test message: {data['message_id']}")
    
    def test_delete_individual_message(self, session, auth_token):
        """DELETE /api/messages/{message_id} deletes a single message"""
        token, user_id = auth_token
        
        if not hasattr(TestMessageDeleteAPI, 'test_message_id'):
            pytest.skip("No message_id available - run test_send_message_to_peer first")
        
        message_id = TestMessageDeleteAPI.test_message_id
        
        response = session.delete(
            f"{BASE_URL}/api/messages/{message_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Delete message failed: {response.text}"
        print(f"Deleted message: {message_id}")
    
    def test_delete_conversation_success(self, session, auth_token, auth_token2):
        """DELETE /api/messages/conversation/{user_id} deletes all messages with user"""
        token, user_id = auth_token
        token2, user2_id = auth_token2
        
        # First send some messages
        for i in range(3):
            session.post(
                f"{BASE_URL}/api/messages",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "to_user_id": user2_id,
                    "text": f"TEST_Conversation message {i}"
                }
            )
        
        time.sleep(0.5)
        
        # Delete entire conversation
        response = session.delete(
            f"{BASE_URL}/api/messages/conversation/{user2_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Delete conversation failed: {response.text}"
        data = response.json()
        assert "deleted_count" in data, "Response should have deleted_count"
        print(f"Deleted conversation with {user2_id}, count: {data['deleted_count']}")
    
    def test_delete_conversation_without_auth(self):
        """DELETE /api/messages/conversation without auth returns 401"""
        # Use fresh session without any auth headers
        response = requests.delete(f"{BASE_URL}/api/messages/conversation/any_user_id")
        assert response.status_code == 401


class TestCallHistoryDeleteAuthorization:
    """Test call history delete authorization - only caller/callee can delete"""
    
    def test_delete_others_call_returns_403(self, session, auth_token, auth_token2):
        """DELETE call from history by non-participant returns 403"""
        token, user_id = auth_token
        token2, user2_id = auth_token2
        
        # User1 creates a call to User2
        response = session.post(
            f"{BASE_URL}/api/calls/initiate",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "to_user_id": user2_id,
                "call_type": "voice"
            }
        )
        
        if response.status_code != 200:
            pytest.skip(f"Could not initiate call: {response.text}")
        
        call_id = response.json()["call_id"]
        
        # Create a third user who is not part of the call
        third_user_response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Third User",
            "email": "test_third_user_delete@example.com",
            "password": "testpassword123"
        })
        
        if third_user_response.status_code == 400:
            third_user_response = session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "test_third_user_delete@example.com",
                "password": "testpassword123"
            })
        
        if third_user_response.status_code not in [200, 201]:
            # Skip if we can't create third user, but still clean up
            session.delete(
                f"{BASE_URL}/api/calls/history/{call_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            pytest.skip("Could not create third test user")
        
        third_token = third_user_response.json()["session_token"]
        
        # Third user tries to delete the call
        delete_response = session.delete(
            f"{BASE_URL}/api/calls/history/{call_id}",
            headers={"Authorization": f"Bearer {third_token}"}
        )
        
        # Should get 403 Forbidden
        assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}"
        
        # Clean up - delete with actual participant
        session.delete(
            f"{BASE_URL}/api/calls/history/{call_id}",
            headers={"Authorization": f"Bearer {token}"}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
