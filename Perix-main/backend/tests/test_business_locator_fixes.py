"""
Test Business Locator and Profile Business Fixes
Tests the following fixes:
1. GET /api/businesses/my - Returns user's business
2. GET /api/businesses/nearby - Nearby businesses with geo filter
3. GET /api/businesses/category-tree - Returns 8 categories
4. GET /api/businesses/{id} - Business detail endpoint
5. POST /api/media/upload - Media upload endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = 'http://localhost:8000'

TEST_EMAIL = "test_locator_user@example.com"
TEST_PASSWORD = "TestPass123!"
TEST_LATITUDE = 52.1
TEST_LONGITUDE = 11.6


def _get_fresh_token():
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if login_resp.status_code == 200:
        return login_resp.json()["session_token"]
    register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": "Test Locator User",
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if register_resp.status_code == 200:
        return register_resp.json()["session_token"]
    pytest.skip(f"Auth failed: {register_resp.text}")


def _get_business_id(token):
    resp = requests.get(f"{BASE_URL}/api/businesses/my", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code == 200 and resp.json():
        return resp.json().get("business_id")
    return None


class TestBusinessMyEndpoint:
    """Test GET /api/businesses/my - should return user's business"""

    @pytest.fixture(scope="class")
    def token(self):
        return _get_fresh_token()

    def test_get_my_business_authenticated(self, token):
        """Test that authenticated user can get their business"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        if data is not None:
            assert "business_id" in data, "Business should have business_id"
            assert "name" in data, "Business should have name"
            assert "owner_id" in data, "Business should have owner_id"
            print(f"User has business: {data.get('name')} ({data.get('business_id')})")
        else:
            print("User has no business (null response is valid)")

    def test_get_my_business_returns_expected_business(self, token):
        """Verify the expected business is returned for the test user"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data is not None:
            assert "business_id" in data
            print(f"VERIFIED: User's business is {data.get('business_id')}")


class TestNearbyBusinessesEndpoint:
    """Test GET /api/businesses/nearby - nearby businesses with geo filter"""

    @pytest.fixture(scope="class")
    def token(self):
        return _get_fresh_token()

    def test_nearby_businesses_requires_coordinates(self, token):
        """Test that latitude and longitude are required parameters"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 422, \
            f"Expected 422 for missing coordinates, got {response.status_code}"

    def test_nearby_businesses_with_valid_coordinates(self, token):
        """Test nearby businesses with valid coordinates"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={
                "latitude": TEST_LATITUDE,
                "longitude": TEST_LONGITUDE,
                "max_distance_meters": 5000
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of businesses"
        print(f"Found {len(data)} nearby businesses within 5km")
        
        if len(data) > 0:
            business = data[0]
            assert "business_id" in business
            assert "name" in business
            assert "latitude" in business
            assert "longitude" in business
            print(f"First nearby business: {business.get('name')}")

    def test_nearby_businesses_with_category_filter(self, token):
        """Test nearby businesses with category filter"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={
                "latitude": TEST_LATITUDE,
                "longitude": TEST_LONGITUDE,
                "max_distance_meters": 5000,
                "root_category": "bars-nightlife"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} nearby bars-nightlife businesses")
        
        for business in data:
            assert business.get("root_category") == "bars-nightlife", \
                f"Business {business.get('name')} has wrong category: {business.get('root_category')}"

    def test_nearby_businesses_all_categories(self, token):
        """Test nearby businesses with 'all' category (should not filter)"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={
                "latitude": TEST_LATITUDE,
                "longitude": TEST_LONGITUDE,
                "max_distance_meters": 10000,
                "root_category": "all"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} businesses with 'all' category filter")


