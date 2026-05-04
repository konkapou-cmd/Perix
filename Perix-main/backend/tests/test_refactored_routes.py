"""
Test suite for verifying the refactored modular router architecture.
Tests all key endpoints after the backend refactoring from monolithic to modular structure.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

# Base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')
# Override for local testing
BASE_URL = 'http://localhost:8000'


class TestAPISetup:
    """Setup and basic connectivity tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session for all tests"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    def test_api_root(self, session):
        """Test that the API root endpoint is accessible"""
        response = session.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"API root response: {data}")


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session for all tests"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def test_user_credentials(self):
        """Generate unique test user credentials"""
        unique_id = uuid.uuid4().hex[:8]
        return {
            "email": f"refactor_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Refactor Test User {unique_id}"
        }
    
    def test_register_new_user(self, session, test_user_credentials):
        """Test user registration endpoint"""
        response = session.post(
            f"{BASE_URL}/api/auth/register",
            json=test_user_credentials
        )
        # May return 400 if user exists, 200 if new
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, body: {response.text}"
        print(f"Register response status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            assert "user" in data
            assert "session_token" in data
            print(f"Registered new user: {data['user']['email']}")
    
    def test_login(self, session, test_user_credentials):
        """Test user login endpoint"""
        # First register to ensure user exists
        session.post(f"{BASE_URL}/api/auth/register", json=test_user_credentials)
        
        # Now login
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_user_credentials["email"],
                "password": test_user_credentials["password"]
            }
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert "session_token" in data
        assert data["user"]["email"] == test_user_credentials["email"]
        print(f"Login successful for: {data['user']['email']}")
    
    def test_login_invalid_credentials(self, session):
        """Test login with invalid credentials"""
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "invalid@nonexistent.com",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401
        print("Invalid login correctly rejected")
    
    def test_me_endpoint_unauthorized(self, session):
        """Test /me endpoint without authentication"""
        # Use a fresh session without any cookies/headers
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("/me endpoint correctly requires authentication")
    
    def test_me_endpoint_authorized(self, session, test_user_credentials):
        """Test /me endpoint with authentication"""
        # Login first
        login_response = session.post(
            f"{BASE_URL}/api/auth/register",
            json=test_user_credentials
        )
        if login_response.status_code == 400:
            login_response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={
                    "email": test_user_credentials["email"],
                    "password": test_user_credentials["password"]
                }
            )
        
        token = login_response.json()["session_token"]
        
        # Call /me with token
        response = session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        print(f"/me endpoint returned user: {data['email']}")
    
    def test_logout(self, session, test_user_credentials):
        """Test logout endpoint"""
        # Login first
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_user_credentials["email"],
                "password": test_user_credentials["password"]
            }
        )
        if login_response.status_code != 200:
            pytest.skip("Login required for logout test")
        
        token = login_response.json()["session_token"]
        
        # Logout
        response = session.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "logged_out"
        print("Logout successful")


