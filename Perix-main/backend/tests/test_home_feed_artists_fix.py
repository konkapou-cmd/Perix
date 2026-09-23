"""
Test Home Feed Artists Fix and Profile API Endpoints

Tests for the following bug fixes:
1. Home feed API now returns artists array (was missing before)
2. User public profile API works correctly
3. Business detail API works correctly 
4. Artist detail API works correctly
5. Common friends API uses correct other_user_id parameter
6. Category translations (verify translateCategory import in profile.tsx)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8000").rstrip("/")
TEST_TOKEN = "session_bfbe2a09ecde4b1184e8f62a0040c776"
TEST_USER_ID = "user_b87ac9d31a86"


class TestHomeFeedArtistsFix:
    """Test that home feed API now returns artists array"""
    
    def test_home_feed_returns_artists_array(self):
        """Verify the home feed response includes 'artists' key with array type"""
        response = requests.get(
            f"{BASE_URL}/api/feed/home",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all expected keys are present
        assert "posts" in data, "Home feed should return 'posts'"
        assert "stories" in data, "Home feed should return 'stories'"
        assert "events" in data, "Home feed should return 'events'"
        assert "businesses" in data, "Home feed should return 'businesses'"
        assert "artists" in data, "Home feed should return 'artists' - THIS WAS THE BUG FIX"
        
        # Verify types
        assert isinstance(data["posts"], list), "posts should be a list"
        assert isinstance(data["stories"], list), "stories should be a list"
        assert isinstance(data["events"], list), "events should be a list"
        assert isinstance(data["businesses"], list), "businesses should be a list"
        assert isinstance(data["artists"], list), "artists should be a list"
        
        print(f"✅ Home feed returns artists array with {len(data['artists'])} artists")
        
    def test_home_feed_artist_response_structure(self):
        """Verify artist objects in home feed have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/feed/home",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        artists = data.get("artists", [])
        
        if len(artists) > 0:
            artist = artists[0]
            # Verify required fields based on ArtistResponse model
            required_fields = ["artist_id", "owner_id", "name", "created_at"]
            for field in required_fields:
                assert field in artist, f"Artist should have '{field}' field"
            
            # Verify optional fields structure
            optional_fields = ["bio", "genres", "socials", "town", "address", 
                              "latitude", "longitude", "gallery_images", 
                              "fan_gallery", "video_urls", "profile_photo", "cover_photo"]
            for field in optional_fields:
                if field in artist:
                    print(f"  - {field}: present")
            
            print(f"✅ Artist structure verified: {artist.get('name', 'Unknown')}")
        else:
            print("⚠️ No artists in database to verify structure (acceptable)")
    
    def test_home_feed_with_location_params(self):
        """Test home feed with location parameters"""
        response = requests.get(
            f"{BASE_URL}/api/feed/home",
            params={"latitude": 37.9838, "longitude": 23.7275, "radius_km": 100},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "artists" in data, "artists should be in response even with location filter"
        print(f"✅ Home feed with location returns artists: {len(data['artists'])} artists")


class TestUserPublicProfileAPI:
    """Test user public profile API"""
    
    def test_get_user_public_profile_success(self):
        """Test getting a valid user's public profile"""
        response = requests.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/public",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user" in data, "Response should contain 'user'"
        assert "posts" in data, "Response should contain 'posts'"
        assert "stories" in data, "Response should contain 'stories'"
        
        assert data["user"]["user_id"] == TEST_USER_ID
        print(f"✅ User public profile API works for {TEST_USER_ID}")
        
    def test_get_user_public_profile_invalid_id(self):
        """Test getting profile for non-existent user returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/users/invalid_user_12345/public",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid user returns 404 correctly")


class TestBusinessDetailAPI:
    """Test business detail API"""
    
    def test_get_businesses_list(self):
        """First get list of businesses to find a valid ID"""
        response = requests.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200
        return response.json()
    
    def test_get_business_detail_if_exists(self):
        """Test business detail API if any business exists"""
        # First get list of businesses
        list_response = requests.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert list_response.status_code == 200
        businesses = list_response.json()
        
        if len(businesses) == 0:
            pytest.skip("No businesses in database to test")
        
        business_id = businesses[0]["business_id"]
        
        # Now get detail
        response = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "business" in data, "Response should contain 'business'"
        assert "events" in data, "Response should contain 'events'"
        assert "posts" in data, "Response should contain 'posts'"
        assert "stories" in data, "Response should contain 'stories'"
        assert "is_owner" in data, "Response should contain 'is_owner'"
        assert "is_favorited" in data, "Response should contain 'is_favorited'"
        
        print(f"✅ Business detail API works for {business_id}")
        
    def test_get_business_detail_invalid_id(self):
        """Test getting detail for non-existent business returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/invalid_biz_12345",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid business ID returns 404 correctly")


