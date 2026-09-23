"""
Test suite for Music API and Profile Gallery API fixes.
Tests the critical bugs reported:
- Music API integration (fallback tracks)
- Profile gallery uploads
- Auth API with gallery_items field
- Text post creation
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "test-user@test.com"
TEST_PASSWORD = "testpassword"


class TestMusicAPI:
    """Tests for Music API - Jamendo integration with fallback tracks."""
    
    def test_music_featured_returns_fallback_tracks(self):
        """GET /api/music/featured - should return fallback tracks when Jamendo not configured."""
        response = requests.get(f"{BASE_URL}/api/music/featured?limit=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "tracks" in data, "Response should contain 'tracks' field"
        tracks = data["tracks"]
        assert len(tracks) > 0, "Should return at least one track"
        
        # Verify track structure
        first_track = tracks[0]
        assert "id" in first_track, "Track should have 'id'"
        assert "name" in first_track, "Track should have 'name'"
        assert "artist_name" in first_track, "Track should have 'artist_name'"
        assert "audio_url" in first_track, "Track should have 'audio_url'"
        assert "duration" in first_track, "Track should have 'duration'"
        
        # Verify fallback tracks (from soundhelix)
        assert first_track["id"].startswith("fallback_"), f"Expected fallback track, got {first_track['id']}"
        assert "soundhelix.com" in first_track["audio_url"], "Fallback tracks should use soundhelix.com"
    
    def test_music_search_returns_tracks(self):
        """GET /api/music/search?query=chill - should return tracks."""
        response = requests.get(f"{BASE_URL}/api/music/search?query=chill")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "tracks" in data, "Response should contain 'tracks' field"
        assert "total" in data, "Response should contain 'total' field"
        assert "page" in data, "Response should contain 'page' field"
        assert "per_page" in data, "Response should contain 'per_page' field"
        
        tracks = data["tracks"]
        assert len(tracks) > 0, "Should return at least one track"
        
        # Verify pagination info
        assert data["page"] >= 1, "Page should be >= 1"
        assert data["per_page"] > 0, "per_page should be > 0"
        assert data["total"] >= len(tracks), "total should be >= returned tracks count"
    
    def test_music_genres_endpoint(self):
        """GET /api/music/genres - should return available genres."""
        response = requests.get(f"{BASE_URL}/api/music/genres")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "genres" in data, "Response should contain 'genres' field"
        genres = data["genres"]
        assert len(genres) > 0, "Should return at least one genre"
        assert "pop" in genres, "Genres should include 'pop'"
        assert "electronic" in genres, "Genres should include 'electronic'"
    
    def test_music_moods_endpoint(self):
        """GET /api/music/moods - should return available moods."""
        response = requests.get(f"{BASE_URL}/api/music/moods")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "moods" in data, "Response should contain 'moods' field"
        moods = data["moods"]
        assert len(moods) > 0, "Should return at least one mood"
        assert "happy" in moods, "Moods should include 'happy'"
        assert "calm" in moods, "Moods should include 'calm'"


class TestAuthAPI:
    """Tests for Auth API with gallery_items field."""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.text}")
        data = response.json()
        return data.get("session_token")
    
    def test_login_returns_user_with_gallery_items(self):
        """POST /api/auth/login - should return user with gallery_items field."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user" in data, "Response should contain 'user' field"
        assert "session_token" in data, "Response should contain 'session_token' field"
        
        user = data["user"]
        assert "user_id" in user, "User should have 'user_id'"
        assert "email" in user, "User should have 'email'"
        assert "gallery_images" in user, "User should have 'gallery_images' field"
        assert "gallery_items" in user, "User should have 'gallery_items' field"
        assert "video_items" in user, "User should have 'video_items' field"
    
    def test_auth_me_returns_user_with_gallery_items(self, auth_token):
        """GET /api/auth/me - should return user with gallery_items field."""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        user = response.json()
        assert "user_id" in user, "User should have 'user_id'"
        assert "email" in user, "User should have 'email'"
        assert user["email"] == TEST_EMAIL, f"Expected email {TEST_EMAIL}, got {user['email']}"
        
        # Verify gallery fields
        assert "gallery_images" in user, "User should have 'gallery_images' field"
        assert "gallery_items" in user, "User should have 'gallery_items' field"
        assert "video_items" in user, "User should have 'video_items' field"
        
        # gallery_images should be a list
        assert isinstance(user["gallery_images"], list), "gallery_images should be a list"
        assert isinstance(user["gallery_items"], list), "gallery_items should be a list"
        assert isinstance(user["video_items"], list), "video_items should be a list"