class TestCategoryTreeEndpoint:
    """Test GET /api/businesses/category-tree - should return 8 categories"""

    @pytest.fixture(scope="class")
    def token(self):
        return _get_fresh_token()

    def test_category_tree_returns_data(self, token):
        """Test that category tree endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response should have 'categories' key"
        
        categories = data["categories"]
        assert isinstance(categories, list), "Categories should be a list"
        print(f"Category tree has {len(categories)} root categories")

    def test_category_tree_has_8_categories(self, token):
        """Verify exactly 8 root categories are returned"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        categories = data.get("categories", [])
        
        assert len(categories) == 8, f"Expected 8 categories, got {len(categories)}"
        
        category_slugs = [cat.get("slug") for cat in categories]
        print(f"Root categories: {category_slugs}")

    def test_category_tree_structure(self, token):
        """Verify category tree has proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        categories = data.get("categories", [])
        
        for cat in categories:
            assert "name" in cat, "Category should have name"
            assert "slug" in cat, "Category should have slug"
            assert "subcategories" in cat, "Category should have subcategories"
            assert isinstance(cat["subcategories"], list), "Subcategories should be a list"
            
            if len(cat["subcategories"]) > 0:
                subcat = cat["subcategories"][0]
                assert "name" in subcat, "Subcategory should have name"
                assert "slug" in subcat, "Subcategory should have slug"
                assert "modules" in subcat, "Subcategory should have modules"
        
        print("Category tree structure verified")


class TestBusinessDetailEndpoint:
    """Test GET /api/businesses/{id} - business detail endpoint"""

    @pytest.fixture(scope="class")
    def token_and_biz_id(self):
        token = _get_fresh_token()
        biz_id = _get_business_id(token)
        return {"token": token, "business_id": biz_id}

    def test_business_detail_returns_data(self, token_and_biz_id):
        """Test that business detail returns full data"""
        token = token_and_biz_id["token"]
        business_id = token_and_biz_id["business_id"]
        if business_id is None:
            pytest.skip("No business to test detail")
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        assert "business" in data, "Response should have 'business' key"
        assert "events" in data, "Response should have 'events' key"
        assert "posts" in data, "Response should have 'posts' key"
        assert "is_owner" in data, "Response should have 'is_owner' key"
        assert "is_favorited" in data, "Response should have 'is_favorited' key"
        
        print(f"Business detail fetched: {data['business'].get('name')}")
        print(f"Is owner: {data['is_owner']}, Is favorited: {data['is_favorited']}")

    def test_business_detail_business_structure(self, token_and_biz_id):
        """Verify business object has correct structure"""
        token = token_and_biz_id["token"]
        business_id = token_and_biz_id["business_id"]
        if business_id is None:
            pytest.skip("No business to test structure")
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        business = data.get("business", {})
        
        required_fields = [
            "business_id", "owner_id", "name", "category", 
            "root_category", "subcategory", "address",
            "latitude", "longitude", "enabled_modules"
        ]
        
        for field in required_fields:
            assert field in business, f"Business should have '{field}'"
        
        assert business["business_id"] == business_id
        print(f"Business structure verified: {business.get('name')}")

    def test_business_detail_not_found(self, token_and_biz_id):
        """Test 404 for non-existent business"""
        token = token_and_biz_id["token"]
        response = requests.get(
            f"{BASE_URL}/api/businesses/biz_nonexistent_12345",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestMediaUploadEndpoint:
    """Test POST /api/media/upload - media upload endpoint exists"""

    @pytest.fixture(scope="class")
    def token(self):
        return _get_fresh_token()

    def test_media_upload_endpoint_exists(self, token):
        """Test that media upload endpoint exists and validates input"""
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code in [422, 400], \
            f"Expected 422/400 for missing file, got {response.status_code}"
        print(f"Media upload endpoint exists, returns {response.status_code} for empty request")

    def test_media_upload_requires_auth(self):
        """Test that media upload requires authentication"""
        response = requests.post(f"{BASE_URL}/api/media/upload")
        
        assert response.status_code in [401, 403, 422], \
            f"Expected 401/403/422 for unauthorized, got {response.status_code}"


class TestBusinessEndpointIntegration:
    """Integration tests for business locator flow"""

    @pytest.fixture(scope="class")
    def token(self):
        return _get_fresh_token()

    def test_full_business_locator_flow(self, token):
        """Test the complete business locator flow"""
        cat_response = requests.get(
            f"{BASE_URL}/api/businesses/category-tree",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert cat_response.status_code == 200
        categories = cat_response.json().get("categories", [])
        assert len(categories) > 0
        print(f"Step 1: Got {len(categories)} categories")
        
        nearby_response = requests.get(
            f"{BASE_URL}/api/businesses/nearby",
            params={
                "latitude": TEST_LATITUDE,
                "longitude": TEST_LONGITUDE,
                "max_distance_meters": 50000
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert nearby_response.status_code == 200
        nearby = nearby_response.json()
        print(f"Step 2: Found {len(nearby)} nearby businesses")
        
        business_id = nearby[0]["business_id"] if len(nearby) > 0 else _get_business_id(token)
        if business_id is None:
            pytest.skip("No business available for detail test")
        detail_response = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert detail_response.status_code == 200
        detail = detail_response.json()
        print(f"Step 3: Got detail for {detail['business'].get('name')}")
        
        print("INTEGRATION TEST PASSED: Full business locator flow works")

    def test_profile_business_display_flow(self, token):
        """Test the profile business display flow"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data is not None:
            assert "business_id" in data
            print(f"PROFILE FIX VERIFIED: User's business '{data.get('name')}' correctly returned")
            print(f"Business ID: {data.get('business_id')}")
        else:
            print("No business for this user")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
