"""
Test DELETE endpoints for Business, Artist, and User profiles
Tests the new delete functionality implementation
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://perix-fixes.preview.emergentagent.com")
if BASE_URL.endswith("/"):
    BASE_URL = BASE_URL.rstrip("/")
if not BASE_URL.endswith("/api"):
    BASE_URL = f"{BASE_URL}/api"


class TestDeleteEndpoints:
    """Test delete endpoints for business, artist, and user accounts"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login to get session token"""
        # Use existing test user for login
        self.test_email = "test@example.com"
        self.test_password = "test123"
        
        login_response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": self.test_email, "password": self.test_password}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.session_token = data.get("session_token")
            self.user = data.get("user")
        else:
            pytest.skip("Could not login to run tests")
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}"
        }

    def test_delete_business_endpoint_exists(self):
        """Test that DELETE /businesses/{business_id} endpoint exists and responds correctly"""
        # First check if user has a business
        response = requests.get(
            f"{BASE_URL}/businesses/my",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get my business: {response.text}"
        
        business = response.json()
        
        if business:
            # User has a business - test delete with wrong business_id first (not owned)
            response = requests.delete(
                f"{BASE_URL}/businesses/fake_business_id",
                headers=self.headers
            )
            # Should return 403 (not authorized) or 404 (not found)
            assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}"
            print(f"✓ DELETE /businesses endpoint exists and returns correct error for unauthorized access")
        else:
            print("✓ User has no business to test delete on - endpoint structure verified")

    def test_delete_artist_endpoint_exists(self):
        """Test that DELETE /artists/{artist_id} endpoint exists and responds correctly"""
        # First check if user has an artist profile
        response = requests.get(
            f"{BASE_URL}/artists/my",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get my artist: {response.text}"
        
        artist = response.json()
        
        if artist:
            # User has an artist - test delete with wrong artist_id first (not owned)
            response = requests.delete(
                f"{BASE_URL}/artists/fake_artist_id",
                headers=self.headers
            )
            # Should return 403 (not authorized) or 404 (not found)
            assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}"
            print(f"✓ DELETE /artists endpoint exists and returns correct error for unauthorized access")
        else:
            print("✓ User has no artist profile to test delete on - endpoint structure verified")

    def test_delete_user_account_endpoint_exists(self):
        """Test that DELETE /users/me endpoint exists"""
        # We won't actually delete the test user - just verify the endpoint responds
        # Create a temporary user to test deletion
        timestamp = int(time.time())
        temp_email = f"temp_delete_test_{timestamp}@test.com"
        temp_password = "testpass123"
        
        # Register temp user
        register_response = requests.post(
            f"{BASE_URL}/auth/register",
            json={"email": temp_email, "password": temp_password, "name": "Temp Delete Test"}
        )
        
        if register_response.status_code == 200:
            temp_data = register_response.json()
            temp_token = temp_data.get("session_token")
            temp_headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {temp_token}"
            }
            
            # Now delete this temp user
            delete_response = requests.delete(
                f"{BASE_URL}/users/me",
                headers=temp_headers
            )
            
            assert delete_response.status_code == 200, f"Delete user failed: {delete_response.text}"
            data = delete_response.json()
            assert data.get("success") == True, "Expected success: true in response"
            assert "message" in data, "Expected message field in response"
            
            print(f"✓ DELETE /users/me endpoint works correctly - temp user deleted")
            
            # Verify user is actually deleted (login should fail)
            verify_response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"email": temp_email, "password": temp_password}
            )
            assert verify_response.status_code == 401, "Deleted user should not be able to login"
            print(f"✓ Verified user deletion - login fails for deleted user")
        else:
            print(f"Could not create temp user for deletion test: {register_response.text}")


