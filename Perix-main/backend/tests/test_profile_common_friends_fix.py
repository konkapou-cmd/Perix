"""
Test Profile and Common Friends API Fix
Tests the fix for getCommonFriends API parameter mismatch (user_id -> other_user_id)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'http://localhost:8000').rstrip('/')

# Test credentials from the request
TEST_TOKEN = "session_bfbe2a09ecde4b1184e8f62a0040c776"
TEST_USER_ID = "user_b87ac9d31a86"


class TestCommonFriendsAPI:
    """Test the /api/friends/common endpoint with correct parameter"""
    
    def test_common_friends_with_other_user_id_parameter(self):
        """Test that common friends endpoint works with other_user_id parameter"""
        # This was the key fix - using other_user_id instead of user_id
        response = requests.get(
            f"{BASE_URL}/api/friends/common",
            params={"other_user_id": TEST_USER_ID},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Common friends response status: {response.status_code}")
        print(f"Common friends response: {response.text[:500] if response.text else 'empty'}")
        
        # Should return 200, not 422 (validation error)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "common" in data, "Response should contain 'common' field"
        assert "is_friend" in data, "Response should contain 'is_friend' field"
        assert isinstance(data["common"], list), "'common' should be a list"
        assert isinstance(data["is_friend"], bool), "'is_friend' should be a boolean"
        print(f"SUCCESS: Common friends endpoint works correctly with other_user_id parameter")
    
    def test_common_friends_missing_other_user_id(self):
        """Test that endpoint returns error when other_user_id is missing"""
        response = requests.get(
            f"{BASE_URL}/api/friends/common",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Missing param response status: {response.status_code}")
        
        # Should return 422 validation error when required param is missing
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("SUCCESS: Endpoint correctly requires other_user_id parameter")
    
    def test_common_friends_with_invalid_user_id(self):
        """Test error handling for non-existent user"""
        response = requests.get(
            f"{BASE_URL}/api/friends/common",
            params={"other_user_id": "non_existent_user_12345"},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Invalid user response status: {response.status_code}")
        
        # Should return 404 for non-existent user
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Endpoint correctly returns 404 for non-existent user")


class TestUserPublicProfile:
    """Test user public profile endpoint"""
    
    def test_get_user_public_profile(self):
        """Test that user public profile loads correctly"""
        response = requests.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/public",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"User profile response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "user" in data, "Response should contain 'user' field"
        assert "posts" in data, "Response should contain 'posts' field"
        assert "stories" in data, "Response should contain 'stories' field"
        
        # Verify user data structure
        user = data["user"]
        assert "user_id" in user, "User should have user_id"
        assert "name" in user, "User should have name"
        assert "email" in user, "User should have email"
        
        print(f"SUCCESS: User public profile loads correctly")
        print(f"User name: {user.get('name')}, Posts count: {len(data['posts'])}, Stories count: {len(data['stories'])}")
    
    def test_get_invalid_user_profile(self):
        """Test error handling for non-existent user"""
        response = requests.get(
            f"{BASE_URL}/api/users/invalid_user_id/public",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Invalid user profile response status: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Endpoint correctly returns 404 for non-existent user")


class TestBusinessDetail:
    """Test business detail endpoint"""
    
    def test_get_business_list_first(self):
        """Get a business to test with"""
        response = requests.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Businesses list response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        businesses = response.json()
        if businesses:
            print(f"Found {len(businesses)} businesses")
            return businesses[0].get("business_id")
        return None
    
    def test_get_business_detail(self):
        """Test that business detail loads correctly"""
        # First get a business ID
        list_response = requests.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        if list_response.status_code != 200:
            pytest.skip("Cannot get businesses list")
        
        businesses = list_response.json()
        if not businesses:
            pytest.skip("No businesses available to test")
        
        business_id = businesses[0].get("business_id")
        print(f"Testing business detail for: {business_id}")
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Business detail response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "business" in data, "Response should contain 'business' field"
        assert "events" in data, "Response should contain 'events' field"
        assert "posts" in data, "Response should contain 'posts' field"
        assert "stories" in data, "Response should contain 'stories' field"
        assert "is_owner" in data, "Response should contain 'is_owner' field"
        assert "is_favorited" in data, "Response should contain 'is_favorited' field"
        
        business = data["business"]
        assert "business_id" in business, "Business should have business_id"
        assert "name" in business, "Business should have name"
        
        print(f"SUCCESS: Business detail loads correctly")
        print(f"Business name: {business.get('name')}")
    
    def test_get_invalid_business_detail(self):
        """Test error handling for non-existent business"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/invalid_business_id",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Invalid business detail response status: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Endpoint correctly returns 404 for non-existent business")


