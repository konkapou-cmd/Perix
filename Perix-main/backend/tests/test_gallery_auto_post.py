"""
Test Suite for Gallery → Post Auto-Synchronization
- Auto-create post when media is added to gallery
- Verify post text matches expected format
- Verify auto-created posts appear in feed
"""
import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')
BASE_URL = 'https://backend-production-1968.up.railway.app'
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
        "name": f"TestGalleryAutoPost_{random_str}",
        "email": f"test_gallery_autopost_{random_str}@test.com",
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
        "name": f"TestBusiness_AutoPost_{random_str}",
        "root_category": "restaurants",
        "subcategory": "italian",
        "address": "123 Test Street",
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


class TestGalleryAutoPost:
    """Tests for auto-post creation when media is added to gallery"""
    
    def test_gallery_upload_creates_auto_post_for_image(self, api_client, test_user):
        """When a user adds an image directly to gallery, an auto-post should be created"""
        headers = test_user["headers"]
        
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/auto_post_test.jpg"
        
        # Add image directly to gallery
        response = api_client.post(
            f"{API_BASE}/profiles/gallery",
            json={"images": [test_image_url]},
            headers=headers
        )
        assert response.status_code == 200, f"Gallery update failed: {response.text}"
        
        # Wait briefly for async post creation
        import time
        time.sleep(0.5)
        
        # Check that a post was created with the expected text
        posts_response = api_client.get(f"{API_BASE}/posts", headers=headers)
        assert posts_response.status_code == 200, f"Failed to get posts: {posts_response.text}"
        posts = posts_response.json()
        
        # Find the auto-created post
        auto_post = None
        for post in posts:
            if isinstance(post, dict) and post.get("image_url") == test_image_url:
                auto_post = post
                break
        
        assert auto_post is not None, f"Auto-post not found. Available posts: {[(p.get('post_id'), p.get('text'), p.get('image_url')) if isinstance(p, dict) else 'unknown' for p in posts]}"
        assert auto_post.get("text") == "📸 New photo added to gallery", f"Unexpected post text: {auto_post.get('text')}"
        assert auto_post.get("image_url") == test_image_url
        
        # Cleanup
        post_id = auto_post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_gallery_upload_creates_auto_post_for_video(self, api_client, test_user):
        """When a user adds a video directly to gallery, an auto-post should be created"""
        headers = test_user["headers"]
        
        test_video_url = f"https://res.cloudinary.com/demo/video/upload/v1312461204/auto_post_test.mp4"
        
        # Add video directly to gallery
        response = api_client.post(
            f"{API_BASE}/profiles/gallery",
            json={"videos": [test_video_url]},
            headers=headers
        )
        assert response.status_code == 200, f"Gallery update failed: {response.text}"
        
        # Wait briefly for async post creation
        import time
        time.sleep(0.5)
        
        # Check that a post was created with the expected text
        posts_response = api_client.get(f"{API_BASE}/posts", headers=headers)
        assert posts_response.status_code == 200, f"Failed to get posts: {posts_response.text}"
        posts = posts_response.json()
        
        # Find the auto-created post
        auto_post = None
        for post in posts:
            if isinstance(post, dict) and post.get("video_url") == test_video_url:
                auto_post = post
                break
        
        assert auto_post is not None, f"Auto-post not found for video"
        assert auto_post.get("text") == "🎬 New video added to gallery", f"Unexpected post text: {auto_post.get('text')}"
        assert auto_post.get("video_url") == test_video_url
        
        # Cleanup
        post_id = auto_post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_business_gallery_upload_creates_auto_post(self, api_client, test_user, test_business):
        """When a business adds an image to gallery, an auto-post should be created"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/biz_auto_post_test.jpg"
        
        # Add image to business gallery
        response = api_client.post(
            f"{API_BASE}/businesses/{business_id}/gallery",
            json={"images": [test_image_url]},
            headers=headers
        )
        assert response.status_code == 200, f"Business gallery update failed: {response.text}"
        
        # Wait briefly for async post creation
        import time
        time.sleep(0.5)
        
        # Check that a post was created
        posts_response = api_client.get(f"{API_BASE}/posts", headers=headers)
        assert posts_response.status_code == 200, f"Failed to get posts: {posts_response.text}"
        posts = posts_response.json()
        
        # Find the auto-created business post
        auto_post = None
        for post in posts:
            if isinstance(post, dict) and post.get("image_url") == test_image_url and post.get("actor_type") == "business":
                auto_post = post
                break
        
        assert auto_post is not None, f"Auto-post not found for business"
        assert auto_post.get("text") == "📸 New photo added to gallery"
        assert auto_post.get("business_id") == business_id
        
        # Cleanup
        post_id = auto_post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_auto_post_appears_in_feed(self, api_client, test_user):
        """Auto-created post should appear in the user's feed"""
        headers = test_user["headers"]
        
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/feed_auto_post.jpg"
        
        # Add image to gallery
        response = api_client.post(
            f"{API_BASE}/profiles/gallery",
            json={"images": [test_image_url]},
            headers=headers
        )
        assert response.status_code == 200
        
        # Wait for post creation
        import time
        time.sleep(0.5)
        
        # Get home feed
        feed_response = api_client.get(
            f"{API_BASE}/feed/home?min_lat=40&max_lat=41&min_lng=-75&max_lng=-73",
            headers=headers
        )
        assert feed_response.status_code == 200, f"Feed request failed: {feed_response.text}"
        feed_data = feed_response.json()
        
        posts = feed_data.get("posts", [])
        auto_post = None
        for p in posts:
            if isinstance(p, dict) and p.get("image_url") == test_image_url:
                auto_post = p
                break
        
        assert auto_post is not None, f"Auto-post not found in feed"
        assert auto_post.get("text") == "📸 New photo added to gallery"
        
        # Cleanup
        post_id = auto_post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
