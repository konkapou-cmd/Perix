"""
Test message editing, public profile error handling, and category translations.
Features to test:
1. PUT /api/messages/{id} - Edit message endpoint
2. Public profile pages error handling (user, business, artist)
3. Category tree and translations
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://perix-fixes.preview.emergentagent.com"

# Test credentials
TEST_TOKEN = "session_bfbe2a09ecde4b1184e8f62a0040c776"
TEST_USER_ID = "user_b87ac9d31a86"


class TestMessageEditing:
    """Test message editing API (PUT /api/messages/{id})"""
    
    def test_send_message_success(self):
        """Test sending a message to self to create test data"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}
        
        # Send a message (to self for testing purposes)
        payload = {
            "to_user_id": TEST_USER_ID,
            "text": f"Test message for editing - {uuid.uuid4().hex[:8]}"
        }
        response = requests.post(f"{BASE_URL}/api/messages", json=payload, headers=headers)
        print(f"Send message response: {response.status_code}")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "message_id" in data
        assert data["from_user_id"] == TEST_USER_ID
        assert data["to_user_id"] == TEST_USER_ID
        assert "text" in data
        assert "created_at" in data
        
        # Store message_id for edit test
        self.__class__.created_message_id = data["message_id"]
        print(f"Created message with ID: {data['message_id']}")
    
    def test_edit_message_success(self):
        """Test editing an existing message with PUT /api/messages/{id}"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}
        
        # First create a message to edit
        payload = {
            "to_user_id": TEST_USER_ID,
            "text": f"Original message - {uuid.uuid4().hex[:8]}"
        }
        create_response = requests.post(f"{BASE_URL}/api/messages", json=payload, headers=headers)
        assert create_response.status_code == 200
        message_id = create_response.json()["message_id"]
        
        # Now edit the message
        new_text = f"Edited message - {uuid.uuid4().hex[:8]}"
        edit_payload = {"text": new_text}
        edit_response = requests.put(
            f"{BASE_URL}/api/messages/{message_id}",
            json=edit_payload,
            headers=headers
        )
        print(f"Edit message response: {edit_response.status_code}")
        
        # Status assertion
        assert edit_response.status_code == 200, f"Expected 200, got {edit_response.status_code}: {edit_response.text}"
        
        # Data assertions
        data = edit_response.json()
        assert data["message_id"] == message_id
        assert data["text"] == new_text
        assert "edited_at" in data
        assert data["edited_at"] is not None
        print(f"Message edited successfully, edited_at: {data['edited_at']}")
    
    def test_edit_message_not_found(self):
        """Test editing a non-existent message returns 404"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}
        
        fake_message_id = "msg_nonexistent_12345"
        edit_payload = {"text": "This should fail"}
        
        response = requests.put(
            f"{BASE_URL}/api/messages/{fake_message_id}",
            json=edit_payload,
            headers=headers
        )
        print(f"Edit non-existent message response: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_delete_message_success(self):
        """Test deleting a message with DELETE /api/messages/{id}"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}
        
        # First create a message to delete
        payload = {
            "to_user_id": TEST_USER_ID,
            "text": f"Message to delete - {uuid.uuid4().hex[:8]}"
        }
        create_response = requests.post(f"{BASE_URL}/api/messages", json=payload, headers=headers)
        assert create_response.status_code == 200
        message_id = create_response.json()["message_id"]
        
        # Now delete the message
        delete_response = requests.delete(
            f"{BASE_URL}/api/messages/{message_id}",
            headers=headers
        )
        print(f"Delete message response: {delete_response.status_code}")
        
        # Status assertion
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        # Data assertions
        data = delete_response.json()
        assert "message" in data or "message_id" in data
        print(f"Message deleted successfully")


class TestPublicProfileErrorHandling:
    """Test public profile pages return proper error responses for non-existent entities"""
    
    def test_user_public_profile_not_found(self):
        """Test that requesting a non-existent user returns proper error"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        fake_user_id = "user_nonexistent_12345"
        response = requests.get(
            f"{BASE_URL}/api/users/{fake_user_id}/public",
            headers=headers
        )
        print(f"Non-existent user profile response: {response.status_code}")
        
        # Should return 404 for non-existent user
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_user_public_profile_success(self):
        """Test that requesting an existing user returns profile"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        response = requests.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/public",
            headers=headers
        )
        print(f"Existing user profile response: {response.status_code}")
        
        # Should return 200 for existing user
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "user" in data
        assert "posts" in data
        assert "stories" in data
    
    def test_business_profile_not_found(self):
        """Test that requesting a non-existent business returns proper error"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        fake_business_id = "business_nonexistent_12345"
        response = requests.get(
            f"{BASE_URL}/api/businesses/{fake_business_id}",
            headers=headers
        )
        print(f"Non-existent business profile response: {response.status_code}")
        
        # Should return 404 for non-existent business
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_artist_profile_not_found(self):
        """Test that requesting a non-existent artist returns proper error"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        fake_artist_id = "artist_nonexistent_12345"
        response = requests.get(
            f"{BASE_URL}/api/artists/{fake_artist_id}",
            headers=headers
        )
        print(f"Non-existent artist profile response: {response.status_code}")
        
        # Should return 404 for non-existent artist
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestCategoryTree:
    """Test category tree and translation support"""
    
    def test_get_category_tree(self):
        """Test GET /api/businesses/category-tree returns categories"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers=headers
        )
        print(f"Category tree response: {response.status_code}")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "categories" in data
        categories = data["categories"]
        assert isinstance(categories, list)
        assert len(categories) > 0
        
        # Check category structure
        first_category = categories[0]
        assert "name" in first_category
        assert "slug" in first_category
        assert "subcategories" in first_category
        
        print(f"Found {len(categories)} root categories")
        
        # Verify subcategories structure
        if first_category["subcategories"]:
            first_sub = first_category["subcategories"][0]
            assert "name" in first_sub
            assert "slug" in first_sub
            print(f"First category '{first_category['name']}' has {len(first_category['subcategories'])} subcategories")
    
    def test_nearby_businesses_with_categories(self):
        """Test that nearby businesses endpoint returns category info"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        # Use a generic location (Athens, Greece as this is a Greek app)
        params = {
            "latitude": "37.9838",
            "longitude": "23.7275",
            "max_distance_meters": "50000"  # 50km radius
        }
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            params=params,
            headers=headers
        )
        print(f"Nearby businesses response: {response.status_code}")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            business = data[0]
            # Business should have category fields for translation
            assert "category" in business or "root_category" in business
            print(f"Found {len(data)} nearby businesses")
            if "root_category" in business:
                print(f"First business root_category: {business.get('root_category')}")
            if "subcategory" in business:
                print(f"First business subcategory: {business.get('subcategory')}")
        else:
            print("No nearby businesses found (this is OK for a fresh database)")


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_auth_me_endpoint(self):
        """Test that auth/me endpoint works with valid token"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        print(f"Auth/me response: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data
        assert data["user_id"] == TEST_USER_ID
        print(f"Authenticated as user: {data.get('name', 'unknown')}")
    
    def test_conversations_endpoint(self):
        """Test that conversations endpoint works"""
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        
        response = requests.get(f"{BASE_URL}/api/messages/conversations", headers=headers)
        print(f"Conversations response: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} conversations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
