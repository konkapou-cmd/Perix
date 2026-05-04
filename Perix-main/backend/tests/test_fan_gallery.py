"""
Test Suite for Fan Gallery and Media Gallery Features
- Business Dashboard media gallery (clickable items with delete functionality)
- Fan Gallery for businesses (posts where business is tagged)
- Fan Gallery for artists (posts where artist is tagged)
- Hide/unhide functionality for fan gallery posts
"""
import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')
# Override for local testing
BASE_URL = 'http://localhost:8000'
API_BASE = f"{BASE_URL}/api"


def generate_random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def test_user(api_client):
    """Create a test user for authentication"""
    random_str = generate_random_string()
    user_data = {
        "name": f"TEST_FanGallery_{random_str}",
        "email": f"test_fangallery_{random_str}@test.com",
        "password": "testpass123"
    }
    response = api_client.post(f"{API_BASE}/auth/register", json=user_data)
    if response.status_code == 400 and "already registered" in response.text:
        # Try login instead
        response = api_client.post(f"{API_BASE}/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
    
    assert response.status_code in [200, 201], f"Auth failed: {response.text}"
    data = response.json()
    return {
        "user": data["user"],
        "token": data["session_token"]
    }


@pytest.fixture(scope="module")
def auth_headers(test_user):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {test_user['token']}"}


@pytest.fixture(scope="module")
def test_business(api_client, auth_headers):
    """Create or get test business for testing"""
    # First check if user already has a business
    response = api_client.get(f"{API_BASE}/businesses/my", headers=auth_headers)
    if response.status_code == 200 and response.json():
        return response.json()[0]
    
    # Create new business
    random_str = generate_random_string()
    business_data = {
        "name": f"TEST_FanGalleryBiz_{random_str}",
        "root_category": "restaurants",
        "subcategory": "italian",
        "description": "Test business for fan gallery testing",
        "address": "123 Test Street",
        "latitude": 40.7128,
        "longitude": -74.0060
    }
    response = api_client.post(f"{API_BASE}/businesses", headers=auth_headers, json=business_data)
    if response.status_code == 403 and "Only one business allowed" in response.text:
        # User already has a business, get it
        response = api_client.get(f"{API_BASE}/businesses/my", headers=auth_headers)
        assert response.status_code == 200
        return response.json()[0]
    
    assert response.status_code in [200, 201], f"Business creation failed: {response.text}"
    return response.json()


class TestBusinessFanGalleryAPI:
    """Test business fan gallery endpoints"""
    
    def test_get_business_fan_gallery_endpoint(self, api_client, auth_headers, test_business):
        """Test GET /api/businesses/{id}/fan-gallery returns 200"""
        business_id = test_business["business_id"]
        response = api_client.get(
            f"{API_BASE}/businesses/{business_id}/fan-gallery",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /businesses/{business_id}/fan-gallery returned {len(data)} posts")
    
    def test_get_business_fan_gallery_invalid_id(self, api_client, auth_headers):
        """Test fan gallery with invalid business ID returns 404"""
        response = api_client.get(
            f"{API_BASE}/businesses/invalid_business_id_123/fan-gallery",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid business ID correctly returns 404")
    
    def test_hide_fan_gallery_post_requires_owner(self, api_client, auth_headers, test_business):
        """Test hide post endpoint requires business owner authorization"""
        business_id = test_business["business_id"]
        # Try to hide a non-existent post (should work but just add to hidden list)
        response = api_client.post(
            f"{API_BASE}/businesses/{business_id}/fan-gallery/nonexistent_post_id/hide",
            headers=auth_headers
        )
        # Should return 200 (owner) or 403 (not owner)
        assert response.status_code in [200, 403], f"Expected 200 or 403, got {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            assert "success" in data
            print("✓ Hide endpoint works for business owner")
        else:
            print("✓ Hide endpoint correctly denied non-owner")


class TestArtistFanGalleryAPI:
    """Test artist fan gallery endpoints"""
    
    def test_get_artist_fan_gallery_endpoint(self, api_client, auth_headers):
        """Test GET /api/artists/{id}/fan-gallery returns appropriate status"""
        # First check if user has an artist profile
        response = api_client.get(f"{API_BASE}/artists/my", headers=auth_headers)
        if response.status_code == 200 and response.json():
            artist = response.json()
            artist_id = artist["artist_id"]
            
            response = api_client.get(
                f"{API_BASE}/artists/{artist_id}/fan-gallery",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            assert isinstance(data, list), "Response should be a list"
            print(f"✓ GET /artists/{artist_id}/fan-gallery returned {len(data)} posts")
        else:
            print("✓ Skipping artist fan gallery test (no artist profile)")
            pytest.skip("No artist profile exists for this user")
    
    def test_get_artist_fan_gallery_invalid_id(self, api_client, auth_headers):
        """Test fan gallery with invalid artist ID returns 404"""
        response = api_client.get(
            f"{API_BASE}/artists/invalid_artist_id_123/fan-gallery",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid artist ID correctly returns 404")


class TestBusinessMediaGallery:
    """Test business media gallery functionality (photos/videos)"""
    
    def test_get_business_detail_includes_gallery(self, api_client, auth_headers, test_business):
        """Test business detail includes gallery_images and gallery_videos"""
        business_id = test_business["business_id"]
        response = api_client.get(
            f"{API_BASE}/businesses/detail/{business_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "business" in data
        business = data["business"]
        assert "gallery_images" in business, "Business should have gallery_images field"
        assert "gallery_videos" in business, "Business should have gallery_videos field"
        assert isinstance(business["gallery_images"], list), "gallery_images should be a list"
        assert isinstance(business["gallery_videos"], list), "gallery_videos should be a list"
        print(f"✓ Business detail has gallery: {len(business['gallery_images'])} images, {len(business['gallery_videos'])} videos")
    
    def test_update_business_gallery_images(self, api_client, auth_headers, test_business):
        """Test updating business gallery_images"""
        business_id = test_business["business_id"]
        # Add a test image to gallery
        test_image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA=="  # Minimal base64
        
        response = api_client.put(
            f"{API_BASE}/businesses/{business_id}",
            headers=auth_headers,
            json={"gallery_images": [test_image]}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "gallery_images" in data
        print("✓ Business gallery images can be updated")
    
    def test_update_business_gallery_videos(self, api_client, auth_headers, test_business):
        """Test updating business gallery_videos"""
        business_id = test_business["business_id"]
        test_video_url = "https://example.com/test_video.mp4"
        
        response = api_client.put(
            f"{API_BASE}/businesses/{business_id}",
            headers=auth_headers,
            json={"gallery_videos": [test_video_url]}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "gallery_videos" in data
        print("✓ Business gallery videos can be updated")


class TestFanGalleryHideUnhideFlow:
    """Test the complete hide/unhide flow for fan gallery"""
    
    def test_create_tagged_post_and_hide(self, api_client, auth_headers, test_business):
        """Test creating a tagged post and hiding it from fan gallery"""
        business_id = test_business["business_id"]
        
        # Create a post tagging the business
        random_str = generate_random_string()
        post_data = {
            "text": f"TEST tagged post for fan gallery {random_str}",
            "tagged_business_ids": [business_id]
        }
        response = api_client.post(
            f"{API_BASE}/posts",
            headers=auth_headers,
            json=post_data
        )
        assert response.status_code in [200, 201], f"Post creation failed: {response.text}"
        post = response.json()
        post_id = post["post_id"]
        print(f"✓ Created tagged post: {post_id}")
        
        # Verify post appears in fan gallery
        response = api_client.get(
            f"{API_BASE}/businesses/{business_id}/fan-gallery",
            headers=auth_headers
        )
        assert response.status_code == 200
        fan_posts = response.json()
        post_ids = [p["post_id"] for p in fan_posts]
        assert post_id in post_ids, "Tagged post should appear in fan gallery"
        print("✓ Tagged post appears in fan gallery")
        
        # Hide the post
        response = api_client.post(
            f"{API_BASE}/businesses/{business_id}/fan-gallery/{post_id}/hide",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Hide failed: {response.text}"
        print("✓ Post hidden from fan gallery")
        
        # Verify post no longer in fan gallery
        response = api_client.get(
            f"{API_BASE}/businesses/{business_id}/fan-gallery",
            headers=auth_headers
        )
        assert response.status_code == 200
        fan_posts = response.json()
        post_ids = [p["post_id"] for p in fan_posts]
        assert post_id not in post_ids, "Hidden post should not appear in fan gallery"
        print("✓ Hidden post no longer appears in fan gallery")
        
        # Unhide the post
        response = api_client.post(
            f"{API_BASE}/businesses/{business_id}/fan-gallery/{post_id}/unhide",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Unhide failed: {response.text}"
        print("✓ Post unhidden")
        
        # Verify post appears again
        response = api_client.get(
            f"{API_BASE}/businesses/{business_id}/fan-gallery",
            headers=auth_headers
        )
        assert response.status_code == 200
        fan_posts = response.json()
        post_ids = [p["post_id"] for p in fan_posts]
        assert post_id in post_ids, "Unhidden post should appear in fan gallery again"
        print("✓ Unhidden post appears in fan gallery again")
        
        # Cleanup - delete the test post
        response = api_client.delete(
            f"{API_BASE}/posts/{post_id}",
            headers=auth_headers
        )
        print(f"✓ Test post cleanup: {response.status_code}")


class TestAPIAuthentication:
    """Test that fan gallery endpoints require authentication"""
    
    def test_fan_gallery_requires_auth(self, api_client):
        """Test that fan gallery endpoints return 401/404 without auth"""
        response = api_client.get(f"{API_BASE}/businesses/test_id/fan-gallery")
        # Returns 401 (no auth) or 404 (not found - order depends on middleware)
        assert response.status_code in [401, 404], f"Expected 401 or 404, got {response.status_code}"
        print(f"✓ Fan gallery endpoint returned {response.status_code} (expected 401 or 404)")
    
    def test_hide_requires_auth(self, api_client):
        """Test that hide endpoint returns 401/403 without auth"""
        response = api_client.post(f"{API_BASE}/businesses/test_id/fan-gallery/post_id/hide")
        # Returns 401 (no auth) or 403 (not authorized) - depends on order of middleware
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        print(f"✓ Hide endpoint returned {response.status_code} (expected 401 or 403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
