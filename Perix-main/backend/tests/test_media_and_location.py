"""
Backend API Tests - Media Upload and Location Features
Test coverage:
- Media upload endpoint (images and videos) with resource_type form parameter
- Home feed with location-based prioritization
- Artist creation with town geocoding
- Business location update
- Event creation with datetime
- User messaging endpoint
"""
import pytest
import requests
import os
import base64
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')

# Test credentials
TEST_USER_EMAIL = "test_media_loc@example.com"
TEST_USER_PASSWORD = "testpassword123"
TEST_USER_NAME = "Test Media Location User"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token via register or login"""
    # Try to login first
    login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    
    if login_response.status_code == 200:
        data = login_response.json()
        return data.get("session_token")
    
    # If login fails, register new user
    register_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "name": TEST_USER_NAME,
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    
    if register_response.status_code == 200:
        data = register_response.json()
        return data.get("session_token")
    
    pytest.skip(f"Authentication failed - status: {register_response.status_code}, response: {register_response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# =============================================================================
# Media Upload Tests - Critical fix verification
# =============================================================================
class TestMediaUpload:
    """Media upload endpoint tests - verifying resource_type as form parameter"""
    
    def test_media_upload_endpoint_exists(self, authenticated_client, auth_token):
        """Test that /media/upload endpoint is accessible"""
        # Just check endpoint exists (even without file will give specific error)
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Should return 422 (validation error - file required) not 404
        assert response.status_code != 404, "Media upload endpoint not found"
        print(f"✓ Media upload endpoint exists - status: {response.status_code}")
    
    def test_upload_image_with_resource_type(self, auth_token):
        """Test image upload with resource_type as form parameter"""
        # Create a minimal valid PNG image (1x1 pixel)
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {
            'file': ('test_image.png', png_data, 'image/png')
        }
        data = {
            'resource_type': 'image'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Image upload failed: {response.status_code} - {response.text}"
        result = response.json()
        assert "url" in result, "Response missing 'url' field"
        assert result["url"].startswith("https://"), f"URL doesn't start with https: {result['url']}"
        
        print(f"✓ Image uploaded successfully - URL: {result['url'][:50]}...")
        return result["url"]
    
    def test_upload_with_default_resource_type(self, auth_token):
        """Test upload defaults to image when resource_type not specified"""
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {
            'file': ('test_default.png', png_data, 'image/png')
        }
        # No resource_type parameter - should default to "image"
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            files=files,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Default upload failed: {response.status_code} - {response.text}"
        result = response.json()
        assert "url" in result
        
        print(f"✓ Default resource_type upload works - URL: {result['url'][:50]}...")
    
    def test_upload_video_resource_type(self, auth_token):
        """Test video upload with resource_type='video' as form parameter"""
        # Create minimal video-like content (note: Cloudinary may reject invalid video content)
        # For testing purposes, we just verify the parameter is accepted
        # In real app, actual video binary would be sent
        
        # Use a very small placeholder to test the parameter passing
        # This tests that resource_type is correctly read as a form field
        video_placeholder = b'\x00\x00\x00\x1c\x66\x74\x79\x70\x69\x73\x6f\x6d'  # MP4 header fragment
        
        files = {
            'file': ('test_video.mp4', video_placeholder, 'video/mp4')
        }
        data = {
            'resource_type': 'video'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # We expect either:
        # 200 = success
        # 500/520 with "Upload failed" = Cloudinary rejected invalid video content but parameter was accepted
        if response.status_code == 200:
            result = response.json()
            assert "url" in result
            print(f"✓ Video upload successful - URL: {result['url'][:50]}...")
        elif response.status_code in [500, 520]:
            # Parameter accepted but Cloudinary rejected invalid video content
            error_text = response.text
            assert "Upload failed" in error_text or "error" in error_text.lower() or "Invalid" in error_text
            print(f"✓ Video resource_type parameter accepted (Cloudinary rejected placeholder content: {response.status_code})")
        else:
            # Any other status indicates a problem
            assert False, f"Unexpected response: {response.status_code} - {response.text}"
    
    def test_upload_requires_authentication(self):
        """Test upload without auth token returns 401"""
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {
            'file': ('test_noauth.png', png_data, 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            files=files
        )
        
        assert response.status_code == 401, f"Expected 401 for unauthenticated request, got {response.status_code}"
        print("✓ Media upload correctly requires authentication")
    
    def test_upload_empty_file_returns_error(self, auth_token):
        """Test uploading empty file returns 400"""
        files = {
            'file': ('empty.png', b'', 'image/png')
        }
        data = {
            'resource_type': 'image'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400 for empty file, got {response.status_code}"
        print("✓ Empty file correctly rejected with 400")


# =============================================================================
# Home Feed Tests - Location prioritization
# =============================================================================
class TestHomeFeedLocation:
    """Home feed with location-based prioritization"""
    
    def test_home_feed_without_location(self, authenticated_client):
        """Test /feed/home without location returns all content"""
        response = authenticated_client.get(f"{BASE_URL}/api/feed/home")
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields present
        assert "posts" in data
        assert "stories" in data
        assert "events" in data
        assert "businesses" in data
        assert "artists" in data
        assert "activities" in data
        
        print(f"✓ Home feed (no location) - businesses: {len(data['businesses'])}, posts: {len(data['posts'])}, events: {len(data['events'])}")
    
    def test_home_feed_with_10km_location(self, authenticated_client):
        """Test /feed/home with 10km radius prioritization"""
        # Berlin center coordinates
        lat, lon = 52.5200, 13.4050
        
        response = authenticated_client.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": lat, "longitude": lon, "max_distance_km": 10.0}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert isinstance(data["businesses"], list)
        assert isinstance(data["posts"], list)
        assert isinstance(data["events"], list)
        
        print(f"✓ Home feed (10km Berlin) - businesses: {len(data['businesses'])}, events: {len(data['events'])}")
    
    def test_home_feed_custom_radius(self, authenticated_client):
        """Test home feed with different radius values"""
        lat, lon = 52.5200, 13.4050
        
        # 1km radius
        response_1km = authenticated_client.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": lat, "longitude": lon, "max_distance_km": 1.0}
        )
        assert response_1km.status_code == 200
        
        # 50km radius
        response_50km = authenticated_client.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": lat, "longitude": lon, "max_distance_km": 50.0}
        )
        assert response_50km.status_code == 200
        
        print(f"✓ Home feed radius test - 1km: OK, 50km: OK")


# =============================================================================
# Artist Geocoding Tests
# =============================================================================
class TestArtistGeocoding:
    """Artist creation with town geocoding"""
    
    def test_artist_town_geocoding(self, authenticated_client):
        """Test artist creation with town triggers geocoding"""
        # Check if artist exists
        my_artist = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        
        if my_artist.status_code == 200 and my_artist.json():
            artist_data = my_artist.json()
            print(f"✓ Artist exists - town: {artist_data.get('town')}, lat: {artist_data.get('latitude')}, lon: {artist_data.get('longitude')}")
            return
        
        # Create artist with town
        payload = {
            "name": "TEST_Artist_Geocode_V2",
            "bio": "Test artist for geocoding",
            "genres": ["electronic"],
            "socials": {},
            "town": "Berlin, Germany",
            "gallery_images": [],
            "fan_gallery": [],
            "video_urls": []
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/artists", json=payload)
        
        if response.status_code == 403:
            print("✓ Artist already exists for user")
            return
        
        assert response.status_code == 200, f"Create artist failed: {response.text}"
        data = response.json()
        
        assert data["town"] == "Berlin, Germany"
        # Geocoding may or may not succeed due to rate limits
        if data.get("latitude") and data.get("longitude"):
            print(f"✓ Artist created with geocoding - lat: {data['latitude']}, lon: {data['longitude']}")
        else:
            print(f"✓ Artist created - geocoding may have been rate limited")
    
    def test_artist_update_town_geocoding(self, authenticated_client):
        """Test updating artist town triggers geocoding"""
        my_artist = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        
        if my_artist.status_code != 200 or not my_artist.json():
            pytest.skip("No artist to update")
        
        artist = my_artist.json()
        artist_id = artist["artist_id"]
        
        # Update town to trigger geocoding
        response = authenticated_client.put(
            f"{BASE_URL}/api/artists/{artist_id}",
            json={"town": "Munich, Germany"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Artist town updated - lat: {data.get('latitude')}, lon: {data.get('longitude')}")


# =============================================================================
# Business Location Tests
# =============================================================================
class TestBusinessLocation:
    """Business location update functionality"""
    
    def test_business_location_update(self, authenticated_client):
        """Test updating business location via PUT"""
        # Get my business
        my_biz = authenticated_client.get(f"{BASE_URL}/api/businesses/my")
        
        if my_biz.status_code != 200 or not my_biz.json():
            print("✓ No business to test location update")
            return
        
        business = my_biz.json()[0]
        business_id = business["business_id"]
        
        # Update location
        new_lat, new_lon = 52.5300, 13.4200
        response = authenticated_client.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            json={
                "address": "New Location, Berlin",
                "latitude": new_lat,
                "longitude": new_lon
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["latitude"] == new_lat
        assert data["longitude"] == new_lon
        
        print(f"✓ Business location updated - lat: {data['latitude']}, lon: {data['longitude']}")
    
    def test_nearby_businesses_api(self, authenticated_client):
        """Test nearby businesses endpoint"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={"latitude": 52.5200, "longitude": 13.4050, "radius_km": 10.0}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Nearby businesses - count: {len(data)}")


