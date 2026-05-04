"""
Test cases for critical bug fixes:
1. Business category selection - category-tree API and business update with root_category/subcategory
2. Opening hours saving - business update with opening_hours
3. Video upload API structure (backend only - skip video file testing)
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')


class TestCategoryTreeAPI:
    """Test business category-tree endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Register or login test user"""
        # Try login first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_category_user@example.com",
            "password": "testpassword123"
        })
        if login_resp.status_code == 200:
            return login_resp.json()["session_token"]
        
        # Register new user
        register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test Category User",
            "email": "test_category_user@example.com",
            "password": "testpassword123"
        })
        if register_resp.status_code == 200:
            return register_resp.json()["session_token"]
        pytest.skip(f"Auth failed: {register_resp.text}")
    
    def test_category_tree_returns_data(self, auth_token):
        """Test that /api/businesses/category-tree returns categories correctly"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response should contain 'categories' key"
        categories = data["categories"]
        
        assert isinstance(categories, list), "Categories should be a list"
        assert len(categories) > 0, "Should have at least one category"
        
        # Verify structure of first category
        first_cat = categories[0]
        assert "name" in first_cat, "Category should have 'name'"
        assert "slug" in first_cat, "Category should have 'slug'"
        assert "subcategories" in first_cat, "Category should have 'subcategories'"
        
        # Verify subcategories structure
        if first_cat["subcategories"]:
            first_sub = first_cat["subcategories"][0]
            assert "name" in first_sub, "Subcategory should have 'name'"
            assert "slug" in first_sub, "Subcategory should have 'slug'"
            assert "modules" in first_sub, "Subcategory should have 'modules'"
        
        print(f"SUCCESS: Category tree returned {len(categories)} root categories")
        for cat in categories:
            print(f"  - {cat['name']} ({cat['slug']}): {len(cat['subcategories'])} subcategories")
    
    def test_category_tree_expected_categories(self, auth_token):
        """Verify expected root categories exist"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        categories = response.json()["categories"]
        slugs = [cat["slug"] for cat in categories]
        
        expected_slugs = ["sports-wellness", "fashion-retail", "entertainment", "bars-nightlife"]
        for expected in expected_slugs:
            assert expected in slugs, f"Expected category '{expected}' not found"
        
        print(f"SUCCESS: All expected root categories found: {expected_slugs}")


class TestBusinessCategoryUpdate:
    """Test business update with root_category and subcategory"""
    
    @pytest.fixture(scope="class")
    def auth_and_business(self):
        """Get auth token and create/get business"""
        # Login or register
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_business_category@example.com",
            "password": "testpassword123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json()["session_token"]
        else:
            register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
                "name": "Test Business Category User",
                "email": "test_business_category@example.com",
                "password": "testpassword123"
            })
            if register_resp.status_code != 200:
                pytest.skip(f"Auth failed: {register_resp.text}")
            token = register_resp.json()["session_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Check if business exists
        my_biz = requests.get(f"{BASE_URL}/api/businesses/my", headers=headers)
        if my_biz.status_code == 200 and my_biz.json():
            biz_json = my_biz.json()
            if biz_json is None:
                pytest.skip("No business found for user")
            business_id = biz_json["business_id"]
        else:
            # Create business
            create_resp = requests.post(f"{BASE_URL}/api/businesses", headers=headers, json={
                "name": "TEST_CategoryBusiness",
                "root_category": "bars-nightlife",
                "subcategory": "cocktail-bars",
                "description": "Test business for category testing",
                "address": "Test Address 123",
                "latitude": 52.5200,
                "longitude": 13.4050
            })
            if create_resp.status_code != 200:
                pytest.skip(f"Failed to create business: {create_resp.text}")
            business_id = create_resp.json()["business_id"]
        
        return {"token": token, "business_id": business_id}
    
    def test_update_business_category(self, auth_and_business):
        """Test PUT /api/businesses/{business_id} with root_category and subcategory"""
        token = auth_and_business["token"]
        business_id = auth_and_business["business_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Update to a different category
        update_resp = requests.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers,
            json={
                "root_category": "entertainment",
                "subcategory": "cinema"
            }
        )
        
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        updated_biz = update_resp.json()
        assert updated_biz["root_category"] == "entertainment", "Root category should be updated"
        assert updated_biz["subcategory"] == "cinema", "Subcategory should be updated"
        
        print(f"SUCCESS: Business category updated to {updated_biz['root_category']}/{updated_biz['subcategory']}")
    
    def test_update_business_invalid_subcategory(self, auth_and_business):
        """Test that invalid subcategory is rejected"""
        token = auth_and_business["token"]
        business_id = auth_and_business["business_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        update_resp = requests.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers,
            json={
                "root_category": "entertainment",
                "subcategory": "invalid-category-slug"
            }
        )
        
        assert update_resp.status_code == 400, f"Expected 400 for invalid subcategory, got {update_resp.status_code}"
        print("SUCCESS: Invalid subcategory correctly rejected with 400")
    
    def test_update_business_mismatched_category(self, auth_and_business):
        """Test that mismatched root_category/subcategory is rejected"""
        token = auth_and_business["token"]
        business_id = auth_and_business["business_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try to set bars-nightlife subcategory with entertainment root - should fail
        update_resp = requests.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers,
            json={
                "root_category": "entertainment",  # wrong root for cocktail-bars
                "subcategory": "cocktail-bars"  # belongs to bars-nightlife
            }
        )
        
        assert update_resp.status_code == 400, f"Expected 400 for mismatched category, got {update_resp.status_code}"
        print("SUCCESS: Mismatched root_category/subcategory correctly rejected with 400")


class TestOpeningHoursUpdate:
    """Test opening hours saving functionality"""
    
    @pytest.fixture(scope="class")
    def auth_and_business(self):
        """Get auth token and business ID"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_hours_user@example.com",
            "password": "testpassword123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json()["session_token"]
        else:
            register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
                "name": "Test Hours User",
                "email": "test_hours_user@example.com",
                "password": "testpassword123"
            })
            if register_resp.status_code != 200:
                pytest.skip(f"Auth failed: {register_resp.text}")
            token = register_resp.json()["session_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        my_biz = requests.get(f"{BASE_URL}/api/businesses/my", headers=headers)
        if my_biz.status_code == 200 and my_biz.json():
            biz_json = my_biz.json()
            if biz_json is None:
                pytest.skip("No business found for user")
            business_id = biz_json["business_id"]
        else:
            create_resp = requests.post(f"{BASE_URL}/api/businesses", headers=headers, json={
                "name": "TEST_HoursBusiness",
                "root_category": "restaurants",
                "subcategory": "italian",
                "description": "Test business for hours testing",
                "address": "Test Address 456",
                "latitude": 52.5200,
                "longitude": 13.4050
            })
            if create_resp.status_code != 200:
                pytest.skip(f"Failed to create business: {create_resp.text}")
            business_id = create_resp.json()["business_id"]
        
        return {"token": token, "business_id": business_id}
    
    def test_save_opening_hours(self, auth_and_business):
        """Test saving opening hours via PUT /api/businesses/{business_id}"""
        token = auth_and_business["token"]
        business_id = auth_and_business["business_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        opening_hours = {
            "schedule": {
                "Monday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Tuesday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Wednesday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Thursday": {"enabled": True, "periods": [{"open": "09:00", "close": "20:00"}]},
                "Friday": {"enabled": True, "periods": [{"open": "09:00", "close": "22:00"}]},
                "Saturday": {"enabled": True, "periods": [{"open": "10:00", "close": "22:00"}]},
                "Sunday": {"enabled": False, "periods": [{"open": "12:00", "close": "18:00"}]}
            }
        }
        
        update_resp = requests.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers,
            json={"opening_hours": opening_hours}
        )
        
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        updated_biz = update_resp.json()
        assert "opening_hours" in updated_biz, "Response should contain opening_hours"
        
        # Verify data persisted by fetching business detail
        detail_resp = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers
        )
        assert detail_resp.status_code == 200
        
        biz_detail = detail_resp.json()
        biz_data = biz_detail.get("business", biz_detail)
        saved_hours = biz_data.get("opening_hours")
        
        assert saved_hours is not None, "Opening hours should be saved"
        assert "schedule" in saved_hours, "Should have schedule structure"
        assert saved_hours["schedule"]["Monday"]["enabled"] == True
        assert saved_hours["schedule"]["Sunday"]["enabled"] == False
        
        print("SUCCESS: Opening hours saved and persisted correctly")
        print(f"  Monday: {saved_hours['schedule']['Monday']}")
        print(f"  Sunday: {saved_hours['schedule']['Sunday']}")
    
    def test_opening_hours_with_multiple_periods(self, auth_and_business):
        """Test saving opening hours with multiple periods (e.g., lunch + dinner)"""
        token = auth_and_business["token"]
        business_id = auth_and_business["business_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        opening_hours = {
            "schedule": {
                "Monday": {
                    "enabled": True,
                    "periods": [
                        {"open": "11:00", "close": "14:00"},  # Lunch
                        {"open": "18:00", "close": "22:00"}   # Dinner
                    ]
                },
                "Tuesday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Wednesday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Thursday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Friday": {"enabled": True, "periods": [{"open": "09:00", "close": "18:00"}]},
                "Saturday": {"enabled": False, "periods": []},
                "Sunday": {"enabled": False, "periods": []}
            }
        }
        
        update_resp = requests.put(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers,
            json={"opening_hours": opening_hours}
        )
        
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}"
        
        # Verify multiple periods saved
        detail_resp = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers=headers
        )
        biz_detail = detail_resp.json()
        biz_data = biz_detail.get("business", biz_detail)
        saved_hours = biz_data.get("opening_hours", {}).get("schedule", {})
        
        monday = saved_hours.get("Monday", {})
        periods = monday.get("periods", [])
        
        assert len(periods) == 2, f"Monday should have 2 periods, got {len(periods)}"
        assert periods[0]["open"] == "11:00"
        assert periods[1]["open"] == "18:00"
        
        print("SUCCESS: Multiple opening hour periods saved correctly")


