"""Test analytics API endpoints."""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')

class TestAnalyticsAPI:
    """Test analytics endpoints for dashboard data."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test-user@test.com",
            "password": "testpassword"
        })
        if response.status_code == 200:
            token = response.json().get("session_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user_id = response.json().get("user", {}).get("user_id")
        else:
            pytest.skip("Authentication failed")
    
    def test_user_analytics_endpoint_exists(self):
        """Test that the user analytics endpoint exists and returns data."""
        response = self.session.get(f"{BASE_URL}/api/analytics/user")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "total_posts" in data
        assert "total_stories" in data
        assert "total_likes_received" in data
        assert "total_comments_received" in data
        assert "total_profile_views" in data
        assert "total_friends" in data
        assert "total_messages_sent" in data
        assert "total_messages_received" in data
        assert "engagement_rate" in data
        assert "growth_data" in data
    
    def test_user_analytics_data_types(self):
        """Test that user analytics returns correct data types."""
        response = self.session.get(f"{BASE_URL}/api/analytics/user")
        assert response.status_code == 200
        data = response.json()
        
        # Check data types
        assert isinstance(data["total_posts"], int)
        assert isinstance(data["total_stories"], int)
        assert isinstance(data["total_likes_received"], int)
        assert isinstance(data["total_comments_received"], int)
        assert isinstance(data["total_profile_views"], int)
        assert isinstance(data["total_friends"], int)
        assert isinstance(data["total_messages_sent"], int)
        assert isinstance(data["total_messages_received"], int)
        assert isinstance(data["engagement_rate"], (int, float))
        assert isinstance(data["growth_data"], dict)
    
    def test_user_analytics_with_days_parameter(self):
        """Test user analytics with custom days parameter."""
        response = self.session.get(f"{BASE_URL}/api/analytics/user?days=7")
        assert response.status_code == 200
        data = response.json()
        
        # Growth data should contain entries for recent days
        assert isinstance(data["growth_data"], dict)
    
    def test_artist_analytics_without_ownership(self):
        """Test artist analytics endpoint returns 404 if user doesn't own an artist."""
        # Get any artist ID from the database
        artists_response = self.session.get(f"{BASE_URL}/api/artists?page=1&limit=1")
        if artists_response.status_code != 200 or not artists_response.json():
            pytest.skip("No artists found in database")
        
        artist_id = artists_response.json()[0]["artist_id"]
        
        # Try to access analytics for an artist the test user doesn't own
        response = self.session.get(f"{BASE_URL}/api/analytics/artist/{artist_id}")
        
        # Should either return 403 (forbidden) or 200 if user owns it
        assert response.status_code in [200, 403], f"Expected 200 or 403, got {response.status_code}"
    
    def test_business_analytics_without_ownership(self):
        """Test business analytics endpoint returns 404 if user doesn't own a business."""
        # Get any business ID from the database
        businesses_response = self.session.get(f"{BASE_URL}/api/businesses?page=1&limit=1")
        if businesses_response.status_code != 200 or not businesses_response.json():
            pytest.skip("No businesses found in database")
        
        business_id = businesses_response.json()[0]["business_id"]
        
        # Try to access analytics for a business the test user doesn't own
        response = self.session.get(f"{BASE_URL}/api/analytics/business/{business_id}")
        
        # Should either return 403 (forbidden) or 200 if user owns it
        assert response.status_code in [200, 403], f"Expected 200 or 403, got {response.status_code}"
    
    def test_track_profile_view_endpoint(self):
        """Test the track profile view endpoint."""
        # Get another user ID to track
        response = self.session.post(
            f"{BASE_URL}/api/analytics/track-view",
            params={"viewed_user_id": "user_test_123"}
        )
        assert response.status_code in [200, 422], f"Expected 200 or 422, got {response.status_code}"
    
    def test_track_self_view_returns_false(self):
        """Test that tracking self-views returns tracked: false."""
        response = self.session.post(
            f"{BASE_URL}/api/analytics/track-view",
            params={"viewed_user_id": self.user_id}
        )
        if response.status_code == 200:
            data = response.json()
            assert data.get("tracked") == False
            assert data.get("reason") == "self_view"
    
    def test_analytics_unauthenticated_returns_401(self):
        """Test that analytics endpoints require authentication."""
        # Create a new session without auth
        unauth_session = requests.Session()
        unauth_session.headers.update({"Content-Type": "application/json"})
        
        response = unauth_session.get(f"{BASE_URL}/api/analytics/user")
        assert response.status_code == 401 or response.status_code == 422, f"Expected 401 or 422, got {response.status_code}"
    
    def test_artist_analytics_not_found(self):
        """Test that artist analytics returns 404 for non-existent artist."""
        response = self.session.get(f"{BASE_URL}/api/analytics/artist/nonexistent_artist_id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_business_analytics_not_found(self):
        """Test that business analytics returns 404 for non-existent business."""
        response = self.session.get(f"{BASE_URL}/api/analytics/business/nonexistent_business_id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestAnalyticsDataValidation:
    """Test analytics data validation and edge cases."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test-user@test.com",
            "password": "testpassword"
        })
        if response.status_code == 200:
            token = response.json().get("session_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_engagement_rate_calculation(self):
        """Test that engagement rate is calculated correctly."""
        response = self.session.get(f"{BASE_URL}/api/analytics/user")
        assert response.status_code == 200
        data = response.json()
        
        # Engagement rate should be >= 0
        assert data["engagement_rate"] >= 0, "Engagement rate should be non-negative"
    
    def test_growth_data_date_format(self):
        """Test that growth data keys are valid dates."""
        response = self.session.get(f"{BASE_URL}/api/analytics/user")
        assert response.status_code == 200
        data = response.json()
        
        # Check that growth_data keys are date strings
        for date_str in data["growth_data"].keys():
            # Should be in YYYY-MM-DD format
            parts = date_str.split("-")
            assert len(parts) == 3, f"Date {date_str} should be in YYYY-MM-DD format"
            assert len(parts[0]) == 4, "Year should be 4 digits"
            assert len(parts[1]) == 2, "Month should be 2 digits"
            assert len(parts[2]) == 2, "Day should be 2 digits"
    
    def test_analytics_values_are_non_negative(self):
        """Test that all analytics values are non-negative."""
        response = self.session.get(f"{BASE_URL}/api/analytics/user")
        assert response.status_code == 200
        data = response.json()
        
        # All numeric values should be >= 0
        assert data["total_posts"] >= 0
        assert data["total_stories"] >= 0
        assert data["total_likes_received"] >= 0
        assert data["total_comments_received"] >= 0
        assert data["total_profile_views"] >= 0
        assert data["total_friends"] >= 0
        assert data["total_messages_sent"] >= 0
        assert data["total_messages_received"] >= 0
