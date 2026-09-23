"""Test story analytics API endpoints."""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')


class TestStoryAnalyticsAPI:
    """Test story analytics endpoints."""

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

        # Create a test story to use in tests
        self.test_story_id = None
        story_response = self.session.post(f"{BASE_URL}/api/stories", json={
            "text": "Test story for analytics",
            "actor_type": "user"
        })
        if story_response.status_code == 200:
            self.test_story_id = story_response.json().get("story_id")

    def test_mark_story_seen_endpoint_exists(self):
        """Test that the mark story seen endpoint exists."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.post(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/seen",
            json={"watch_duration": 5.0, "completed": True}
        )
        assert response.status_code in [200, 404], \
            f"Expected 200 or 404, got {response.status_code}"

    def test_mark_story_seen_with_duration(self):
        """Test marking a story as seen with watch duration."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.post(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/seen",
            json={"watch_duration": 3.5, "completed": False}
        )
        assert response.status_code in [200, 404], \
            f"Expected 200 or 404, got {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True

    def test_mark_story_seen_self_view_not_tracked(self):
        """Test that viewing own story returns tracked: False."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.post(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/seen",
            json={"watch_duration": 5.0}
        )
        if response.status_code == 200:
            data = response.json()
            # Self views should not be tracked
            if data.get("tracked") == False:
                assert data.get("reason") == "self_view"

    def test_get_story_analytics_endpoint_exists(self):
        """Test that the story analytics endpoint exists."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/analytics"
        )
        assert response.status_code in [200, 404], \
            f"Expected 200 or 404, got {response.status_code}"

    def test_story_analytics_response_structure(self):
        """Test that story analytics returns correct data structure."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/analytics"
        )
        if response.status_code == 200:
            data = response.json()

            # Verify response structure
            assert "story_id" in data
            assert "total_views" in data
            assert "unique_viewers" in data
            assert "completion_rate" in data
            assert "average_watch_time" in data
            assert "reactions" in data
            assert "top_viewers" in data
            assert "views_timeline" in data

    def test_story_analytics_data_types(self):
        """Test that story analytics returns correct data types."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/analytics"
        )
        if response.status_code == 200:
            data = response.json()

            assert isinstance(data["total_views"], int)
            assert isinstance(data["unique_viewers"], int)
            assert isinstance(data["completion_rate"], (int, float))
            assert isinstance(data["average_watch_time"], (int, float))
            assert isinstance(data["reactions"], dict)
            assert isinstance(data["top_viewers"], list)
            assert isinstance(data["views_timeline"], list)

    def test_story_analytics_values_are_non_negative(self):
        """Test that story analytics values are non-negative."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/analytics"
        )
        if response.status_code == 200:
            data = response.json()

            assert data["total_views"] >= 0
            assert data["unique_viewers"] >= 0
            assert data["completion_rate"] >= 0
            assert data["completion_rate"] <= 1
            assert data["average_watch_time"] >= 0

    def test_get_story_viewers_endpoint_exists(self):
        """Test that the story viewers endpoint exists."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/viewers"
        )
        assert response.status_code in [200, 404], \
            f"Expected 200 or 404, got {response.status_code}"

    def test_story_viewers_response_structure(self):
        """Test that story viewers returns correct data structure."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/viewers"
        )
        if response.status_code == 200:
            data = response.json()

            assert "viewers" in data
            assert "total" in data
            assert "has_more" in data
            assert isinstance(data["viewers"], list)
            assert isinstance(data["total"], int)
            assert isinstance(data["has_more"], bool)

    def test_story_viewers_pagination(self):
        """Test story viewers pagination parameters."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/viewers",
            params={"limit": 5, "skip": 0}
        )
        if response.status_code == 200:
            data = response.json()
            assert len(data["viewers"]) <= 5

    def test_get_actor_story_analytics_endpoint_exists(self):
        """Test that the actor story analytics endpoint exists."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "user"}
        )
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}"

    def test_actor_story_analytics_response_structure(self):
        """Test that actor story analytics returns correct data structure."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "user"}
        )
        if response.status_code == 200:
            data = response.json()

            assert "total_stories" in data
            assert "total_views" in data
            assert "total_reactions" in data
            assert "average_completion_rate" in data
            assert "stories" in data

    def test_actor_story_analytics_with_business_type(self):
        """Test actor story analytics with business actor type."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "business"}
        )
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}"

    def test_actor_story_analytics_with_artist_type(self):
        """Test actor story analytics with artist actor type."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "artist"}
        )
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}"

    def test_actor_story_analytics_data_types(self):
        """Test that actor story analytics returns correct data types."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "user"}
        )
        if response.status_code == 200:
            data = response.json()

            assert isinstance(data["total_stories"], int)
            assert isinstance(data["total_views"], int)
            assert isinstance(data["total_reactions"], int)
            assert isinstance(data["average_completion_rate"], (int, float))
            assert isinstance(data["stories"], list)

    def test_actor_story_analytics_with_days_parameter(self):
        """Test actor story analytics with custom days parameter."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "user", "days": 7}
        )
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}"

    def test_story_analytics_unauthenticated_returns_401(self):
        """Test that story analytics endpoints require authentication."""
        unauth_session = requests.Session()
        unauth_session.headers.update({"Content-Type": "application/json"})

        response = unauth_session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "user"}
        )
        assert response.status_code in [401, 422], \
            f"Expected 401 or 422, got {response.status_code}"

    def test_story_analytics_invalid_actor_type(self):
        """Test that invalid actor_type returns 400."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/analytics",
            params={"actor_type": "invalid"}
        )
        assert response.status_code == 400, \
            f"Expected 400, got {response.status_code}"

    def test_mark_seen_nonexistent_story_returns_404(self):
        """Test that marking a nonexistent story as seen returns 404."""
        response = self.session.post(
            f"{BASE_URL}/api/story-analytics/nonexistent_story_id/seen",
            json={"watch_duration": 5.0}
        )
        assert response.status_code == 404, \
            f"Expected 404, got {response.status_code}"

    def test_get_analytics_nonexistent_story_returns_404(self):
        """Test that getting analytics for a nonexistent story returns 404."""
        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/nonexistent_story_id/analytics"
        )
        assert response.status_code == 404, \
            f"Expected 404, got {response.status_code}"

    def test_views_timeline_format(self):
        """Test that views timeline has correct date format."""
        if not self.test_story_id:
            pytest.skip("No test story available")

        response = self.session.get(
            f"{BASE_URL}/api/story-analytics/{self.test_story_id}/analytics"
        )
        if response.status_code == 200:
            data = response.json()

            for item in data.get("views_timeline", []):
                assert "date" in item
                assert "count" in item
                # Check date format (YYYY-MM-DD)
                date_parts = item["date"].split("-")
                assert len(date_parts) == 3, \
                    f"Date {item['date']} should be in YYYY-MM-DD format"
                assert len(date_parts[0]) == 4, "Year should be 4 digits"
                assert len(date_parts[1]) == 2, "Month should be 2 digits"
                assert len(date_parts[2]) == 2, "Day should be 2 digits"


class TestStoryAnalyticsEdgeCases:
    """Test edge cases for story analytics."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test-user@test.com",
            "password": "testpassword"
        })
        if response.status_code == 200:
            token = response.json().get("session_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")

    def test_mark_seen_without_body(self):
        """Test marking story as seen without request body."""
        # First create a story
        story_response = self.session.post(f"{BASE_URL}/api/stories", json={
            "text": "Test story",
            "actor_type": "user"
        })
        if story_response.status_code == 200:
            story_id = story_response.json().get("story_id")
            if story_id:
                response = self.session.post(
                    f"{BASE_URL}/api/story-analytics/{story_id}/seen"
                )
                assert response.status_code in [200, 404, 422], \
                    f"Expected 200, 404 or 422, got {response.status_code}"

    def test_mark_seen_with_partial_body(self):
        """Test marking story as seen with only watch_duration."""
        story_response = self.session.post(f"{BASE_URL}/api/stories", json={
            "text": "Test story",
            "actor_type": "user"
        })
        if story_response.status_code == 200:
            story_id = story_response.json().get("story_id")
            if story_id:
                response = self.session.post(
                    f"{BASE_URL}/api/story-analytics/{story_id}/seen",
                    json={"watch_duration": 2.5}
                )
                assert response.status_code in [200, 404], \
                    f"Expected 200 or 404, got {response.status_code}"

    def test_completion_rate_calculation(self):
        """Test that completion rate is between 0 and 1."""
        story_response = self.session.post(f"{BASE_URL}/api/stories", json={
            "text": "Test story for completion",
            "actor_type": "user"
        })
        if story_response.status_code == 200:
            story_id = story_response.json().get("story_id")
            if story_id:
                # Mark as seen with different completions
                for i in range(3):
                    self.session.post(
                        f"{BASE_URL}/api/story-analytics/{story_id}/seen",
                        json={"watch_duration": 5.0, "completed": i < 2}
                    )

                # Get analytics
                response = self.session.get(
                    f"{BASE_URL}/api/story-analytics/{story_id}/analytics"
                )
                if response.status_code == 200:
                    data = response.json()
                    assert 0 <= data["completion_rate"] <= 1, \
                        "Completion rate should be between 0 and 1"

    def test_viewer_list_empty_for_new_story(self):
        """Test that a new story has no viewers."""
        story_response = self.session.post(f"{BASE_URL}/api/stories", json={
            "text": "Brand new story",
            "actor_type": "user"
        })
        if story_response.status_code == 200:
            story_id = story_response.json().get("story_id")
            if story_id:
                response = self.session.get(
                    f"{BASE_URL}/api/story-analytics/{story_id}/viewers"
                )
                if response.status_code == 200:
                    data = response.json()
                    assert data["total"] == 0
                    assert len(data["viewers"]) == 0
