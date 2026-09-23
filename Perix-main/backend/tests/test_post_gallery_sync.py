"""
Test Suite for Post → Gallery Synchronization
- Auto-add media to gallery on post creation
- Auto-remove media from gallery on post deletion
- 15 item gallery limit enforcement
- Deduplication logic
"""
import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')
# Override for Railway testing
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
        "name": f"TestGallerySync_{random_str}",
        "email": f"test_gallery_sync_{random_str}@test.com",
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
        "name": f"TestBusiness_Gallery_{random_str}",
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


class TestPostGallerySync:
    """Tests for post → gallery synchronization"""
    
    def test_post_creation_syncs_image_to_user_gallery(self, api_client, test_user):
        """When a user creates a post with an image, it should appear in their gallery"""
        headers = test_user["headers"]
        user_id = test_user["user"]["user_id"]
        
        # Get initial gallery count
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        initial_images = []
        if auth_response.status_code == 200:
            user_data = auth_response.json()
            initial_images = user_data.get("gallery_images", [])
        
        # Create a post with an image URL (using a test image URL)
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
        post_data = {
            "text": f"Test post with image {generate_random_string()}",
            "image_url": test_image_url,
            "actor_type": "user",
            "actor_id": user_id
        }
        
        response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        assert response.status_code in [200, 201], f"Post creation failed: {response.text}"
        post = response.json()
        assert post.get("image_url") == test_image_url
        
        # Verify image is in user's gallery
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        assert auth_response.status_code == 200
        user_data = auth_response.json()
        gallery_images = user_data.get("gallery_images", [])
        
        assert test_image_url in gallery_images, f"Image not found in gallery. Gallery: {gallery_images}"
        
        # Cleanup - delete the post
        post_id = post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_post_creation_syncs_video_to_user_gallery(self, api_client, test_user):
        """When a user creates a post with a video, it should appear in their gallery"""
        headers = test_user["headers"]
        user_id = test_user["user"]["user_id"]
        
        # Create a post with a video URL
        test_video_url = f"https://res.cloudinary.com/demo/video/upload/v1312461204/sample.mp4"
        post_data = {
            "text": f"Test post with video {generate_random_string()}",
            "video_url": test_video_url,
            "actor_type": "user",
            "actor_id": user_id
        }
        
        response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        assert response.status_code in [200, 201], f"Post creation failed: {response.text}"
        post = response.json()
        assert post.get("video_url") == test_video_url
        
        # Verify video is in user's gallery
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        assert auth_response.status_code == 200
        user_data = auth_response.json()
        gallery_videos = user_data.get("gallery_videos", [])
        
        assert test_video_url in gallery_videos, f"Video not found in gallery. Gallery: {gallery_videos}"
        
        # Cleanup
        post_id = post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_post_creation_syncs_image_to_business_gallery(self, api_client, test_user, test_business):
        """When a business creates a post with an image, it should appear in their gallery"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Create a post as the business
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/business_test.jpg"
        post_data = {
            "text": f"Business test post with image {generate_random_string()}",
            "image_url": test_image_url,
            "actor_type": "business",
            "actor_id": business_id,
            "business_id": business_id
        }
        
        response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        assert response.status_code in [200, 201], f"Business post creation failed: {response.text}"
        post = response.json()
        
        # Verify image is in business's gallery
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        assert biz_response.status_code == 200
        biz_data = biz_response.json()
        biz_gallery = biz_data.get("business", {}).get("gallery_images", [])
        
        assert test_image_url in biz_gallery, f"Image not found in business gallery. Gallery: {biz_gallery}"
        
        # Cleanup
        post_id = post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_post_creation_syncs_video_to_business_gallery(self, api_client, test_user, test_business):
        """When a business creates a post with a video, it should appear in their gallery"""
        headers = test_user["headers"]
        business_id = test_business.get("business_id")
        
        # Create a post as the business
        test_video_url = f"https://res.cloudinary.com/demo/video/upload/v1312461204/business_test.mp4"
        post_data = {
            "text": f"Business test post with video {generate_random_string()}",
            "video_url": test_video_url,
            "actor_type": "business",
            "actor_id": business_id,
            "business_id": business_id
        }
        
        response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        assert response.status_code in [200, 201], f"Business post creation failed: {response.text}"
        post = response.json()
        
        # Verify video is in business's gallery
        biz_response = api_client.get(f"{API_BASE}/businesses/{business_id}", headers=headers)
        assert biz_response.status_code == 200
        biz_data = biz_response.json()
        biz_gallery = biz_data.get("business", {}).get("gallery_videos", [])
        
        assert test_video_url in biz_gallery, f"Video not found in business gallery. Gallery: {biz_gallery}"
        
        # Cleanup
        post_id = post.get("post_id")
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_post_deletion_removes_from_user_gallery(self, api_client, test_user):
        """When a post with media is deleted, media should be removed from gallery"""
        headers = test_user["headers"]
        user_id = test_user["user"]["user_id"]
        
        # Create a post with an image
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/delete_test.jpg"
        post_data = {
            "text": f"Post to be deleted {generate_random_string()}",
            "image_url": test_image_url,
            "actor_type": "user",
            "actor_id": user_id
        }
        
        response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        assert response.status_code in [200, 201], f"Post creation failed: {response.text}"
        post = response.json()
        post_id = post.get("post_id")
        
        # Verify image is in gallery
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        user_data = auth_response.json()
        assert test_image_url in user_data.get("gallery_images", [])
        
        # Delete the post
        delete_response = api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
        assert delete_response.status_code in [200, 204], f"Post deletion failed: {delete_response.text}"
        
        # Verify image is NO LONGER in gallery
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        user_data = auth_response.json()
        gallery_images = user_data.get("gallery_images", [])
        
        assert test_image_url not in gallery_images, f"Image should have been removed from gallery but is still there: {gallery_images}"
    
    def test_gallery_limit_15_items(self, api_client, test_user):
        """Gallery should be limited to 15 items"""
        headers = test_user["headers"]
        user_id = test_user["user"]["user_id"]
        
        # Create 20 posts with different images
        created_posts = []
        for i in range(20):
            test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/limit_test_{i}.jpg"
            post_data = {
                "text": f"Limit test post {i} {generate_random_string()}",
                "image_url": test_image_url,
                "actor_type": "user",
                "actor_id": user_id
            }
            
            response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
            if response.status_code in [200, 201]:
                post = response.json()
                created_posts.append((post.get("post_id"), test_image_url))
        
        # Check gallery count
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        user_data = auth_response.json()
        gallery_images = user_data.get("gallery_images", [])
        
        assert len(gallery_images) <= 15, f"Gallery should have max 15 items but has {len(gallery_images)}"
        
        # Cleanup
        for post_id, _ in created_posts:
            if post_id:
                api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
    
    def test_gallery_deduplication(self, api_client, test_user):
        """Same image URL should not appear twice in gallery"""
        headers = test_user["headers"]
        user_id = test_user["user"]["user_id"]
        
        # Create multiple posts with the SAME image URL
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/dedup_test.jpg"
        
        for i in range(3):
            post_data = {
                "text": f"Duplicate test post {i} {generate_random_string()}",
                "image_url": test_image_url,
                "actor_type": "user",
                "actor_id": user_id
            }
            response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        
        # Check gallery - image should appear only once
        auth_response = api_client.get(f"{API_BASE}/auth/me", headers=headers)
        user_data = auth_response.json()
        gallery_images = user_data.get("gallery_images", [])
        
        count = gallery_images.count(test_image_url)
        assert count == 1, f"Image should appear exactly once but appears {count} times. Gallery: {gallery_images}"
        
        # Cleanup - delete posts with this image
        posts_response = api_client.get(f"{API_BASE}/posts", headers=headers)
        if posts_response.status_code == 200:
            posts = posts_response.json()
            for post in posts:
                if isinstance(post, dict) and post.get("image_url") == test_image_url:
                    post_id = post.get("post_id")
                    if post_id:
                        api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)


class TestFeedImageUrl:
    """Tests for feed API including image_url field"""
    
    def test_feed_includes_image_url(self, api_client, test_user):
        """Home feed should include image_url field in posts"""
        headers = test_user["headers"]
        user_id = test_user["user"]["user_id"]
        
        # Create a post with image
        test_image_url = f"https://res.cloudinary.com/demo/image/upload/v1312461204/feed_test.jpg"
        post_data = {
            "text": f"Feed test post {generate_random_string()}",
            "image_url": test_image_url,
            "actor_type": "user",
            "actor_id": user_id
        }
        
        response = api_client.post(f"{API_BASE}/posts", json=post_data, headers=headers)
        assert response.status_code in [200, 201], f"Post creation failed: {response.text}"
        post = response.json()
        post_id = post.get("post_id")
        
        # Get home feed with bounds parameters
        feed_response = api_client.get(
            f"{API_BASE}/feed/home?min_lat=40&max_lat=41&min_lng=-75&max_lng=-73",
            headers=headers
        )
        assert feed_response.status_code == 200, f"Feed request failed: {feed_response.text}"
        feed_data = feed_response.json()
        
        # Find our post in the feed
        posts = feed_data.get("posts", [])
        our_post = None
        for p in posts:
            if isinstance(p, dict) and p.get("post_id") == post_id:
                our_post = p
                break
        
        assert our_post is not None, f"Post not found in feed. Available posts: {[p.get('post_id') if isinstance(p, dict) else 'unknown' for p in posts]}"
        assert "image_url" in our_post, f"image_url field missing from feed post. Post keys: {our_post.keys()}"
        assert our_post["image_url"] == test_image_url, f"image_url mismatch: {our_post.get('image_url')} != {test_image_url}"
        
        # Cleanup
        if post_id:
            api_client.delete(f"{API_BASE}/posts/{post_id}", headers=headers)