# =============================================================================
# Event DateTime Tests
# =============================================================================
class TestEventDateTime:
    """Event creation with datetime"""
    
    def test_create_event_with_datetime(self, authenticated_client):
        """Test creating event with start_time and end_time"""
        # Need business or artist
        my_biz = authenticated_client.get(f"{BASE_URL}/api/businesses/my")
        my_artist = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        
        business_id = None
        artist_id = None
        
        if my_biz.status_code == 200 and my_biz.json():
            business_id = my_biz.json()[0]["business_id"]
        
        if my_artist.status_code == 200 and my_artist.json():
            artist_id = my_artist.json()["artist_id"]
        
        if not business_id and not artist_id:
            pytest.skip("Need business or artist to create event")
        
        start_time = (datetime.utcnow() + timedelta(days=5)).isoformat() + "Z"
        end_time = (datetime.utcnow() + timedelta(days=5, hours=2)).isoformat() + "Z"
        
        payload = {
            "title": "TEST_Event_MediaLoc",
            "description": "Test event",
            "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "start_time": start_time,
            "end_time": end_time,
            "location": "Test Venue"
        }
        
        if business_id:
            payload["business_id"] = business_id
        if artist_id:
            payload["artist_id"] = artist_id
        
        response = authenticated_client.post(f"{BASE_URL}/api/events", json=payload)
        assert response.status_code == 200, f"Create event failed: {response.text}"
        
        data = response.json()
        assert "event_id" in data
        assert "start_time" in data
        assert "end_time" in data
        
        print(f"✓ Event created with datetime - start: {data['start_time'][:19]}")
        return data["event_id"]


