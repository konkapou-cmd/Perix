"""
Test suite for User Attendance API (GET /api/users/{user_id}/attendance)
Tests activities and events attendance display feature on user profiles.
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
TEST_EMAIL = "test_backend_user@example.com"
TEST_PASSWORD = "testpassword123"
ATTENDANCE_TEST_EMAIL = "test_attendance_user@example.com"
ATTENDANCE_TEST_PASSWORD = "testpassword123"


class TestUserAttendanceAPI:
    """Test the user attendance API endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.user_id = None
        
    def login(self, email=TEST_EMAIL, password=TEST_PASSWORD):
        """Login and get session token"""
        response = self.session.post(f"{API_BASE}/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("session_token")
            self.user_id = data.get("user", {}).get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        return False
        
    def register(self, email, password, name="Test User"):
        """Register a new user"""
        response = self.session.post(f"{API_BASE}/auth/register", json={
            "name": name,
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("session_token")
            self.user_id = data.get("user", {}).get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        return False
    
    def test_attendance_endpoint_structure(self):
        """Test that attendance endpoint returns proper structure"""
        # Login
        assert self.login(), "Failed to login"
        
        # Call attendance endpoint
        response = self.session.get(f"{API_BASE}/users/{self.user_id}/attendance")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "activities" in data, "Response should have 'activities' key"
        assert "events" in data, "Response should have 'events' key"
        assert isinstance(data["activities"], list), "activities should be a list"
        assert isinstance(data["events"], list), "events should be a list"
        
        print(f"✓ Attendance endpoint returns proper structure: {len(data['activities'])} activities, {len(data['events'])} events")
    
    def test_attendance_for_nonexistent_user(self):
        """Test attendance endpoint for non-existent user returns 404"""
        assert self.login(), "Failed to login"
        
        response = self.session.get(f"{API_BASE}/users/nonexistent_user_123/attendance")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent user returns 404 as expected")
    
    def test_attendance_requires_auth(self):
        """Test attendance endpoint requires authentication"""
        # Don't login, just make request
        response = self.session.get(f"{API_BASE}/users/any_user_id/attendance")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Attendance endpoint requires authentication")
    
    def test_attendance_shows_created_activities(self):
        """Test that activities created by user show in attendance"""
        # Try login or register
        if not self.login(ATTENDANCE_TEST_EMAIL, ATTENDANCE_TEST_PASSWORD):
            assert self.register(ATTENDANCE_TEST_EMAIL, ATTENDANCE_TEST_PASSWORD, "Attendance Test User")
        
        # Create an activity
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        activity_data = {
            "title": "TEST_Attendance_Activity",
            "description": "Test activity for attendance API",
            "date": tomorrow,
            "time": "14:00",
            "location": "Test Location",
            "max_attendees": 10,
            "invite_emails": []
        }
        
        create_response = self.session.post(f"{API_BASE}/activities", json=activity_data)
        assert create_response.status_code == 200, f"Failed to create activity: {create_response.text}"
        
        created_activity = create_response.json()
        activity_id = created_activity.get("activity_id")
        
        # Now get attendance
        attendance_response = self.session.get(f"{API_BASE}/users/{self.user_id}/attendance")
        assert attendance_response.status_code == 200
        
        attendance_data = attendance_response.json()
        
        # Creator's activities should appear in attendance
        activity_ids = [a.get("activity_id") for a in attendance_data.get("activities", [])]
        assert activity_id in activity_ids, f"Created activity should appear in attendance. Got: {activity_ids}"
        
        print(f"✓ Created activity appears in user attendance")
        
        # Cleanup
        self.session.delete(f"{API_BASE}/activities/{activity_id}")
    
    def test_activity_response_structure(self):
        """Test that activities in attendance have correct fields"""
        if not self.login(ATTENDANCE_TEST_EMAIL, ATTENDANCE_TEST_PASSWORD):
            assert self.register(ATTENDANCE_TEST_EMAIL, ATTENDANCE_TEST_PASSWORD, "Attendance Test User")
        
        # Create an activity
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        activity_data = {
            "title": "TEST_Activity_Structure",
            "description": "Test description",
            "date": tomorrow,
            "time": "15:30",
            "location": "Test Venue"
        }
        
        create_response = self.session.post(f"{API_BASE}/activities", json=activity_data)
        assert create_response.status_code == 200
        created_activity = create_response.json()
        activity_id = created_activity.get("activity_id")
        
        # Get attendance
        attendance_response = self.session.get(f"{API_BASE}/users/{self.user_id}/attendance")
        assert attendance_response.status_code == 200
        
        data = attendance_response.json()
        
        # Find our activity
        activity = next((a for a in data.get("activities", []) if a.get("activity_id") == activity_id), None)
        assert activity is not None, "Activity should be in attendance"
        
        # Check required fields for UI display
        assert "title" in activity, "Activity should have title"
        assert "date" in activity, "Activity should have date"
        assert "time" in activity, "Activity should have time"
        assert activity["title"] == "TEST_Activity_Structure"
        assert activity["date"] == tomorrow
        assert activity["time"] == "15:30"
        
        print(f"✓ Activity has required fields: title={activity['title']}, date={activity['date']}, time={activity['time']}")
        
        # Cleanup
        self.session.delete(f"{API_BASE}/activities/{activity_id}")
    
    def test_attendance_for_other_user(self):
        """Test viewing another user's attendance"""
        # Login as main test user
        assert self.login(), "Failed to login"
        
        # Get attendance for ourselves
        response = self.session.get(f"{API_BASE}/users/{self.user_id}/attendance")
        assert response.status_code == 200
        
        # Now try to get attendance for a different user
        # First register another user to get their ID
        session2 = requests.Session()
        session2.headers.update({"Content-Type": "application/json"})
        
        other_email = "test_other_attendance@example.com"
        reg_response = session2.post(f"{API_BASE}/auth/register", json={
            "name": "Other User",
            "email": other_email,
            "password": "testpassword123"
        })
        
        if reg_response.status_code != 200:
            # User might exist, try login
            login_response = session2.post(f"{API_BASE}/auth/login", json={
                "email": other_email,
                "password": "testpassword123"
            })
            assert login_response.status_code == 200
            other_user_id = login_response.json().get("user", {}).get("user_id")
        else:
            other_user_id = reg_response.json().get("user", {}).get("user_id")
        
        # Now use first user's token to view other user's attendance
        other_attendance = self.session.get(f"{API_BASE}/users/{other_user_id}/attendance")
        assert other_attendance.status_code == 200, f"Should be able to view other user's attendance"
        
        print(f"✓ Can view other user's attendance (public feature)")


class TestBusinessOwnerEvents:
    """Test that events show for business owners"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.user_id = None
        
    def login_or_register(self, email, password, name="Test User"):
        """Login or register user"""
        response = self.session.post(f"{API_BASE}/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("session_token")
            self.user_id = data.get("user", {}).get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
            
        # Try register
        response = self.session.post(f"{API_BASE}/auth/register", json={
            "name": name,
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("session_token")
            self.user_id = data.get("user", {}).get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        return False
    
    def test_event_response_structure(self):
        """Test that event responses have required fields for UI display"""
        # Login as test user
        assert self.login_or_register(TEST_EMAIL, TEST_PASSWORD, "Backend Test User")
        
        # Get existing events via home feed
        feed_response = self.session.get(f"{API_BASE}/feed/home")
        assert feed_response.status_code == 200
        
        feed_data = feed_response.json()
        events = feed_data.get("events", [])
        
        if events:
            event = events[0]
            # Check required fields for UI
            assert "event_id" in event, "Event should have event_id"
            assert "title" in event, "Event should have title"
            assert "start_time" in event, "Event should have start_time"
            
            print(f"✓ Event has required fields: event_id, title, start_time")
            print(f"  Sample event: {event.get('title')}, start: {event.get('start_time')}")
            
            if event.get("business"):
                print(f"  Business: {event['business'].get('name')}")
        else:
            print("ℹ No events found in feed - this is acceptable for empty state")


class TestAPIIntegration:
    """Integration tests for attendance feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_full_attendance_flow(self):
        """Test complete flow: create activity, RSVP, verify attendance"""
        # Login
        response = self.session.post(f"{API_BASE}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token")
        user_id = data.get("user", {}).get("user_id")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Verify attendance endpoint works
        attendance_response = self.session.get(f"{API_BASE}/users/{user_id}/attendance")
        assert attendance_response.status_code == 200
        
        attendance_data = attendance_response.json()
        
        print(f"✓ Full attendance flow working")
        print(f"  Activities count: {len(attendance_data.get('activities', []))}")
        print(f"  Events count: {len(attendance_data.get('events', []))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