class TestCategoriesEndpoint:
    """Categories API tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    def test_get_categories(self, session):
        """Test GET /api/categories returns category tree"""
        response = session.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check structure of first category
        first_cat = data[0]
        assert "name" in first_cat
        assert "slug" in first_cat
        assert "subcategories" in first_cat
        print(f"Categories returned: {len(data)} root categories")
        print(f"First category: {first_cat['name']} with {len(first_cat['subcategories'])} subcategories")


class TestBusinessEndpoints:
    """Business CRUD and fan gallery tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Get auth token for authenticated tests"""
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"biz_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Business Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for business tests")
        return response.json()["session_token"]
    
    def test_list_businesses(self, session, auth_token):
        """Test GET /api/businesses"""
        response = session.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Listed {len(data)} businesses")
    
    def test_get_my_business(self, session, auth_token):
        """Test GET /api/businesses/my"""
        response = session.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        # May return null if no business
        print(f"My business response: {response.json()}")
    
    def test_create_business(self, session, auth_token):
        """Test POST /api/businesses"""
        response = session.post(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": f"Test Business {uuid.uuid4().hex[:8]}",
                "subcategory": "gyms",
                "root_category": "sports-wellness",
                "address": "123 Test St",
                "latitude": 52.1205,
                "longitude": 11.6276
            }
        )
        # May return 403 if user already has a business
        assert response.status_code in [200, 403], f"Unexpected: {response.status_code}, {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert "business_id" in data
            assert data["name"].startswith("Test Business")
            print(f"Created business: {data['business_id']}")
    
    def test_business_fan_gallery(self, session, auth_token):
        """Test GET /api/businesses/{id}/fan-gallery"""
        # First get a business
        list_response = session.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        businesses = list_response.json()
        if not businesses:
            pytest.skip("No businesses available for fan gallery test")
        
        business_id = businesses[0]["business_id"]
        response = session.get(
            f"{BASE_URL}/api/businesses/{business_id}/fan-gallery",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Fan gallery for business {business_id}: {len(data)} posts")


class TestArtistEndpoints:
    """Artist CRUD and fan gallery tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Get auth token for authenticated tests"""
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"artist_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Artist Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for artist tests")
        return response.json()["session_token"]
    
    def test_list_artists(self, session, auth_token):
        """Test GET /api/artists"""
        response = session.get(
            f"{BASE_URL}/api/artists",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Listed {len(data)} artists")
    
    def test_get_my_artist(self, session, auth_token):
        """Test GET /api/artists/my"""
        response = session.get(
            f"{BASE_URL}/api/artists/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print(f"My artist response: {response.json()}")
    
    def test_create_artist(self, session, auth_token):
        """Test POST /api/artists"""
        response = session.post(
            f"{BASE_URL}/api/artists",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": f"Test Artist {uuid.uuid4().hex[:8]}",
                "bio": "Test artist bio",
                "genres": ["Rock", "Jazz"],
                "town": "Berlin"
            }
        )
        # May return 403 if artist already exists
        assert response.status_code in [200, 403], f"Unexpected: {response.status_code}, {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert "artist_id" in data
            print(f"Created artist: {data['artist_id']}")
    
    def test_artist_fan_gallery(self, session, auth_token):
        """Test GET /api/artists/{id}/fan-gallery"""
        # First get an artist
        list_response = session.get(
            f"{BASE_URL}/api/artists",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        artists = list_response.json()
        if not artists:
            pytest.skip("No artists available for fan gallery test")
        
        artist_id = artists[0]["artist_id"]
        response = session.get(
            f"{BASE_URL}/api/artists/{artist_id}/fan-gallery",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Fan gallery for artist {artist_id}: {len(data)} posts")


class TestPostEndpoints:
    """Posts CRUD tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Get auth token for authenticated tests"""
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"post_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Post Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for post tests")
        return response.json()["session_token"]
    
    def test_list_posts(self, session, auth_token):
        """Test GET /api/posts"""
        response = session.get(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Listed {len(data)} posts")
    
    def test_create_post(self, session, auth_token):
        """Test POST /api/posts"""
        response = session.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "text": f"Test post created at {datetime.now().isoformat()}"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "post_id" in data
        assert "text" in data
        print(f"Created post: {data['post_id']}")
        return data["post_id"]
    
    def test_like_post(self, session, auth_token):
        """Test POST /api/posts/{post_id}/like"""
        # First create a post
        create_response = session.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "Post to like"}
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create post for like test")
        
        post_id = create_response.json()["post_id"]
        
        # Like the post
        response = session.post(
            f"{BASE_URL}/api/posts/{post_id}/like",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "likes_count" in data
        print(f"Liked post {post_id}, likes count: {data['likes_count']}")
    
    def test_comment_on_post(self, session, auth_token):
        """Test POST /api/posts/{post_id}/comments"""
        # First create a post
        create_response = session.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "Post to comment on"}
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create post for comment test")
        
        post_id = create_response.json()["post_id"]
        
        # Add comment
        response = session.post(
            f"{BASE_URL}/api/posts/{post_id}/comments",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "Test comment"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "comments_count" in data
        print(f"Commented on post {post_id}, comments count: {data['comments_count']}")
    
    def test_delete_post(self, session, auth_token):
        """Test DELETE /api/posts/{post_id}"""
        # First create a post
        create_response = session.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "Post to delete"}
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create post for delete test")
        
        post_id = create_response.json()["post_id"]
        
        # Delete post
        response = session.delete(
            f"{BASE_URL}/api/posts/{post_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "deleted"
        print(f"Deleted post {post_id}")


class TestStoryEndpoints:
    """Stories endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"story_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Story Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for story tests")
        return response.json()["session_token"]
    
    def test_list_stories(self, session, auth_token):
        """Test GET /api/stories"""
        response = session.get(
            f"{BASE_URL}/api/stories",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Listed {len(data)} stories")
    
    def test_create_story(self, session, auth_token):
        """Test POST /api/stories"""
        response = session.post(
            f"{BASE_URL}/api/stories",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "text": "Test story"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "story_id" in data
        print(f"Created story: {data['story_id']}")


class TestEventEndpoints:
    """Events endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_data(self, session):
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"event_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Event Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for event tests")
        data = response.json()
        return {"token": data["session_token"], "user_id": data["user"]["user_id"]}
    
    def test_list_events(self, session, auth_data):
        """Test GET /api/events"""
        response = session.get(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {auth_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Listed {len(data)} events")


class TestMessageEndpoints:
    """Messages/conversations endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"msg_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Message Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for message tests")
        return response.json()["session_token"]
    
    def test_list_conversations(self, session, auth_token):
        """Test GET /api/messages/conversations"""
        response = session.get(
            f"{BASE_URL}/api/messages/conversations",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Listed {len(data)} conversations")
    
    def test_unread_count(self, session, auth_token):
        """Test GET /api/messages/unread-count"""
        response = session.get(
            f"{BASE_URL}/api/messages/unread-count",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "unread_count" in data
        print(f"Unread count: {data['unread_count']}")


class TestFeedEndpoint:
    """Feed endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"feed_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Feed Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for feed tests")
        return response.json()["session_token"]
    
    def test_home_feed(self, session, auth_token):
        """Test GET /api/feed/home"""
        response = session.get(
            f"{BASE_URL}/api/feed/home",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "posts" in data
        assert "stories" in data
        assert "events" in data
        assert "businesses" in data
        print(f"Home feed: {len(data['posts'])} posts, {len(data['stories'])} stories, {len(data['events'])} events, {len(data['businesses'])} businesses")
    
    def test_home_feed_with_location(self, session, auth_token):
        """Test GET /api/feed/home with location filter"""
        response = session.get(
            f"{BASE_URL}/api/feed/home",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"latitude": 52.1205, "longitude": 11.6276, "radius_km": 50}
        )
        assert response.status_code == 200
        data = response.json()
        assert "businesses" in data
        print(f"Location-filtered feed: {len(data['businesses'])} businesses nearby")


class TestProfileEndpoints:
    """Profile endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def auth_data(self, session):
        unique_id = uuid.uuid4().hex[:8]
        credentials = {
            "email": f"profile_test_{unique_id}@test.com",
            "password": "testpass123",
            "name": f"Profile Test User {unique_id}"
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 400:
            response = session.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": credentials["email"], "password": credentials["password"]}
            )
        if response.status_code != 200:
            pytest.skip("Could not authenticate for profile tests")
        data = response.json()
        return {"token": data["session_token"], "user_id": data["user"]["user_id"]}
    
    def test_get_profile_me(self, session, auth_data):
        """Test GET /api/profiles/me"""
        response = session.get(
            f"{BASE_URL}/api/profiles/me",
            headers={"Authorization": f"Bearer {auth_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        print(f"Profile: {data['user_id']}")
    
    def test_get_user_public_profile(self, session, auth_data):
        """Test GET /api/users/{user_id}/public"""
        response = session.get(
            f"{BASE_URL}/api/users/{auth_data['user_id']}/public",
            headers={"Authorization": f"Bearer {auth_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert "posts" in data
        assert "stories" in data
        print(f"Public profile for {auth_data['user_id']}")
    
    def test_update_profile_info(self, session, auth_data):
        """Test POST /api/profiles/info"""
        response = session.post(
            f"{BASE_URL}/api/profiles/info",
            headers={"Authorization": f"Bearer {auth_data['token']}"},
            json={"bio": "Test bio updated", "location": "Berlin"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("bio") == "Test bio updated"
        print("Profile info updated")
    
    def test_get_my_friends(self, session, auth_data):
        """Test GET /api/friends/me"""
        response = session.get(
            f"{BASE_URL}/api/friends/me",
            headers={"Authorization": f"Bearer {auth_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Friends count: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