class TestMediaUploadAPI:
    """Test media upload API structure (no actual file upload)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_media_api@example.com",
            "password": "testpassword123"
        })
        if login_resp.status_code == 200:
            return login_resp.json()["session_token"]
        
        register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test Media User",
            "email": "test_media_api@example.com",
            "password": "testpassword123"
        })
        if register_resp.status_code != 200:
            pytest.skip(f"Auth failed: {register_resp.text}")
        return register_resp.json()["session_token"]
    
    def test_media_upload_endpoint_exists(self, auth_token):
        """Verify that media upload endpoint exists and requires file"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Test endpoint exists (should return 422 without file, not 404)
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            headers=headers,
            data={"resource_type": "video"}
        )
        
        # 422 (validation error) means endpoint exists but needs file
        # 404 would mean endpoint doesn't exist
        assert response.status_code != 404, "Media upload endpoint should exist"
        
        if response.status_code == 422:
            print("SUCCESS: Media upload endpoint exists (returns 422 without file)")
        else:
            print(f"Media upload endpoint returned: {response.status_code}")


class TestArtistEventDateTimePicker:
    """Test artist event creation API (verifying start_time format)"""
    
    @pytest.fixture(scope="class")
    def auth_and_artist(self):
        """Get auth token and artist ID"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_artist_event@example.com",
            "password": "testpassword123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json()["session_token"]
        else:
            register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
                "name": "Test Artist Event User",
                "email": "test_artist_event@example.com",
                "password": "testpassword123"
            })
            if register_resp.status_code != 200:
                pytest.skip(f"Auth failed: {register_resp.text}")
            token = register_resp.json()["session_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Check for existing artist
        my_artist = requests.get(f"{BASE_URL}/api/artists/my", headers=headers)
        if my_artist.status_code == 200 and my_artist.json():
            artist_id = my_artist.json()["artist_id"]
        else:
            # Create artist
            create_resp = requests.post(f"{BASE_URL}/api/artists", headers=headers, json={
                "name": "TEST_ArtistForEvents",
                "bio": "Test artist for event testing",
                "genres": ["Rock", "Jazz"],
                "socials": {},
                "gallery_images": [],
                "fan_gallery": [],
                "video_urls": []
            })
            if create_resp.status_code != 200:
                pytest.skip(f"Failed to create artist: {create_resp.text}")
            artist_id = create_resp.json()["artist_id"]
        
        return {"token": token, "artist_id": artist_id}
    
    def test_create_event_with_datetime(self, auth_and_artist):
        """Test creating event with ISO datetime (from DateTimePicker)"""
        token = auth_and_artist["token"]
        artist_id = auth_and_artist["artist_id"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create event with ISO format datetime (simulating DateTimePicker output)
        event_data = {
            "artist_id": artist_id,
            "title": "TEST_ArtistConcert",
            "description": "Test concert with proper datetime",
            "start_time": "2026-02-15T20:00:00.000Z",  # ISO format from DateTimePicker
            "location": "Test Venue",
            "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="  # Minimal valid base64
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/events",
            headers=headers,
            json=event_data
        )
        
        assert create_resp.status_code == 200, f"Expected 200, got {create_resp.status_code}: {create_resp.text}"
        
        event = create_resp.json()
        assert event["title"] == "TEST_ArtistConcert"
        assert "start_time" in event
        assert event["artist"]["artist_id"] == artist_id
        
        print(f"SUCCESS: Artist event created with ISO datetime: {event['start_time']}")
        
        # Cleanup - delete event
        delete_resp = requests.delete(
            f"{BASE_URL}/api/events/{event['event_id']}",
            headers=headers
        )
        print(f"Cleanup: Event deleted, status: {delete_resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
