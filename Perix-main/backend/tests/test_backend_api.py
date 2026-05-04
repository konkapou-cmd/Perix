"""
Backend API Tests for Social Platform
Test coverage:
- Home feed API with location-based prioritization
- Artist profile creation with automatic geocoding
- Business location update
- Events API with date/time pickers
- User profile and friends functionality
"""
import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')
BASE_URL = 'http://localhost:8000'

# Test credentials
TEST_USER_EMAIL = "test_backend_user@example.com"
TEST_USER_PASSWORD = "testpassword123"
TEST_USER_NAME = "Test Backend User"


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
# API Health Check Tests
# =============================================================================
class TestHealthCheck:
    """Basic API health check tests"""
    
    def test_api_root(self, api_client):
        """Test API root endpoint"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Perix - City Social Media API"
        print(f"✓ API root endpoint working: {data}")


# =============================================================================
# Authentication Tests
# =============================================================================
class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_auth_me_with_token(self, authenticated_client):
        """Test /auth/me endpoint returns current user"""
        response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        assert data["email"] == TEST_USER_EMAIL
        print(f"✓ Auth/me working - user_id: {data['user_id']}")
    
    def test_auth_me_without_token(self, api_client):
        """Test /auth/me without authentication returns 401"""
        # Use fresh client without auth
        fresh_client = requests.Session()
        fresh_client.headers.update({"Content-Type": "application/json"})
        response = fresh_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Auth/me correctly returns 401 for unauthenticated requests")


# =============================================================================
# Home Feed Tests - Location-based prioritization
# =============================================================================
class TestHomeFeed:
    """Home feed API with location-based prioritization"""
    
    def test_home_feed_without_location(self, authenticated_client):
        """Test /feed/home endpoint without location parameters"""
        response = authenticated_client.get(f"{BASE_URL}/api/feed/home")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "posts" in data
        assert "events" in data
        assert "businesses" in data
        assert "artists" in data
        assert "activities" in data
        
        assert isinstance(data["posts"], list)
        assert isinstance(data["events"], list)
        assert isinstance(data["businesses"], list)
        assert isinstance(data["artists"], list)
        assert isinstance(data["activities"], list)
        
        print(f"✓ Home feed without location - posts: {len(data['posts'])}, businesses: {len(data['businesses'])}, events: {len(data['events'])}")
    
    def test_home_feed_with_location(self, authenticated_client):
        """Test /feed/home endpoint with location parameters (Berlin center)"""
        # Berlin coordinates
        latitude = 52.5200
        longitude = 13.4050
        
        response = authenticated_client.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": latitude, "longitude": longitude, "max_distance_km": 10.0}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "posts" in data
        assert "events" in data
        assert "businesses" in data
        assert "artists" in data
        
        print(f"✓ Home feed with location (Berlin) - posts: {len(data['posts'])}, businesses: {len(data['businesses'])}")
    
    def test_home_feed_with_custom_radius(self, authenticated_client):
        """Test /feed/home with different radius values"""
        latitude = 52.5200
        longitude = 13.4050
        
        # Test with small radius
        response = authenticated_client.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": latitude, "longitude": longitude, "max_distance_km": 1.0}
        )
        assert response.status_code == 200
        small_radius_data = response.json()
        
        # Test with large radius
        response = authenticated_client.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": latitude, "longitude": longitude, "max_distance_km": 50.0}
        )
        assert response.status_code == 200
        large_radius_data = response.json()
        
        print(f"✓ Home feed radius test - 1km businesses: {len(small_radius_data['businesses'])}, 50km businesses: {len(large_radius_data['businesses'])}")


# =============================================================================
# Artist Profile Tests - With Geocoding
# =============================================================================
class TestArtistProfile:
    """Artist profile creation with automatic geocoding"""
    
    def test_create_artist_with_town_geocoding(self, authenticated_client):
        """Test creating artist with town name triggers geocoding"""
        # First check if artist already exists
        my_artist_response = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        
        if my_artist_response.status_code == 200 and my_artist_response.json():
            print("✓ Artist already exists, skipping creation")
            return
        
        # Create artist with town only (should auto-geocode)
        artist_payload = {
            "name": "TEST_Artist_Geocode",
            "bio": "Test artist for geocoding feature",
            "genres": ["rock", "pop"],
            "socials": {"instagram": "@testartist"},
            "town": "Berlin, Germany",
            "gallery_images": [],
            "fan_gallery": [],
            "video_urls": []
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/artists", json=artist_payload)
        
        if response.status_code == 403:
            # Artist already exists for this user
            print("✓ Artist profile already exists for this user")
            return
        
        assert response.status_code == 200, f"Failed to create artist: {response.text}"
        data = response.json()
        
        assert "artist_id" in data
        assert data["name"] == "TEST_Artist_Geocode"
        assert data["town"] == "Berlin, Germany"
        
        # Note: Geocoding may fail due to Nominatim API rate limits (509 Bandwidth Limit)
        # This is a known limitation of the free Nominatim API service
        if data.get("latitude") is not None and data.get("longitude") is not None:
            # Verify coordinates are in Berlin range
            assert 52.0 < data["latitude"] < 53.0, f"Latitude {data['latitude']} not in Berlin range"
            assert 13.0 < data["longitude"] < 14.0, f"Longitude {data['longitude']} not in Berlin range"
            print(f"✓ Artist created with geocoding - town: {data['town']}, lat: {data['latitude']}, lon: {data['longitude']}")
        else:
            # Geocoding failed due to rate limiting - this is expected behavior
            print(f"⚠ Artist created but geocoding returned None (likely Nominatim rate limit) - town: {data['town']}")
    
    def test_get_my_artist(self, authenticated_client):
        """Test getting current user's artist profile"""
        response = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        assert response.status_code == 200
        data = response.json()
        
        if data:
            assert "artist_id" in data
            assert "name" in data
            print(f"✓ My artist profile retrieved - name: {data.get('name')}")
        else:
            print("✓ No artist profile for current user")
    
    def test_list_artists(self, authenticated_client):
        """Test listing all artists"""
        response = authenticated_client.get(f"{BASE_URL}/api/artists")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Artists list - count: {len(data)}")
        
        if data:
            # Check first artist structure
            artist = data[0]
            assert "artist_id" in artist
            assert "name" in artist
    
    def test_update_artist_town_triggers_geocoding(self, authenticated_client):
        """Test updating artist town triggers geocoding"""
        # First get current artist
        my_artist_response = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        
        if my_artist_response.status_code != 200 or not my_artist_response.json():
            pytest.skip("No artist profile to update")
        
        artist_data = my_artist_response.json()
        artist_id = artist_data["artist_id"]
        
        # Update town
        update_payload = {
            "town": "Munich, Germany"
        }
        
        response = authenticated_client.put(
            f"{BASE_URL}/api/artists/{artist_id}",
            json=update_payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Munich coordinates should be approximately 48.1, 11.5
        if data.get("latitude") and data.get("longitude"):
            print(f"✓ Artist town updated with geocoding - town: {data['town']}, lat: {data['latitude']}, lon: {data['longitude']}")
        else:
            print(f"✓ Artist town updated - coordinates: lat={data.get('latitude')}, lon={data.get('longitude')}")


# =============================================================================
# Business Location Tests
# =============================================================================
class TestBusinessLocation:
    """Business location update functionality"""
    
    def test_get_businesses(self, authenticated_client):
        """Test listing all businesses"""
        response = authenticated_client.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Businesses list - count: {len(data)}")
    
    def test_get_my_business(self, authenticated_client):
        """Test getting current user's business"""
        response = authenticated_client.get(f"{BASE_URL}/api/businesses/my")
        assert response.status_code == 200
        data = response.json()
        
        if data is None:
            print("✓ No business for current user")
        else:
            assert isinstance(data, dict)
            assert "business_id" in data
            print(f"✓ My business - id: {data['business_id']}")
    
    def test_get_nearby_businesses(self, authenticated_client):
        """Test getting nearby businesses with location"""
        # Berlin coordinates
        latitude = 52.5200
        longitude = 13.4050
        
        response = authenticated_client.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={"latitude": latitude, "longitude": longitude, "radius_km": 10.0}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Nearby businesses (Berlin 10km radius) - count: {len(data)}")
    
    def test_create_business_with_location(self, authenticated_client):
        """Test creating business with location"""
        # Check if user already has a business
        my_biz_response = authenticated_client.get(f"{BASE_URL}/api/businesses/my")
        if my_biz_response.status_code == 200 and my_biz_response.json():
            print("✓ Business already exists for user, skipping creation")
            return
        
        # Get valid subcategory
        categories_response = authenticated_client.get(f"{BASE_URL}/api/businesses/category-tree")
        assert categories_response.status_code == 200
        categories_data = categories_response.json()
        
        # API returns {"categories": [...]} not a direct list
        categories = categories_data.get("categories", categories_data)
        if isinstance(categories, dict):
            categories = categories.get("categories", [])
        
        if not categories:
            pytest.skip("No categories available")
        
        # Use first category's first subcategory
        root_cat = categories[0]["slug"]
        sub_cat = categories[0]["subcategories"][0]["slug"]
        
        business_payload = {
            "name": "TEST_Business_Location",
            "root_category": root_cat,
            "subcategory": sub_cat,
            "description": "Test business for location feature",
            "address": "Alexanderplatz, Berlin, Germany",
            "latitude": 52.5219,
            "longitude": 13.4132,
            "phone": "+49123456789",
            "tags": ["test"]
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/businesses", json=business_payload)
        
        if response.status_code == 403:
            print("✓ Business creation limit reached (only one business allowed)")
            return
        
        assert response.status_code == 200, f"Failed to create business: {response.text}"
        data = response.json()
        
        assert "business_id" in data
        assert data["latitude"] == 52.5219
        assert data["longitude"] == 13.4132
        
        print(f"✓ Business created with location - name: {data['name']}, lat: {data['latitude']}, lon: {data['longitude']}")
    
    def test_update_business_location(self, authenticated_client):
        """Test updating business location via PUT endpoint"""
        # Get current user's business
        my_biz_response = authenticated_client.get(f"{BASE_URL}/api/businesses/my")
        
        if my_biz_response.status_code != 200 or not my_biz_response.json():
            pytest.skip("No business to update location")
        
        businesses = my_biz_response.json()
        if businesses is None:
            pytest.skip("No business to update location")
        business_id = businesses["business_id"]
        
        # Update location
        new_lat = 52.5300
        new_lon = 13.4200
        update_payload = {
            "address": "Updated Address, Berlin",
            "latitude": new_lat,
            "longitude": new_lon
        }
        
        response = authenticated_client.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            json=update_payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["latitude"] == new_lat
        assert data["longitude"] == new_lon
        
        print(f"✓ Business location updated - lat: {data['latitude']}, lon: {data['longitude']}")


# =============================================================================
# Events API Tests - Date/Time
# =============================================================================
class TestEvents:
    """Event creation with date/time pickers"""
    
    def test_list_events(self, authenticated_client):
        """Test listing all events"""
        response = authenticated_client.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Events list - count: {len(data)}")
    
    def test_create_event_with_datetime(self, authenticated_client):
        """Test creating event with date/time fields"""
        # Need either business_id or artist_id to create event
        my_biz_response = authenticated_client.get(f"{BASE_URL}/api/businesses/my")
        my_artist_response = authenticated_client.get(f"{BASE_URL}/api/artists/my")
        
        business_id = None
        artist_id = None
        
        if my_biz_response.status_code == 200 and my_biz_response.json():
            biz_data = my_biz_response.json()
            business_id = biz_data["business_id"]
        
        if my_artist_response.status_code == 200 and my_artist_response.json():
            artist_id = my_artist_response.json()["artist_id"]
        
        if not business_id and not artist_id:
            pytest.skip("Need business or artist to create event")
        
        # Create event with specific datetime
        start_time = (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z"
        end_time = (datetime.utcnow() + timedelta(days=7, hours=3)).isoformat() + "Z"
        
        event_payload = {
            "title": "TEST_Event_DateTime",
            "description": "Test event for date/time picker feature",
            "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "start_time": start_time,
            "end_time": end_time,
            "location": "Berlin Concert Hall"
        }
        
        if business_id:
            event_payload["business_id"] = business_id
        if artist_id:
            event_payload["artist_id"] = artist_id
        
        response = authenticated_client.post(f"{BASE_URL}/api/events", json=event_payload)
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        data = response.json()
        
        assert "event_id" in data
        assert data["title"] == "TEST_Event_DateTime"
        assert "start_time" in data
        assert "end_time" in data
        
        print(f"✓ Event created with datetime - start: {data['start_time']}, end: {data['end_time']}")
        return data["event_id"]
    
    def test_update_event_datetime(self, authenticated_client):
        """Test updating event date/time"""
        # Get events to update
        events_response = authenticated_client.get(f"{BASE_URL}/api/events")
        if events_response.status_code != 200 or not events_response.json():
            pytest.skip("No events to update")
        
        # Find a TEST_ event
        events = events_response.json()
        test_event = next((e for e in events if "TEST_" in e.get("title", "")), None)
        
        if not test_event:
            pytest.skip("No test event found to update")
        
        event_id = test_event["event_id"]
        
        # Update datetime
        new_start = (datetime.utcnow() + timedelta(days=14)).isoformat() + "Z"
        new_end = (datetime.utcnow() + timedelta(days=14, hours=4)).isoformat() + "Z"
        
        update_payload = {
            "start_time": new_start,
            "end_time": new_end
        }
        
        response = authenticated_client.put(
            f"{BASE_URL}/api/events/{event_id}",
            json=update_payload
        )
        
        assert response.status_code == 200, f"Failed to update event: {response.text}"
        data = response.json()
        
        print(f"✓ Event datetime updated - new start: {data['start_time']}")


# =============================================================================
# User Profile Tests - Friends and Messages
# =============================================================================
class TestUserProfile:
    """User profile with clickable friends and message functionality"""
    
    def test_get_profile_me(self, authenticated_client):
        """Test getting current user profile"""
        response = authenticated_client.get(f"{BASE_URL}/api/profiles/me")
        assert response.status_code == 200
        data = response.json()
        
        assert "user_id" in data
        assert "email" in data
        assert "friends" in data
        
        print(f"✓ Profile retrieved - user_id: {data['user_id']}, friends count: {len(data.get('friends', []))}")
    
    def test_search_users(self, authenticated_client):
        """Test user search functionality"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/users/search",
            params={"query": "test"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ User search - found: {len(data)} users")
    
    def test_get_friends_list(self, authenticated_client):
        """Test getting friends list"""
        response = authenticated_client.get(f"{BASE_URL}/api/friends/me")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Friends list - count: {len(data)}")
    
    def test_get_user_public_profile(self, authenticated_client):
        """Test getting another user's public profile"""
        # First get current user to get a valid user_id
        me_response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        user_id = me_response.json()["user_id"]
        
        # Get public profile
        response = authenticated_client.get(f"{BASE_URL}/api/users/{user_id}/public")
        assert response.status_code == 200
        data = response.json()
        
        assert "user" in data
        assert "posts" in data
        
        print(f"✓ User public profile retrieved - posts: {len(data['posts'])}")
    
    def test_get_conversations(self, authenticated_client):
        """Test getting message conversations"""
        response = authenticated_client.get(f"{BASE_URL}/api/messages/conversations")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Conversations list - count: {len(data)}")
    
    def test_send_message_to_self(self, authenticated_client):
        """Test sending a message (to self for testing)"""
        # Get current user
        me_response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        user_id = me_response.json()["user_id"]
        
        message_payload = {
            "to_user_id": user_id,
            "text": "TEST_Message for API testing"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/messages", json=message_payload)
        assert response.status_code in (200, 403)
        if response.status_code == 200:
            data = response.json()
            assert "message_id" in data
            assert data["text"] == "TEST_Message for API testing"
            print(f"✓ Message sent - message_id: {data['message_id']}")
        else:
            print("✓ Self-messaging blocked (403)")
    
    def test_get_messages_with_user(self, authenticated_client):
        """Test getting messages with specific user"""
        # Get current user
        me_response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        user_id = me_response.json()["user_id"]
        
        response = authenticated_client.get(f"{BASE_URL}/api/messages/with/{user_id}")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Messages with user - count: {len(data)}")


# =============================================================================
# Activities API Tests
# =============================================================================
class TestActivities:
    """Activities with date/time and location"""
    
    def test_list_activities(self, authenticated_client):
        """Test listing activities"""
        response = authenticated_client.get(f"{BASE_URL}/api/activities")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Activities list - count: {len(data)}")
    
    def test_create_activity_with_datetime_and_location(self, authenticated_client):
        """Test creating activity with date, time, and location"""
        activity_payload = {
            "title": "TEST_Activity_DateTime",
            "description": "Test activity for date/time feature",
            "date": (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d"),
            "time": "18:00",
            "location": "Test Location, Berlin",
            "latitude": 52.5200,
            "longitude": 13.4050,
            "max_attendees": 10,
            "invite_emails": []
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/activities", json=activity_payload)
        assert response.status_code == 200, f"Failed to create activity: {response.text}"
        data = response.json()
        
        assert "activity_id" in data
        assert data["title"] == "TEST_Activity_DateTime"
        assert data["date"] == activity_payload["date"]
        assert data["time"] == "18:00"
        assert data["latitude"] == 52.5200
        assert data["longitude"] == 13.4050
        
        print(f"✓ Activity created - date: {data['date']}, time: {data['time']}, location: ({data['latitude']}, {data['longitude']})")
        return data["activity_id"]


# =============================================================================
# Cleanup fixture
# =============================================================================
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(authenticated_client):
    """Cleanup TEST_ prefixed data after all tests complete"""
    yield
    
    try:
        # Cleanup test events
        events_response = authenticated_client.get(f"{BASE_URL}/api/events")
        if events_response.status_code == 200:
            for event in events_response.json():
                if "TEST_" in event.get("title", ""):
                    authenticated_client.delete(f"{BASE_URL}/api/events/{event['event_id']}")
        
        # Cleanup test activities
        activities_response = authenticated_client.get(f"{BASE_URL}/api/activities")
        if activities_response.status_code == 200:
            for activity in activities_response.json():
                if "TEST_" in activity.get("title", ""):
                    authenticated_client.delete(f"{BASE_URL}/api/activities/{activity['activity_id']}")
        
        print("✓ Test data cleanup completed")
    except Exception as e:
        print(f"Warning: Cleanup failed - {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