class TestPostsAPI:
    """Tests for Posts API - text post creation."""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.text}")
        data = response.json()
        return data.get("session_token")
    
    @pytest.fixture
    def cleanup_post(self, auth_token):
        """Fixture to cleanup created posts."""
        created_post_ids = []
        yield created_post_ids
        # Cleanup after test
        for post_id in created_post_ids:
            requests.delete(
                f"{BASE_URL}/api/posts/{post_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
    
    def test_create_text_post(self, auth_token, cleanup_post):
        """POST /api/posts - create a text post."""
        unique_text = f"TEST_text_post_{uuid.uuid4().hex[:8]}_{datetime.now().isoformat()}"
        
        response = requests.post(
            f"{BASE_URL}/api/posts",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"text": unique_text}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        post = response.json()
        
        # Mark for cleanup
        cleanup_post.append(post["post_id"])
        
        # Verify post structure
        assert "post_id" in post, "Post should have 'post_id'"
        assert "user_id" in post, "Post should have 'user_id'"
        assert "text" in post, "Post should have 'text'"
        assert post["text"] == unique_text, f"Expected text '{unique_text}', got '{post['text']}'"
        
        # Verify actor info
        assert "actor_type" in post, "Post should have 'actor_type'"
        assert post["actor_type"] == "user", "Default actor_type should be 'user'"
        assert "actor_name" in post, "Post should have 'actor_name'"
        
        # Verify timestamps
        assert "created_at" in post, "Post should have 'created_at'"
        
        # Verify author info
        assert "author" in post, "Post should have 'author'"
        assert post["author"]["email"] == TEST_EMAIL, "Author email should match test user"
    
    def test_create_post_then_get(self, auth_token, cleanup_post):
        """Create a post and verify it exists via GET."""
        unique_text = f"TEST_verify_post_{uuid.uuid4().hex[:8]}"
        
        # Create post
        create_response = requests.post(
            f"{BASE_URL}/api/posts",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"text": unique_text}
        )
        assert create_response.status_code == 200
        post = create_response.json()
        post_id = post["post_id"]
        cleanup_post.append(post_id)
        
        # Get post
        get_response = requests.get(
            f"{BASE_URL}/api/posts/{post_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert get_response.status_code == 200, f"Expected 200, got {get_response.status_code}: {get_response.text}"
        
        fetched_post = get_response.json()
        assert fetched_post["post_id"] == post_id, "Post ID should match"
        assert fetched_post["text"] == unique_text, "Post text should match"


class TestGalleryAPI:
    """Tests for Profile Gallery API - image URL upload."""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.text}")
        data = response.json()
        return data.get("session_token")
    
    @pytest.fixture
    def cleanup_gallery_image(self, auth_token):
        """Fixture to cleanup added gallery images."""
        added_urls = []
        yield added_urls
        # Cleanup after test
        if added_urls:
            requests.post(
                f"{BASE_URL}/api/profiles/gallery",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={"remove_images": added_urls}
            )
    
    def test_add_image_to_gallery(self, auth_token, cleanup_gallery_image):
        """POST /api/profiles/gallery - update gallery with an image URL."""
        unique_url = f"https://example.com/test-gallery-{uuid.uuid4().hex[:8]}.jpg"
        
        response = requests.post(
            f"{BASE_URL}/api/profiles/gallery",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"images": [unique_url]}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        user = response.json()
        cleanup_gallery_image.append(unique_url)
        
        # Verify gallery structure
        assert "gallery_images" in user, "User should have 'gallery_images'"
        assert "gallery_items" in user, "User should have 'gallery_items'"
        
        # Verify image was added
        assert unique_url in user["gallery_images"], f"Added URL should be in gallery_images"
    
    def test_add_and_remove_gallery_image(self, auth_token):
        """Test adding and removing a gallery image."""
        unique_url = f"https://example.com/temp-gallery-{uuid.uuid4().hex[:8]}.jpg"
        
        # Add image
        add_response = requests.post(
            f"{BASE_URL}/api/profiles/gallery",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"images": [unique_url]}
        )
        assert add_response.status_code == 200
        user = add_response.json()
        assert unique_url in user["gallery_images"], "Image should be added"
        
        # Remove image
        remove_response = requests.post(
            f"{BASE_URL}/api/profiles/gallery",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"remove_images": [unique_url]}
        )
        assert remove_response.status_code == 200
        user = remove_response.json()
        assert unique_url not in user["gallery_images"], "Image should be removed"
    
    def test_gallery_update_verify_via_auth_me(self, auth_token, cleanup_gallery_image):
        """Add gallery image and verify via GET /api/auth/me."""
        unique_url = f"https://example.com/verify-gallery-{uuid.uuid4().hex[:8]}.jpg"
        
        # Add image
        add_response = requests.post(
            f"{BASE_URL}/api/profiles/gallery",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"images": [unique_url]}
        )
        assert add_response.status_code == 200
        cleanup_gallery_image.append(unique_url)
        
        # Verify via auth/me
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert me_response.status_code == 200
        user = me_response.json()
        
        assert "gallery_images" in user, "User should have gallery_images"
        assert unique_url in user["gallery_images"], "Added URL should persist in gallery_images"


class TestPostsListAPI:
    """Tests for listing posts."""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token."""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.text}")
        data = response.json()
        return data.get("session_token")
    
    def test_list_posts_pagination(self, auth_token):
        """GET /api/posts - test pagination parameters."""
        response = requests.get(
            f"{BASE_URL}/api/posts?limit=5&skip=0",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        posts = response.json()
        assert isinstance(posts, list), "Response should be a list"
        assert len(posts) <= 5, "Should return at most 5 posts"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
