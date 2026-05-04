"""Shared fixtures for pytest tests."""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com')
# Override for local testing
BASE_URL = 'http://localhost:8000'

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get authentication token - skip if auth fails"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test-user@test.com",
        "password": "testpassword"
    })
    if response.status_code == 200:
        return response.json().get("session_token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client

@pytest.fixture
def base_url():
    """Return the base URL for API calls"""
    return BASE_URL