class TestArtistDetail:
    """Test artist detail endpoint"""
    
    def test_get_artist_detail(self):
        """Test that artist detail loads correctly"""
        # First get an artist ID
        list_response = requests.get(
            f"{BASE_URL}/api/artists",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        if list_response.status_code != 200:
            pytest.skip("Cannot get artists list")
        
        artists = list_response.json()
        if not artists:
            pytest.skip("No artists available to test")
        
        artist_id = artists[0].get("artist_id")
        print(f"Testing artist detail for: {artist_id}")
        
        response = requests.get(
            f"{BASE_URL}/api/artists/{artist_id}",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Artist detail response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "artist" in data, "Response should contain 'artist' field"
        assert "events" in data, "Response should contain 'events' field"
        
        artist = data["artist"]
        assert "artist_id" in artist, "Artist should have artist_id"
        assert "name" in artist, "Artist should have name"
        
        print(f"SUCCESS: Artist detail loads correctly")
        print(f"Artist name: {artist.get('name')}")
    
    def test_get_invalid_artist_detail(self):
        """Test error handling for non-existent artist"""
        response = requests.get(
            f"{BASE_URL}/api/artists/invalid_artist_id",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Invalid artist detail response status: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Endpoint correctly returns 404 for non-existent artist")


class TestCategoryTree:
    """Test category tree endpoint for translations"""
    
    def test_get_category_tree(self):
        """Test that category tree returns proper structure with slugs for translation"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"Category tree response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response should contain 'categories' field"
        
        categories = data["categories"]
        assert isinstance(categories, list), "'categories' should be a list"
        assert len(categories) > 0, "Should have at least one category"
        
        # Check category structure
        first_category = categories[0]
        assert "name" in first_category, "Category should have 'name'"
        assert "slug" in first_category, "Category should have 'slug' for translation"
        assert "subcategories" in first_category, "Category should have 'subcategories'"
        
        # Check subcategory structure
        if first_category["subcategories"]:
            first_subcategory = first_category["subcategories"][0]
            assert "name" in first_subcategory, "Subcategory should have 'name'"
            assert "slug" in first_subcategory, "Subcategory should have 'slug' for translation"
        
        print(f"SUCCESS: Category tree returns proper structure with slugs")
        print(f"Found {len(categories)} root categories")
        
        # Print some slugs for verification
        for cat in categories[:3]:
            print(f"  - {cat.get('slug')}: {cat.get('name')}")
    
    def test_category_tree_slug_format(self):
        """Verify that slugs are in the correct format for translation keys"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        assert response.status_code == 200
        
        data = response.json()
        categories = data["categories"]
        
        # Verify slug format (should be lowercase with hyphens)
        for category in categories:
            slug = category.get("slug", "")
            # Slugs should be non-empty strings that can be used as translation keys
            assert slug, f"Category slug should not be empty"
            assert isinstance(slug, str), f"Slug should be a string: {slug}"
            
            for subcategory in category.get("subcategories", []):
                sub_slug = subcategory.get("slug", "")
                assert sub_slug, f"Subcategory slug should not be empty"
                assert isinstance(sub_slug, str), f"Subcategory slug should be a string: {sub_slug}"
        
        print("SUCCESS: All slugs are valid strings that can be used as translation keys")


class TestMyFriends:
    """Test my friends endpoint"""
    
    def test_get_my_friends(self):
        """Test that my friends endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/friends/me",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"}
        )
        
        print(f"My friends response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"SUCCESS: My friends endpoint works correctly")
        print(f"Found {len(data)} friends")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
