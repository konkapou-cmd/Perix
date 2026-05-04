"""
Test Suite for Business Gallery API
- POST /businesses/{business_id}/gallery endpoint
- Add/remove images and videos
- 15 item gallery limit enforcement
- Deduplication
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
        "name": f"TestBizGallery_{random_str}",
        "email": f"test_biz_gallery_{random_str}@test.com",
        "password": "testpass123"
    }
    response = api_client.post(f"{API_BASE}/auth/register", json=user_data)
    if response.status_code == 400 and "already registered" in response.text:
        response = api_client.post(f"{API_BASE}/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
    
    assert response.status_code in [200, 201], f"Auth failed: {response.text}"
    data = response.json()
    return {
        "user": data["user"],
        "session_token": data.get("session_token") or data.get("session", {}).get("session_token"),
        "headers": {"Authorization": f"Bearer {data.get('session_token') or data.get('session', {}).get('session_token')}"}
    }


@pytest.fixture(scope="module")
def test_business(api_client, test_user):
    """Create a test business"""
    random_str = generate_random_string()
    business_data = {
        "name": f"TestBizGallery_{random_str}",
        "root_category": "restaurants",
        "subcategory": "italian",
        "address": "123 Gallery Test Street",
        "latitude": 40.7128,
        "longitude": -74.0060
    }
    headers = test_user["headers"]
    response = api_client.post(f"{API_BASE}/businesses", json=business_data, headers=headers)
    
    if response.status_code == 400 and "already registered" in response.text:
        response = api_client.get(f"{API_BASE}/businesses/my", headers=headers)
    
    assert response.status_code in [200, 201], f"Business creation failed: {response.text}"
    data = response.json()
    business = data if isinstance(data, dict) and "business_id" in data else data.get("business") or data[0]
    return business


class TestBusinessGalleryAPI:
    """Tests for business gallery API endpoint"""
    
    def test_update_business_gallery_add_image(self, api_client, test_user, test_business):
        """Add an image to business gallery via gallery endpoint"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Get initial gallery
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        initial_images = biz_data.get("business", {}).get("gallery_images", [])
        
        # Add image via gallery endpoint
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/gallery_add.jpg"
        gallery_data = {
            "images": [test_image_url]
        }
        
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
        assert response.status_code == 200, f"Gallery update failed: {response.text}"
        
        # Verify image was added
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        updated_images = biz_data.get("business", {}).get("gallery_images", [])
        
        assert test_image_url in updated_images, f"Image not found in gallery. Gallery: {updated_images}"
    
    def test_update_business_gallery_add_video(self, api_client, test_user, test_business):
        """Add a video to business gallery via gallery endpoint"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Add video via gallery endpoint
        test_video_url = f"https://res.cloudinary.com/demo/video/upload/v1312461204/gallery_add.mp4"
        gallery_data = {
            "videos": [test_video_url]
        }
        
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
        assert response.status_code == 200, f"Gallery update failed: {response.text}"
        
        # Verify video was added
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        updated_videos = biz_data.get("business", {}).get("gallery_videos", [])
        
        assert test_video_url in updated_videos, f"Video not found in gallery. Gallery: {updated_videos}"
    
    def test_update_business_gallery_remove_image(self, api_client, test_user, test_business):
        """Remove an image from business gallery via gallery endpoint"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # First add an image
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/gallery_remove.jpg"
        gallery_data = {"images": [test_image_url]}
        api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
        
        # Verify it was added
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        assert test_image_url in biz_data.get("business", {}).get("gallery_images", [])
        
        # Now remove it
        remove_data = {"remove_images": [test_image_url]}
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=remove_data, headers=headers)
        assert response.status_code == 200, f"Gallery removal failed: {response.text}"
        
        # Verify it was removed
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        updated_images = biz_data.get("business", {}).get("gallery_images", [])
        
        assert test_image_url not in updated_images, f"Image should have been removed but is still in gallery: {updated_images}"
    
    def test_update_business_gallery_remove_video(self, api_client, test_user, test_business):
        """Remove a video from business gallery via gallery endpoint"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # First add a video
        test_video_url = f"https://res.cloudinary.com/demo/video/upload/v1312461204/gallery_remove.mp4"
        gallery_data = {"videos": [test_video_url]}
        api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
        
        # Verify it was added
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        assert test_video_url in biz_data.get("business", {}).get("gallery_videos", [])
        
        # Now remove it
        remove_data = {"remove_videos": [test_video_url]}
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=remove_data, headers=headers)
        assert response.status_code == 200, f"Gallery removal failed: {response.text}"
        
        # Verify it was removed
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        updated_videos = biz_data.get("business", {}).get("gallery_videos", [])
        
        assert test_video_url not in updated_videos, f"Video should have been removed but is still in gallery: {updated_videos}"
    
    def test_business_gallery_limit_15_images(self, api_client, test_user, test_business):
        """Business gallery should be limited to 15 images"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Try to add 20 images
        added_images = []
        for i in range(20):
            test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/limit_{i}.jpg"
            gallery_data = {"images": [test_image_url]}
            response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
            if response.status_code == 200:
                added_images.append(test_image_url)
        
        # Check gallery count
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        gallery_images = biz_data.get("business", {}).get("gallery_images", [])
        
        assert len(gallery_images) <= 15, f"Gallery should have max 15 images but has {len(gallery_images)}"
        
        # Cleanup - remove all added images
        if gallery_images:
            remove_data = {"remove_images": gallery_images}
            api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=remove_data, headers=headers)
    
    def test_business_gallery_limit_15_videos(self, api_client, test_user, test_business):
        """Business gallery should be limited to 15 videos"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Try to add 20 videos
        added_videos = []
        for i in range(20):
            test_video_url = f"https://res.cloudinary.com/demo/video/upload/v1312461204/limit_{i}.mp4"
            gallery_data = {"videos": [test_video_url]}
            response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
            if response.status_code == 200:
                added_videos.append(test_video_url)
        
        # Check gallery count
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        gallery_videos = biz_data.get("business", {}).get("gallery_videos", [])
        
        assert len(gallery_videos) <= 15, f"Gallery should have max 15 videos but has {len(gallery_videos)}"
        
        # Cleanup - remove all added videos
        if gallery_videos:
            remove_data = {"remove_videos": gallery_videos}
            api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=remove_data, headers=headers)
    
    def test_business_gallery_deduplication(self, api_client, test_user, test_business):
        """Same image URL should not appear twice in business gallery"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Add the same image 3 times
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/dedup.jpg"
        for i in range(3):
            gallery_data = {"images": [test_image_url]}
            api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
        
        # Check gallery - image should appear only once
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        gallery_images = biz_data.get("business", {}).get("gallery_images", [])
        
        count = gallery_images.count(test_image_url)
        assert count == 1, f"Image should appear exactly once but appears {count} times"
        
        # Cleanup
        if test_image_url in gallery_images:
            remove_data = {"remove_images": [test_image_url]}
            api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=remove_data, headers=headers)
    
    def test_business_gallery_requires_auth(self, api_client, test_business):
        """Gallery update should require authentication"""
        business_id = test_business.get("business_id")
        
        gallery_data = {"images": ["https://example.com/image.jpg"]}
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data)
        
        assert response.status_code in [401, 403], f"Expected auth error but got {response.status_code}"
    
    def test_business_gallery_requires_owner(self, api_client, test_user, test_business):
        """Gallery update should only work for business owner"""
        business_id = test_business.get("business_id")
        
        # Create another user
        random_str = generate_random_string()
        other_user_data = {
            "name": f"OtherUser_{random_str}",
            "email": f"other_user_{random_str}@test.com",
            "password": "testpass123"
        }
        response = api_client.post(f"{API_BASE}/auth/register", json=other_user_data)
        if response.status_code == 400 and "already registered" in response.text:
            response = api_client.post(f"{API_BASE}/auth/login", json={
                "email": other_user_data["email"],
                "password": other_user_data["password"]
            })
        
        other_data = response.json()
        other_token = other_data.get("session_token") or other_data.get("session", {}).get("session_token")
        other_headers = {"Authorization": f"Bearer {other_token}"}
        
        # Try to update gallery as non-owner
        gallery_data = {"images": ["https://example.com/image.jpg"]}
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=other_headers)
        
        assert response.status_code in [401, 403], f"Expected auth error but got {response.status_code}"
    
    def test_update_business_gallery_combined_operations(self, api_client, test_user, test_business):
        """Test adding and removing in same request"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # First add some images
        initial_images = [f"https://res.cloudinary.com/demo/image/upload/v1312461204/initial_{i}.jpg" for i in range(5)]
        for img in initial_images:
            api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json={"images": [img]}, headers=headers)
        
        # Now add more and remove some
        add_images = [f"https://res.cloudinary.com/demo/image/upload/v1312461204/add_{i}.jpg" for i in range(3)]
        remove_images = initial_images[:2]
        
        gallery_data = {
            "images": add_images,
            "remove_images": remove_images
        }
        
        response = api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=gallery_data, headers=headers)
        assert response.status_code == 200, f"Combined gallery update failed: {response.text}"
        
        # Verify results
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        biz_data = biz_response.json()
        gallery_images = biz_data.get("business", {}).get("gallery_images", [])
        
        # New images should be present
        for img in add_images:
            assert img in gallery_images, f"Added image {img} not in gallery"
        
        # Removed images should not be present
        for img in remove_images:
            assert img not in gallery_images, f"Removed image {img} still in gallery"
        
        # Cleanup
        remove_data = {"remove_images": gallery_images}
        api_client.post(f"{API_BASE}/businesses/{business_id}/gallery", json=remove_data, headers=headers)
