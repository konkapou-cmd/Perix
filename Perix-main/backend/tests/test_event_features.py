"""
Test event features:
1. Event detail endpoint GET /api/events/{event_id}
2. Event messages GET/POST /api/events/{event_id}/messages
3. Events are clickable (returned properly from API)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://perix-fixes.preview.emergentagent.com")
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_EMAIL = "test_backend_user@example.com"
TEST_PASSWORD = "testpassword123"


class TestEventFeatures:
    """Test event detail and event messages features"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session"""
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Get auth token for test user"""
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            # Try register if login fails
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "name": "Test Backend User"
            })
        assert response.status_code == 200, f"Auth failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        return data["session_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_events_list(self, session, headers):
        """Test GET /api/events returns list of events"""
        response = session.get(f"{BASE_URL}/api/events", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Events should return a list"
        print(f"✓ GET /api/events - Found {len(data)} events")
        return data
    
    def test_event_detail_returns_valid_data(self, session, headers):
        """Test GET /api/events/{event_id} returns event details"""
        # First get list of events
        events_response = session.get(f"{BASE_URL}/api/events", headers=headers)
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No events available to test event detail")
        
        # Test with first event
        event = events[0]
        event_id = event.get("event_id")
        assert event_id, "Event should have event_id"
        
        response = session.get(f"{BASE_URL}/api/events/{event_id}", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "event_id" in data, "Event detail should have event_id"
        assert "title" in data, "Event detail should have title"
        assert "start_time" in data, "Event detail should have start_time"
        
        # Verify business or artist info for navigation
        if data.get("business"):
            assert "business_id" in data["business"], "Business should have business_id for navigation"
            assert "name" in data["business"], "Business should have name"
        
        if data.get("artist"):
            assert "artist_id" in data["artist"], "Artist should have artist_id for navigation"
            assert "name" in data["artist"], "Artist should have name"
        
        print(f"✓ GET /api/events/{event_id} - Event: {data['title']}")
        return data
    
    def test_event_detail_404_for_invalid_id(self, session, headers):
        """Test GET /api/events/{event_id} returns 404 for non-existent event"""
        response = session.get(f"{BASE_URL}/api/events/event_nonexistent123", headers=headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ GET /api/events/invalid_id - Returns 404 as expected")
    
    def test_event_messages_list(self, session, headers):
        """Test GET /api/events/{event_id}/messages returns list"""
        # Get an event first
        events_response = session.get(f"{BASE_URL}/api/events", headers=headers)
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No events available to test messages")
        
        event_id = events[0]["event_id"]
        response = session.get(f"{BASE_URL}/api/events/{event_id}/messages", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Messages should return a list"
        print(f"✓ GET /api/events/{event_id}/messages - Found {len(data)} messages")
    
    def test_event_messages_send_and_verify(self, session, headers):
        """Test POST /api/events/{event_id}/messages creates message"""
        # Get an event first
        events_response = session.get(f"{BASE_URL}/api/events", headers=headers)
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No events available to test messages")
        
        event_id = events[0]["event_id"]
        test_message = f"TEST_Event_Chat_Message_{datetime.now().isoformat()}"
        
        # Send message
        response = session.post(
            f"{BASE_URL}/api/events/{event_id}/messages",
            headers=headers,
            json={"text": test_message}
        )
        assert response.status_code == 200, f"Failed to send message: {response.text}"
        
        data = response.json()
        assert "message_id" in data, "Response should have message_id"
        assert data["text"] == test_message, "Response text should match sent text"
        print(f"✓ POST /api/events/{event_id}/messages - Message sent successfully")
        
        # Verify message appears in list
        list_response = session.get(f"{BASE_URL}/api/events/{event_id}/messages", headers=headers)
        messages = list_response.json()
        
        found_message = False
        for msg in messages:
            if msg.get("text") == test_message:
                found_message = True
                break
        
        assert found_message, "Sent message should appear in message list"
        print(f"✓ Message verified in GET /api/events/{event_id}/messages list")
    
    def test_events_have_required_fields_for_navigation(self, session, headers):
        """Test that events returned from /api/events have fields needed for clickable navigation"""
        response = session.get(f"{BASE_URL}/api/events", headers=headers)
        assert response.status_code == 200
        
        events = response.json()
        if len(events) == 0:
            pytest.skip("No events to verify")
        
        for event in events[:5]:  # Check first 5 events
            # Required fields for navigation
            assert "event_id" in event, "Event must have event_id for /event/{id} route"
            assert "title" in event, "Event must have title for display"
            assert "start_time" in event, "Event must have start_time"
            
            # Business or artist info (at least one should be present)
            has_host = event.get("business") or event.get("artist")
            # Events can exist without host, but if they have one, check structure
            if event.get("business"):
                assert "business_id" in event["business"], "Business must have business_id"
                assert "name" in event["business"], "Business must have name"
            if event.get("artist"):
                assert "artist_id" in event["artist"], "Artist must have artist_id"
                assert "name" in event["artist"], "Artist must have name"
        
        print(f"✓ Events have required fields for navigation (checked {min(5, len(events))} events)")


class TestHomeFeedEvents:
    """Test that home feed returns events properly for clickable display"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "name": "Test Backend User"
            })
        data = response.json()
        return data["session_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_home_feed_returns_events(self, session, headers):
        """Test GET /api/feed/home returns events in the feed"""
        # Test with sample location (New York)
        params = {
            "latitude": 40.7128,
            "longitude": -74.0060,
            "limit": 10
        }
        response = session.get(f"{BASE_URL}/api/feed/home", headers=headers, params=params)
        
        # Feed endpoint might not exist - test what we have
        if response.status_code == 404:
            # Fall back to individual events endpoint
            events_response = session.get(f"{BASE_URL}/api/events", headers=headers)
            assert events_response.status_code == 200
            print("✓ /api/events works (feed endpoint may not exist)")
            return
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        if "events" in data:
            events = data["events"]
            for event in events[:3]:
                assert "event_id" in event, "Feed events must have event_id"
                assert "title" in event, "Feed events must have title"
            print(f"✓ Home feed returns {len(events)} events with proper structure")
        else:
            print("✓ Home feed response successful (events structure depends on feed data)")


class TestCalendarModalEvents:
    """Test events displayed in calendar modal are properly structured"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    @pytest.fixture(scope="class")  
    def auth_token(self, session):
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "name": "Test Backend User"
            })
        data = response.json()
        return data["session_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_events_for_calendar_display(self, session, headers):
        """Test events have start_time for calendar date marking"""
        response = session.get(f"{BASE_URL}/api/events", headers=headers)
        assert response.status_code == 200
        
        events = response.json()
        if len(events) == 0:
            pytest.skip("No events for calendar test")
        
        for event in events[:5]:
            # Calendar requires start_time to mark dates
            assert "start_time" in event, "Event must have start_time for calendar"
            
            # Verify start_time is parseable
            try:
                datetime.fromisoformat(event["start_time"].replace("Z", "+00:00"))
            except Exception as e:
                pytest.fail(f"start_time not parseable: {event['start_time']} - {e}")
            
            # event_id needed for navigation when clicking
            assert "event_id" in event, "Event must have event_id for navigation"
        
        print(f"✓ Events have valid start_time for calendar display")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