class TestArtistDetailAPI:
    """Test artist detail API"""
    
    def test_get_artists_list(self):
        """Get list of artists"""
        response = requests.get(
            f"{BASE_URL}/api/artists",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200
        return response.json()
    
    def test_get_artist_detail_if_exists(self):
        """Test artist detail API if any artist exists"""
        # First get list of artists
        list_response = requests.get(
            f"{BASE_URL}/api/artists",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert list_response.status_code == 200
        artists = list_response.json()
        
        if len(artists) == 0:
            pytest.skip("No artists in database to test")
        
        artist_id = artists[0]["artist_id"]
        
        # Now get detail
        response = requests.get(
            f"{BASE_URL}/api/artists/{artist_id}",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "artist" in data, "Response should contain 'artist'"
        assert "events" in data, "Response should contain 'events'"
        
        # Verify artist structure
        artist = data["artist"]
        assert "artist_id" in artist
        assert "name" in artist
        assert "owner_id" in artist
        
        print(f"✅ Artist detail API works for {artist_id} ({artist.get('name', 'Unknown')})")
        
    def test_get_artist_detail_invalid_id(self):
        """Test getting detail for non-existent artist returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/artists/invalid_artist_12345",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid artist ID returns 404 correctly")


class TestCommonFriendsAPI:
    """Test common friends API with correct other_user_id parameter"""
    
    def test_common_friends_with_correct_param(self):
        """Verify common friends API uses other_user_id parameter (bug fix)"""
        response = requests.get(
            f"{BASE_URL}/api/friends/common",
            params={"other_user_id": TEST_USER_ID},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        # Should return 200 with the correct parameter
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "common" in data, "Response should contain 'common' list"
        assert "is_friend" in data, "Response should contain 'is_friend' boolean"
        assert isinstance(data["common"], list), "common should be a list"
        assert isinstance(data["is_friend"], bool), "is_friend should be boolean"
        
        print(f"✅ Common friends API works with other_user_id param")
        print(f"   - Common friends count: {len(data['common'])}")
        print(f"   - Is friend: {data['is_friend']}")
        
    def test_common_friends_with_wrong_param_fails(self):
        """Verify that using the old 'user_id' param fails with 422"""
        response = requests.get(
            f"{BASE_URL}/api/friends/common",
            params={"user_id": TEST_USER_ID},  # Wrong param name
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        # Should fail with 422 (validation error) since user_id is not expected
        assert response.status_code == 422, f"Expected 422 with wrong param, got {response.status_code}"
        print("✅ Using wrong param 'user_id' correctly fails with 422")


class TestCategoryTranslations:
    """Test category tree API and translations availability"""
    
    def test_category_tree_returns_slugs(self):
        """Verify category tree returns slugs for translation"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "categories" in data, "Response should have categories"
        
        categories = data["categories"]
        if len(categories) > 0:
            category = categories[0]
            assert "slug" in category, "Category should have slug for translation"
            assert "name" in category, "Category should have name"
            
            if "subcategories" in category and len(category["subcategories"]) > 0:
                sub = category["subcategories"][0]
                assert "slug" in sub, "Subcategory should have slug for translation"
                
            print(f"✅ Category tree returns slugs: {[c['slug'] for c in categories[:3]]}...")
        else:
            print("⚠️ No categories found (acceptable)")
            
    def test_categories_endpoint(self):
        """Test the /categories endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Categories should return a list"
        print(f"✅ Categories endpoint returns {len(data)} categories")


class TestErrorHandlingSerialization:
    """Test that error handling properly serializes error messages"""
    
    def test_validation_error_returns_proper_json(self):
        """Test that validation errors are properly JSON serialized"""
        # Send invalid data to trigger validation error
        response = requests.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"},
            json={}  # Missing required 'text' field
        )
        
        # Should return 422 with proper JSON error
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        
        # Verify the response is valid JSON
        try:
            data = response.json()
            assert "detail" in data, "Error response should have 'detail' field"
            print(f"✅ Validation errors properly serialized as JSON")
        except Exception as e:
            pytest.fail(f"Error response not valid JSON: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
