"""
Test Activities and Business CRUD operations.
Tests the following features:
1. Login/Register flow
2. Activities CRUD (create, read, update, delete)
3. Business CRUD (create, view)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://perix-fixes.preview.emergentagent.com")
if not BASE_URL.endswith("/api"):
    BASE_URL = BASE_URL.rstrip("/") + "/api"


class TestAuthFlow:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "test@example.com", "password": "test123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"
        print(f"✓ Login successful, user_id: {data['user']['user_id']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")
    
    def test_register_duplicate_email(self):
        """Test registration with existing email should fail"""
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json={"email": "test@example.com", "password": "test123", "name": "Duplicate User"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Duplicate email registration correctly rejected")


class TestActivitiesCRUD:
    """Test Activities CRUD operations"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "test@example.com", "password": "test123"}
        )
        assert response.status_code == 200
        return response.json()["session_token"]
    
    def test_list_activities(self, auth_token):
        """Test listing activities"""
        response = requests.get(
            f"{BASE_URL}/activities",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"List activities failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} activities")
        return data
    
    def test_create_activity(self, auth_token):
        """Test creating an activity"""
        activity_data = {
            "title": "TEST_Activity_For_Testing",
            "description": "This is a test activity",
            "date": "2026-03-01",
            "time": "14:00",
            "location": "Test Location",
            "max_attendees": 10,
            "invite_emails": []
        }
        response = requests.post(
            f"{BASE_URL}/activities",
            json=activity_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create activity failed: {response.text}"
        data = response.json()
        assert data["title"] == activity_data["title"]
        assert "activity_id" in data
        assert data["is_creator"] == True
        print(f"✓ Created activity: {data['activity_id']}")
        return data
    
    def test_update_activity(self, auth_token):
        """Test updating an activity"""
        # First create an activity
        create_response = requests.post(
            f"{BASE_URL}/activities",
            json={
                "title": "TEST_Activity_To_Update",
                "date": "2026-03-15",
                "time": "16:00",
                "invite_emails": []
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert create_response.status_code == 200
        activity_id = create_response.json()["activity_id"]
        
        # Update the activity
        update_response = requests.put(
            f"{BASE_URL}/activities/{activity_id}",
            json={"title": "TEST_Activity_Updated_Title", "description": "Updated description"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        data = update_response.json()
        assert data["title"] == "TEST_Activity_Updated_Title"
        print(f"✓ Updated activity: {activity_id}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/activities/{activity_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        return data
    
    def test_delete_activity(self, auth_token):
        """Test deleting an activity"""
        # First create an activity to delete
        create_response = requests.post(
            f"{BASE_URL}/activities",
            json={
                "title": "TEST_Activity_To_Delete",
                "date": "2026-03-20",
                "time": "10:00",
                "invite_emails": []
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert create_response.status_code == 200
        activity_id = create_response.json()["activity_id"]
        
        # Delete the activity
        delete_response = requests.delete(
            f"{BASE_URL}/activities/{activity_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        data = delete_response.json()
        assert data["status"] == "deleted"
        print(f"✓ Deleted activity: {activity_id}")
        
        # Verify it's actually deleted
        list_response = requests.get(
            f"{BASE_URL}/activities",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        activities = list_response.json()
        activity_ids = [a["activity_id"] for a in activities]
        assert activity_id not in activity_ids, "Activity should be deleted"
        print(f"✓ Verified activity {activity_id} is deleted from list")


class TestBusinessFlow:
    """Test Business operations"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "test@example.com", "password": "test123"}
        )
        assert response.status_code == 200
        return response.json()["session_token"]
    
    def test_list_businesses(self, auth_token):
        """Test listing businesses"""
        response = requests.get(
            f"{BASE_URL}/businesses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"List businesses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} businesses")
        return data
    
    def test_get_category_tree(self, auth_token):
        """Test getting category tree for business creation"""
        response = requests.get(
            f"{BASE_URL}/businesses/category-tree",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get category tree failed: {response.text}"
        data = response.json()
        assert "categories" in data
        assert len(data["categories"]) > 0
        print(f"✓ Got category tree with {len(data['categories'])} root categories")
        return data
    
    def test_nearby_businesses_endpoint(self, auth_token):
        """Test nearby businesses endpoint"""
        response = requests.get(
            f"{BASE_URL}/businesses/nearby",
            params={"latitude": 40.7128, "longitude": -74.0060, "max_distance_meters": 50000},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Nearby businesses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} nearby businesses")
        return data
    
    def test_my_business_endpoint(self, auth_token):
        """Test my business endpoint"""
        response = requests.get(
            f"{BASE_URL}/businesses/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Either returns null/None or a business object
        assert response.status_code == 200, f"My business failed: {response.text}"
        print(f"✓ My business endpoint works, has_business: {response.json() is not None}")


class TestActivityWhatsAppShare:
    """Test activity data structure for WhatsApp share functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "test@example.com", "password": "test123"}
        )
        assert response.status_code == 200
        return response.json()["session_token"]
    
    def test_activity_has_required_fields_for_share(self, auth_token):
        """Verify activity response has all fields needed for WhatsApp share"""
        # Create an activity with all fields
        activity_data = {
            "title": "TEST_WhatsApp_Share_Activity",
            "description": "Activity for testing WhatsApp share",
            "date": "2026-04-01",
            "time": "18:00",
            "location": "New York City",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "invite_emails": []
        }
        
        create_response = requests.post(
            f"{BASE_URL}/activities",
            json=activity_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert create_response.status_code == 200
        data = create_response.json()
        
        # Verify all fields needed for WhatsApp share exist
        assert "title" in data, "Missing title field"
        assert "date" in data, "Missing date field"
        assert "time" in data, "Missing time field"
        assert "location" in data, "Missing location field"
        assert "activity_id" in data, "Missing activity_id field"
        
        print(f"✓ Activity has all fields needed for WhatsApp share:")
        print(f"  - title: {data['title']}")
        print(f"  - date: {data['date']}")
        print(f"  - time: {data['time']}")
        print(f"  - location: {data['location']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/activities/{data['activity_id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "test@example.com", "password": "test123"}
        )
        assert response.status_code == 200
        return response.json()["session_token"]
    
    def test_cleanup_test_activities(self, auth_token):
        """Clean up any TEST_ prefixed activities"""
        list_response = requests.get(
            f"{BASE_URL}/activities",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if list_response.status_code == 200:
            activities = list_response.json()
            test_activities = [a for a in activities if a.get("title", "").startswith("TEST_")]
            for activity in test_activities:
                requests.delete(
                    f"{BASE_URL}/activities/{activity['activity_id']}",
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                print(f"  - Cleaned up: {activity['activity_id']}")
            print(f"✓ Cleaned up {len(test_activities)} test activities")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
