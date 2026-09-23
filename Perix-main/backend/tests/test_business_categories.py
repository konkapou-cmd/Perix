"""
Test business creation and categories API
Tests:
- GET /api/categories - should return 8 root categories with subcategories
- POST /api/businesses - business creation with category selection
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8000').rstrip('/')

STALE_TOKEN_EMAIL = "test_categories_stale@example.com"
STALE_TOKEN_PASSWORD = "TestPass123!"


def _get_fresh_token(email=None, password=None, name=None):
    if email is None:
        email = STALE_TOKEN_EMAIL
    if password is None:
        password = STALE_TOKEN_PASSWORD
    if name is None:
        name = "Test Categories User"
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    if login_resp.status_code == 200:
        return login_resp.json()["session_token"]
    register_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    if register_resp.status_code == 200:
        return register_resp.json()["session_token"]
    pytest.skip(f"Auth failed: {register_resp.text}")


class TestCategories:
    """Test the categories endpoint"""
    
    @pytest.fixture(scope="class")
    def session_token(self):
        return _get_fresh_token()
    
    def test_categories_endpoint_returns_list(self, session_token):
        """GET /api/categories should return a list of category groups"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Categories endpoint returned {len(data)} root categories")
    
    def test_categories_returns_8_root_categories(self, session_token):
        """GET /api/categories should return exactly 8 root categories"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) == 8, f"Expected 8 root categories, got {len(data)}"
        
        expected_slugs = [
            "sports-wellness", "fashion-retail", "entertainment", 
            "bars-nightlife", "professional-services", "beauty-care",
            "education-creativity", "restaurants"
        ]
        actual_slugs = [cat.get("slug") for cat in data]
        
        for expected in expected_slugs:
            assert expected in actual_slugs, f"Missing category: {expected}"
        
        print(f"All 8 expected root categories found")
    
    def test_categories_have_subcategories(self, session_token):
        """Each root category should have subcategories with proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        for category in data:
            assert "name" in category, f"Category missing 'name' field"
            assert "slug" in category, f"Category missing 'slug' field"
            assert "subcategories" in category, f"Category {category.get('slug')} missing 'subcategories'"
            
            subcategories = category["subcategories"]
            assert isinstance(subcategories, list), f"Subcategories should be a list"
            assert len(subcategories) > 0, f"Category {category.get('slug')} has no subcategories"
            
            # Check subcategory structure
            for sub in subcategories:
                assert "name" in sub, f"Subcategory missing 'name'"
                assert "slug" in sub, f"Subcategory missing 'slug'"
                assert "modules" in sub, f"Subcategory {sub.get('slug')} missing 'modules'"
                
        print(f"All categories have proper structure with subcategories")
    
    def test_specific_category_subcategories(self, session_token):
        """Verify specific subcategories exist for key categories"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        category_map = {cat["slug"]: cat for cat in data}
        
        # Check sports-wellness has expected subcategories
        sports = category_map.get("sports-wellness")
        assert sports is not None, "sports-wellness category not found"
        sports_subs = [s["slug"] for s in sports["subcategories"]]
        assert "gyms" in sports_subs, "gyms subcategory not in sports-wellness"
        
        # Check restaurants has expected subcategories
        restaurants = category_map.get("restaurants")
        assert restaurants is not None, "restaurants category not found"
        restaurant_subs = [s["slug"] for s in restaurants["subcategories"]]
        assert "italian" in restaurant_subs, "italian subcategory not in restaurants"
        
        print("Specific subcategories verified correctly")


class TestBusinessCreation:
    """Test business creation with categories"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Create a new test user and get auth token"""
        unique_email = f"TEST_biz_test_{uuid.uuid4().hex[:8]}@example.com"
        
        # Register new user
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "name": "Test Business Owner",
                "email": unique_email,
                "password": "TestPass123!"
            }
        )
        
        if response.status_code == 200:
            return response.json().get("session_token")
        
        # If user exists, try login
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": unique_email,
                "password": "TestPass123!"
            }
        )
        
        if response.status_code == 200:
            return response.json().get("session_token")
        
        pytest.skip(f"Could not authenticate: {response.text}")
    
    def test_create_business_with_valid_category(self, auth_token):
        """POST /api/businesses should create business with valid category"""
        unique_name = f"TEST_Business_{uuid.uuid4().hex[:6]}"
        
        payload = {
            "name": unique_name,
            "root_category": "restaurants",
            "subcategory": "italian",
            "address": "123 Test Street, Test City",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "description": "A test Italian restaurant"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("name") == unique_name
        assert data.get("root_category") == "restaurants"
        assert data.get("subcategory") == "italian"
        assert "business_id" in data
        
        print(f"Business created successfully: {data.get('business_id')}")
        return data
    
    def test_business_has_enabled_modules(self, auth_token):
        """Created business should have correct enabled modules"""
        # Get the user's business
        response = requests.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # If no business exists (from previous failed test), skip
        if response.status_code == 200 and response.json() is None:
            pytest.skip("No business exists for this user")
        
        assert response.status_code == 200
        
        data = response.json()
        if data:
            assert "enabled_modules" in data, "Business missing enabled_modules"
            modules = data["enabled_modules"]
            
            # Events should be enabled for restaurants
            assert modules.get("events") == True, "Events module should be enabled"
            print(f"Business has correct enabled modules: {modules}")


class TestBusinessCreationWithSession:
    """Test business creation using provided session token"""
    
    @pytest.fixture(scope="class")
    def session_token(self):
        return _get_fresh_token()
    
    def test_get_my_business(self, session_token):
        """GET /api/businesses/my should return existing business or null"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        if data:
            print(f"Existing business found: {data.get('business_id')} - {data.get('name')}")
            assert "business_id" in data
            assert "root_category" in data
            assert "subcategory" in data
        else:
            print("No business exists for this user")
    
    def test_categories_for_business_creation(self, session_token):
        """Verify categories are correctly formatted for business creation UI"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure matches what frontend expects
        for category in data:
            assert "name" in category, "Missing name for root category"
            assert "slug" in category, "Missing slug for root category"
            assert "subcategories" in category, "Missing subcategories"
            
            for sub in category["subcategories"]:
                assert "name" in sub, "Subcategory missing name"
                assert "slug" in sub, "Subcategory missing slug"
        
        total_subcategories = sum(len(cat["subcategories"]) for cat in data)
        print(f"Categories formatted correctly: {len(data)} root categories, {total_subcategories} subcategories total")


class TestMediaUpload:
    """Test media upload endpoint"""
    
    @pytest.fixture(scope="class")
    def session_token(self):
        return _get_fresh_token()
    
    def test_media_upload_endpoint_exists(self, session_token):
        """POST /api/media/upload endpoint should exist"""
        # Just verify the endpoint exists (without actually uploading)
        # A proper test would need an actual file
        response = requests.post(
            f"{BASE_URL}/api/media/upload",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        # Should get 422 (validation error) or 400 (bad request) - not 404
        assert response.status_code != 404, "Media upload endpoint not found"
        print(f"Media upload endpoint exists (status: {response.status_code})")


class TestBusinessDashboard:
    """Test business dashboard functionality"""
    
    @pytest.fixture(scope="class")
    def session_token(self):
        return _get_fresh_token()
    
    def test_get_business_detail(self, session_token):
        """GET /api/businesses/{id} should return full business detail"""
        # First get my business
        my_biz_response = requests.get(
            f"{BASE_URL}/api/businesses/my",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        if my_biz_response.status_code != 200 or not my_biz_response.json():
            pytest.skip("No business found to test dashboard")
        
        business_id = my_biz_response.json().get("business_id")
        
        # Get business detail - endpoint is /api/businesses/{id}
        response = requests.get(
            f"{BASE_URL}/api/businesses/{business_id}",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "business" in data, "Missing business field in detail response"
        assert "events" in data, "Missing events field in detail response"
        assert "posts" in data, "Missing posts field in detail response"
        assert "is_owner" in data, "Missing is_owner field in detail response"
        
        print(f"Business detail returned correctly for {business_id}")
    
    def test_list_all_businesses(self, session_token):
        """GET /api/businesses should list all businesses"""
        response = requests.get(
            f"{BASE_URL}/api/businesses",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of businesses"
        print(f"Found {len(data)} businesses")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