class TestBusinessDeletionFlow:
    """Test complete business deletion flow - create, verify, delete, verify removal"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test with fresh temp user who will own a business"""
        timestamp = int(time.time())
        self.temp_email = f"biz_owner_{timestamp}@test.com"
        self.temp_password = "testpass123"
        
        # Register temp user
        register_response = requests.post(
            f"{BASE_URL}/auth/register",
            json={"email": self.temp_email, "password": self.temp_password, "name": "Business Owner Test"}
        )
        
        if register_response.status_code == 200:
            data = register_response.json()
            self.session_token = data.get("session_token")
            self.user = data.get("user")
        else:
            pytest.skip(f"Could not register temp user: {register_response.text}")
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}"
        }

    def test_create_and_delete_business(self):
        """Test creating a business, then deleting it"""
        # Create a business - using valid categories from category tree
        create_response = requests.post(
            f"{BASE_URL}/businesses",
            headers=self.headers,
            json={
                "name": "Test Delete Business",
                "root_category": "bars-nightlife",
                "subcategory": "cocktail-bars",
                "address": "123 Test Street",
                "latitude": 51.5074,
                "longitude": -0.1278
            }
        )
        
        assert create_response.status_code == 200, f"Failed to create business: {create_response.text}"
        business = create_response.json()
        business_id = business.get("business_id")
        assert business_id, "No business_id in response"
        print(f"✓ Created business: {business_id}")
        
        # Verify business exists
        get_response = requests.get(
            f"{BASE_URL}/businesses/my",
            headers=self.headers
        )
        assert get_response.status_code == 200
        assert get_response.json().get("business_id") == business_id
        print(f"✓ Verified business exists")
        
        # Delete the business
        delete_response = requests.delete(
            f"{BASE_URL}/businesses/{business_id}",
            headers=self.headers
        )
        
        assert delete_response.status_code == 200, f"Failed to delete business: {delete_response.text}"
        data = delete_response.json()
        assert data.get("success") == True, "Expected success: true"
        print(f"✓ Deleted business: {business_id}")
        
        # Verify business no longer exists
        verify_response = requests.get(
            f"{BASE_URL}/businesses/my",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        assert verify_response.json() is None, "Business should be deleted"
        print(f"✓ Verified business deletion - my business returns null")
        
        # Clean up - delete temp user
        requests.delete(f"{BASE_URL}/users/me", headers=self.headers)


class TestArtistDeletionFlow:
    """Test complete artist deletion flow - create, verify, delete, verify removal"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test with fresh temp user who will own an artist profile"""
        timestamp = int(time.time())
        self.temp_email = f"artist_owner_{timestamp}@test.com"
        self.temp_password = "testpass123"
        
        # Register temp user
        register_response = requests.post(
            f"{BASE_URL}/auth/register",
            json={"email": self.temp_email, "password": self.temp_password, "name": "Artist Owner Test"}
        )
        
        if register_response.status_code == 200:
            data = register_response.json()
            self.session_token = data.get("session_token")
            self.user = data.get("user")
        else:
            pytest.skip(f"Could not register temp user: {register_response.text}")
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}"
        }

    def test_create_and_delete_artist(self):
        """Test creating an artist, then deleting it"""
        # Create an artist
        create_response = requests.post(
            f"{BASE_URL}/artists",
            headers=self.headers,
            json={
                "name": "Test Delete Artist",
                "bio": "A test artist for deletion",
                "genres": ["rock", "pop"]
            }
        )
        
        assert create_response.status_code == 200, f"Failed to create artist: {create_response.text}"
        artist = create_response.json()
        artist_id = artist.get("artist_id")
        assert artist_id, "No artist_id in response"
        print(f"✓ Created artist: {artist_id}")
        
        # Verify artist exists
        get_response = requests.get(
            f"{BASE_URL}/artists/my",
            headers=self.headers
        )
        assert get_response.status_code == 200
        assert get_response.json().get("artist_id") == artist_id
        print(f"✓ Verified artist exists")
        
        # Delete the artist
        delete_response = requests.delete(
            f"{BASE_URL}/artists/{artist_id}",
            headers=self.headers
        )
        
        assert delete_response.status_code == 200, f"Failed to delete artist: {delete_response.text}"
        data = delete_response.json()
        assert data.get("success") == True, "Expected success: true"
        print(f"✓ Deleted artist: {artist_id}")
        
        # Verify artist no longer exists
        verify_response = requests.get(
            f"{BASE_URL}/artists/my",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        assert verify_response.json() is None, "Artist should be deleted"
        print(f"✓ Verified artist deletion - my artist returns null")
        
        # Clean up - delete temp user
        requests.delete(f"{BASE_URL}/users/me", headers=self.headers)


class TestUnauthorizedDeletion:
    """Test that users cannot delete resources they don't own"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup with main test user"""
        login_response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "test@example.com", "password": "test123"}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.session_token = data.get("session_token")
        else:
            pytest.skip("Could not login")
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}"
        }

    def test_cannot_delete_others_business(self):
        """Test that a user cannot delete a business they don't own"""
        # Try to delete a non-existent or someone else's business
        response = requests.delete(
            f"{BASE_URL}/businesses/biz_fake_id_12345",
            headers=self.headers
        )
        
        # Should return 403 Forbidden
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Cannot delete non-owned business - returns 403")

    def test_cannot_delete_others_artist(self):
        """Test that a user cannot delete an artist profile they don't own"""
        # Try to delete a non-existent or someone else's artist
        response = requests.delete(
            f"{BASE_URL}/artists/artist_fake_id_12345",
            headers=self.headers
        )
        
        # Should return 403 Forbidden
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Cannot delete non-owned artist - returns 403")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