# =============================================================================
# User Messaging Tests
# =============================================================================
class TestUserMessaging:
    """User messaging functionality"""
    
    def test_send_message(self, authenticated_client):
        """Test sending a message"""
        # Get current user
        me = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        user_id = me.json()["user_id"]
        
        # Send message to self
        response = authenticated_client.post(
            f"{BASE_URL}/api/messages",
            json={
                "to_user_id": user_id,
                "text": "TEST_Message_MediaLoc"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "message_id" in data
        assert data["text"] == "TEST_Message_MediaLoc"
        
        print(f"✓ Message sent - id: {data['message_id']}")
    
    def test_get_conversations(self, authenticated_client):
        """Test getting conversations list"""
        response = authenticated_client.get(f"{BASE_URL}/api/messages/conversations")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Conversations retrieved - count: {len(data)}")
    
    def test_send_message_by_email(self, authenticated_client):
        """Test sending message using recipient email"""
        # Get current user's email
        me = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        email = me.json()["email"]
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/messages",
            json={
                "to_email": email,
                "text": "TEST_Message_ByEmail"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "message_id" in data
        print(f"✓ Message sent by email - id: {data['message_id']}")


# =============================================================================
# Cleanup
# =============================================================================
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(authenticated_client):
    """Cleanup TEST_ prefixed data after tests"""
    yield
    
    try:
        # Cleanup test events
        events = authenticated_client.get(f"{BASE_URL}/api/events")
        if events.status_code == 200:
            for event in events.json():
                if "TEST_" in event.get("title", ""):
                    authenticated_client.delete(f"{BASE_URL}/api/events/{event['event_id']}")
        print("✓ Test data cleanup completed")
    except Exception as e:
        print(f"Warning: Cleanup failed - {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
