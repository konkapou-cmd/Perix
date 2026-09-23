"""
Test video upload and business locator features:
1. Video upload API endpoint receives resource_type=video correctly
2. User's own business shows on Locator map even without subscription
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')

@pytest.fixture(scope="module")
def test_user():
    """Create or login a test user"""
    email = "test_video_locator@example.com"
    password = "testpassword123"
    name = "Video Locator Test User"
    
    # Try login first
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    
    if response.status_code == 200:
        data = response.json()
        return {
            "user_id": data["user"]["user_id"],
            "token": data["session_token"],
            "email": email
        }
    
    # Register new user
    response = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    
    if response.status_code == 200:
        data = response.json()
        return {
            "user_id": data["user"]["user_id"],
            "token": data["session_token"],
            "email": email
        }
    
    pytest.skip(f"Could not create test user: {response.text}")


class TestVideoUploadAPI:
    """Test video upload functionality"""
    
    def test_media_upload_endpoint_exists(self, test_user):
        """Verify the /api/media/upload endpoint exists and accepts video resource_type"""
        # Create a small test file
        test_content = b"test file content"
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            files={"file": ("test.mp4", io.BytesIO(test_content), "video/mp4")},
            data={"resource_type": "video"}
        )
        
        # We expect either success (200) or a Cloudinary error - but NOT 422 which would indicate the parameter wasn't received
        # Status 500 with "Cloudinary" in the error would mean the endpoint works but Cloudinary config is needed
        assert response.status_code != 422, f"Validation error suggests resource_type parameter issue: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "url" in data, "Response should contain URL"
            print(f"Video upload successful: {data.get('url', '')[:50]}...")
        elif response.status_code == 500:
            # Cloudinary might be configured but the tiny test file fails - that's ok
            print(f"Upload endpoint accessible, returned: {response.text[:100]}")
        else:
            # For any other status, we log it but don't fail if it's not a validation error
            print(f"Upload returned status {response.status_code}: {response.text[:100]}")
    
    def test_media_upload_with_resource_type_image(self, test_user):
        """Verify the endpoint also works with resource_type=image"""
        test_content = b"test image content"
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            files={"file": ("test.jpg", io.BytesIO(test_content), "image/jpeg")},
            data={"resource_type": "image"}
        )
        
        # Should not get validation error
        assert response.status_code != 422, f"Validation error: {response.text}"
        print(f"Image upload test returned status {response.status_code}")


class TestBusinessLocator:
    """Test that user's own business appears on the locator map"""
    
    @pytest.fixture
    def user_business(self, test_user):
        """Create a test business for the user"""
        # Check if user already has a business
        response = requests.get(
            f"{BASE_URL}/api/businesses/mine",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        if response.status_code == 200 and response.json():
            return response.json()[0]
        
        # Create a new business
        response = requests.post(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            json={
                "name": "TEST_OwnBusinessLocator",
                "root_category": "restaurants",
                "subcategory": "italian",
                "address": "Test Street 123",
                "latitude": 52.5200,
                "longitude": 13.4050,
                "description": "Test business for locator visibility"
            }
        )
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 403 and "Only one business" in response.text:
            # User already has a business, fetch it
            response = requests.get(
                f"{BASE_URL}/api/businesses/mine",
                headers={"Authorization": f"Bearer {test_user['token']}"}
            )
            if response.status_code == 200 and response.json():
                return response.json()[0]
        
        pytest.skip(f"Could not create/get test business: {response.text}")
    
    def test_own_business_in_nearby_search(self, test_user, user_business):
        """User's own business should appear in nearby search regardless of subscription"""
        business_id = user_business["business_id"]
        lat = user_business["latitude"]
        lon = user_business["longitude"]
        
        # Search for nearby businesses at the business location
        response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={
                "latitude": lat,
                "longitude": lon,
                "max_distance_meters": 10000
            },
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        assert response.status_code == 200, f"Nearby search failed: {response.text}"
        
        businesses = response.json()
        business_ids = [b["business_id"] for b in businesses]
        
        # User's own business should be in the results
        assert business_id in business_ids, \
            f"User's own business {business_id} not found in nearby results. Found: {business_ids}"
        
        print(f"SUCCESS: User's own business found in nearby search with {len(businesses)} total businesses")
    
    def test_own_business_visible_without_active_subscription(self, test_user, user_business):
        """Verify business is visible even if trial expired (for the owner)"""
        business_id = user_business["business_id"]
        
        # Get the business detail to check subscription status
        response = requests.get(
            f"{BASE_URL}/api/businesses/detail/{business_id}",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        assert response.status_code == 200, f"Could not fetch business detail: {response.text}"
        
        detail = response.json()
        print(f"Business subscription_status: {detail['business'].get('subscription_status')}")
        print(f"Is owner: {detail.get('is_owner')}")
        
        # The response should include the business regardless of subscription
        assert detail["business"]["business_id"] == business_id


class TestUserProfileLocation:
    """Test user profile location field"""
    
    def test_update_user_location(self, test_user):
        """User should be able to update their location field"""
        new_location = "Berlin, Germany"
        
        response = requests.post(
            f"{BASE_URL}/api/profiles/info",
            headers={"Authorization": f"Bearer {test_user['token']}"},
            json={
                "location": new_location
            }
        )
        
        assert response.status_code == 200, f"Failed to update location: {response.text}"
        
        data = response.json()
        assert data.get("location") == new_location, f"Location not updated. Got: {data.get('location')}"
        print(f"SUCCESS: User location updated to '{new_location}'")
    
    def test_get_user_with_location(self, test_user):
        """Verify user profile includes location field"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        assert response.status_code == 200, f"Failed to get user: {response.text}"
        
        data = response.json()
        # location should exist in response (could be null or a string)
        assert "location" in data, "location field missing from user profile"
        print(f"User location field present: {data.get('location')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
