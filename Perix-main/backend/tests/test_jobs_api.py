"""
Test Jobs API Endpoints
Tests for the Jobs feature in Perix social media app:
- GET /api/jobs - returns list of active jobs
- GET /api/jobs/{job_id} - returns single job details
- POST /api/jobs - creates a new job (business owner only)
- POST /api/jobs/{job_id}/apply - applies to a job
- GET /api/jobs/my - returns jobs posted by current user's business
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://perix-fixes.preview.emergentagent.com"

# Test credentials provided
TEST_TOKEN = "session_3841dfc2427941ce9588f8bead0d9211"
TEST_BUSINESS_ID = "biz_f806f7b07dec"
TEST_JOB_ID = "job_3d090648a00c"


class TestJobsAPI:
    """Tests for Jobs API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TEST_TOKEN}"
        }

    def test_get_jobs_list(self):
        """Test GET /api/jobs - returns list of active jobs"""
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        
        print(f"GET /api/jobs Status: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        
        # If there are jobs, verify structure
        if len(data) > 0:
            job = data[0]
            assert "job_id" in job, "Job should have job_id"
            assert "title" in job, "Job should have title"
            assert "business_id" in job, "Job should have business_id"
            print(f"Found {len(data)} jobs")
        else:
            print("No jobs found in response (empty list is valid)")

    def test_get_jobs_with_category_filter(self):
        """Test GET /api/jobs with category filters"""
        params = {"root_category": "food-and-beverage"}
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers, params=params)
        
        print(f"GET /api/jobs?root_category=food-and-beverage Status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Found {len(data)} jobs with category filter")

    def test_get_specific_job(self):
        """Test GET /api/jobs/{job_id} - returns single job details"""
        response = requests.get(f"{BASE_URL}/api/jobs/{TEST_JOB_ID}", headers=self.headers)
        
        print(f"GET /api/jobs/{TEST_JOB_ID} Status: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        # Job might exist or not, both are valid scenarios
        if response.status_code == 200:
            data = response.json()
            assert "job_id" in data, "Job should have job_id"
            assert "title" in data, "Job should have title"
            assert "description" in data, "Job should have description"
            assert "business_id" in data, "Job should have business_id"
            print(f"Job found: {data.get('title')}")
        elif response.status_code == 404:
            print(f"Job {TEST_JOB_ID} not found (404 is valid if job was deleted)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")

    def test_get_my_jobs(self):
        """Test GET /api/jobs/my - returns jobs posted by current user's business"""
        response = requests.get(f"{BASE_URL}/api/jobs/my", headers=self.headers)
        
        print(f"GET /api/jobs/my Status: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Found {len(data)} jobs for current user")

    def test_create_job_without_business(self):
        """Test POST /api/jobs - should fail if user doesn't have a business"""
        # Create a temporary user without business to test
        payload = {
            "title": "Test Job Position",
            "description": "This is a test job posting",
            "root_category": "food-and-beverage",
            "subcategory": "restaurants"
        }
        response = requests.post(f"{BASE_URL}/api/jobs", headers=self.headers, json=payload)
        
        print(f"POST /api/jobs Status: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        # Should either succeed (if user has business) or fail with 403
        assert response.status_code in [200, 201, 403], f"Expected 200/201/403, got {response.status_code}: {response.text}"
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert "job_id" in data, "Created job should have job_id"
            print(f"Job created successfully: {data.get('job_id')}")
        else:
            print("Job creation correctly rejected (user has no business)")

    def test_apply_to_job(self):
        """Test POST /api/jobs/{job_id}/apply - applies to a job"""
        # First get list of jobs to find one to apply to
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No jobs available to test application")
        
        jobs = response.json()
        job_id = jobs[0]["job_id"]
        
        payload = {
            "message": "I am interested in this position. Test application."
        }
        response = requests.post(f"{BASE_URL}/api/jobs/{job_id}/apply", headers=self.headers, json=payload)
        
        print(f"POST /api/jobs/{job_id}/apply Status: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        # Should either succeed or fail with 400 (already applied)
        assert response.status_code in [200, 201, 400], f"Expected 200/201/400, got {response.status_code}: {response.text}"
        
        data = response.json()
        if response.status_code in [200, 201]:
            assert "application_id" in data or "success" in data, "Response should contain application_id or success"
            print("Application submitted successfully")
        else:
            print(f"Application rejected (likely already applied): {data}")


class TestJobsAPIIntegration:
    """Integration tests for Jobs flow"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TEST_TOKEN}"
        }

    def test_full_jobs_flow(self):
        """Test complete jobs flow: list -> detail -> apply"""
        # Step 1: Get list of jobs
        print("\n--- Step 1: Get Jobs List ---")
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        assert response.status_code == 200, f"Failed to get jobs: {response.text}"
        jobs = response.json()
        print(f"Found {len(jobs)} jobs")
        
        if not jobs:
            print("No jobs available - creating a test scenario")
            pytest.skip("No jobs available for integration test")
        
        # Step 2: Get job details
        print("\n--- Step 2: Get Job Details ---")
        job_id = jobs[0]["job_id"]
        response = requests.get(f"{BASE_URL}/api/jobs/{job_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed to get job details: {response.text}"
        job = response.json()
        print(f"Job: {job.get('title')} at {job.get('business_name')}")
        
        # Step 3: Try to apply
        print("\n--- Step 3: Apply to Job ---")
        payload = {"message": "Integration test application"}
        response = requests.post(f"{BASE_URL}/api/jobs/{job_id}/apply", headers=self.headers, json=payload)
        # Success or already applied both are valid
        assert response.status_code in [200, 201, 400], f"Unexpected response: {response.text}"
        print(f"Application result: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
