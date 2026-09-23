"""
Test Chunked Upload API and Agora Call API Endpoints.

Features tested:
1. POST /api/uploads/init - Initialize chunked upload session
2. POST /api/uploads/chunk - Upload individual chunks
3. POST /api/uploads/complete - Complete chunked upload
4. GET /api/uploads/status/{upload_id} - Get upload session status
5. DELETE /api/uploads/cancel/{upload_id} - Cancel upload session
6. POST /api/media/upload - Direct media upload still works
7. POST /api/calls/token - Generate Agora RTC token
8. POST /api/calls/initiate - Start a call
9. GET /api/calls/history - Get call history
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://perix-fixes.preview.emergentagent.com').rstrip('/')

# Test users
TEST_USER_EMAIL = "test_chunked_upload@example.com"
TEST_USER_PASSWORD = "testpassword123"
TEST_USER_NAME = "Chunked Upload Test User"

TEST_USER2_EMAIL = "test_call_recipient@example.com"
TEST_USER2_PASSWORD = "testpassword123"
TEST_USER2_NAME = "Call Recipient User"


class TestAuthSetup:
    """Setup test users and get auth tokens"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_register_test_user1(self, session):
        """Register or login test user 1"""
        # Try to register
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": TEST_USER_NAME,
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        
        if response.status_code == 400 and "already registered" in response.text.lower():
            # User exists, login instead
            response = session.post(f"{BASE_URL}/api/auth/login", json={
                "email": TEST_USER_EMAIL,
                "password": TEST_USER_PASSWORD
            })
        
        assert response.status_code in [200, 201], f"Auth failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert "user" in data
        # Store token for later tests
        TestAuthSetup.token1 = data["session_token"]
        TestAuthSetup.user1_id = data["user"]["user_id"]
        print(f"User 1 authenticated: {TEST_USER_EMAIL}")
    
    def test_register_test_user2(self, session):
        """Register or login test user 2 (for call tests)"""
        # Try to register
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": TEST_USER2_NAME,
            "email": TEST_USER2_EMAIL,
            "password": TEST_USER2_PASSWORD
        })
        
        if response.status_code == 400 and "already registered" in response.text.lower():
            # User exists, login instead
            response = session.post(f"{BASE_URL}/api/auth/login", json={
                "email": TEST_USER2_EMAIL,
                "password": TEST_USER2_PASSWORD
            })
        
        assert response.status_code in [200, 201], f"Auth failed: {response.text}"
        data = response.json()
        assert "session_token" in data
        assert "user" in data
        # Store token for later tests
        TestAuthSetup.token2 = data["session_token"]
        TestAuthSetup.user2_id = data["user"]["user_id"]
        print(f"User 2 authenticated: {TEST_USER2_EMAIL}")


class TestChunkedUploadEndpoints:
    """Test the chunked upload API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token from setup"""
        if not hasattr(TestAuthSetup, 'token1'):
            pytest.skip("No auth token available - run TestAuthSetup first")
        return TestAuthSetup.token1
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_init_chunked_upload_success(self, session, auth_token):
        """Test POST /api/uploads/init - Initialize chunked upload session"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create form data for init
        data = {
            "filename": "test_video.mp4",
            "file_size": "10485760",  # 10MB
            "total_chunks": "10",
            "resource_type": "video",
            "content_type": "video/mp4"
        }
        
        response = session.post(
            f"{BASE_URL}/api/uploads/init",
            headers=headers,
            data=data
        )
        
        assert response.status_code == 200, f"Init failed: {response.text}"
        result = response.json()
        
        # Verify response structure
        assert "upload_id" in result, "Missing upload_id in response"
        assert result["status"] == "initialized"
        assert result["total_chunks"] == 10
        
        # Store upload_id for subsequent tests
        TestChunkedUploadEndpoints.upload_id = result["upload_id"]
        print(f"Initialized upload session: {result['upload_id']}")
    
    def test_get_upload_status(self, session, auth_token):
        """Test GET /api/uploads/status/{upload_id} - Get upload session status"""
        if not hasattr(TestChunkedUploadEndpoints, 'upload_id'):
            pytest.skip("No upload_id available - run init test first")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        upload_id = TestChunkedUploadEndpoints.upload_id
        
        response = session.get(
            f"{BASE_URL}/api/uploads/status/{upload_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Status check failed: {response.text}"
        result = response.json()
        
        # Verify response
        assert result["upload_id"] == upload_id
        assert result["filename"] == "test_video.mp4"
        assert result["file_size"] == 10485760
        assert result["total_chunks"] == 10
        assert result["chunks_received"] == 0  # No chunks uploaded yet
        assert result["status"] == "in_progress"
        print(f"Upload status verified: {result['chunks_received']}/{result['total_chunks']} chunks")
    
    def test_upload_chunk_success(self, session, auth_token):
        """Test POST /api/uploads/chunk - Upload a single chunk"""
        if not hasattr(TestChunkedUploadEndpoints, 'upload_id'):
            pytest.skip("No upload_id available - run init test first")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        upload_id = TestChunkedUploadEndpoints.upload_id
        
        # Create a test chunk (1MB of data)
        chunk_data = b"x" * (1024 * 1024)  # 1MB
        
        # Upload chunk 0
        files = {"chunk": ("chunk_0", io.BytesIO(chunk_data), "application/octet-stream")}
        data = {
            "upload_id": upload_id,
            "chunk_index": "0"
        }
        
        response = session.post(
            f"{BASE_URL}/api/uploads/chunk",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 200, f"Chunk upload failed: {response.text}"
        result = response.json()
        
        # Verify response
        assert result["upload_id"] == upload_id
        assert result["chunk_index"] == 0
        assert result["chunks_received"] == 1
        assert result["status"] == "chunk_received"
        print(f"Chunk 0 uploaded successfully: {result['chunks_received']}/{result['total_chunks']}")
    
    def test_upload_chunk_invalid_index(self, session, auth_token):
        """Test chunk upload with invalid chunk index"""
        if not hasattr(TestChunkedUploadEndpoints, 'upload_id'):
            pytest.skip("No upload_id available - run init test first")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        upload_id = TestChunkedUploadEndpoints.upload_id
        
        chunk_data = b"x" * 1024
        files = {"chunk": ("chunk_invalid", io.BytesIO(chunk_data), "application/octet-stream")}
        data = {
            "upload_id": upload_id,
            "chunk_index": "999"  # Invalid - too high
        }
        
        response = session.post(
            f"{BASE_URL}/api/uploads/chunk",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid chunk index, got {response.status_code}"
        print("Invalid chunk index correctly rejected")
    
    def test_cancel_chunked_upload(self, session, auth_token):
        """Test DELETE /api/uploads/cancel/{upload_id} - Cancel upload session"""
        if not hasattr(TestChunkedUploadEndpoints, 'upload_id'):
            pytest.skip("No upload_id available - run init test first")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        upload_id = TestChunkedUploadEndpoints.upload_id
        
        response = session.delete(
            f"{BASE_URL}/api/uploads/cancel/{upload_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Cancel failed: {response.text}"
        result = response.json()
        
        assert result["upload_id"] == upload_id
        assert result["status"] == "cancelled"
        print(f"Upload session {upload_id} cancelled successfully")
    
    def test_status_after_cancel_returns_404(self, session, auth_token):
        """Verify cancelled session returns 404"""
        if not hasattr(TestChunkedUploadEndpoints, 'upload_id'):
            pytest.skip("No upload_id available")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        upload_id = TestChunkedUploadEndpoints.upload_id
        
        response = session.get(
            f"{BASE_URL}/api/uploads/status/{upload_id}",
            headers=headers
        )
        
        assert response.status_code == 404, f"Expected 404 after cancel, got {response.status_code}"
        print("Cancelled session correctly returns 404")
    
    def test_complete_upload_full_flow(self, session, auth_token):
        """Test full chunked upload flow: init -> chunks -> complete"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Step 1: Init with small file (3 chunks)
        file_size = 3 * 1024 * 1024  # 3MB total
        total_chunks = 3
        
        init_data = {
            "filename": "test_complete_flow.mp4",
            "file_size": str(file_size),
            "total_chunks": str(total_chunks),
            "resource_type": "video",
            "content_type": "video/mp4"
        }
        
        init_response = session.post(
            f"{BASE_URL}/api/uploads/init",
            headers=headers,
            data=init_data
        )
        
        assert init_response.status_code == 200, f"Init failed: {init_response.text}"
        upload_id = init_response.json()["upload_id"]
        print(f"Step 1: Initialized upload {upload_id}")
        
        # Step 2: Upload all chunks
        for i in range(total_chunks):
            chunk_data = b"x" * (1024 * 1024)  # 1MB per chunk
            files = {"chunk": (f"chunk_{i}", io.BytesIO(chunk_data), "application/octet-stream")}
            data = {"upload_id": upload_id, "chunk_index": str(i)}
            
            chunk_response = session.post(
                f"{BASE_URL}/api/uploads/chunk",
                headers=headers,
                files=files,
                data=data
            )
            
            assert chunk_response.status_code == 200, f"Chunk {i} failed: {chunk_response.text}"
            print(f"Step 2: Uploaded chunk {i+1}/{total_chunks}")
        
        # Step 3: Complete upload
        complete_data = {"upload_id": upload_id}
        complete_response = session.post(
            f"{BASE_URL}/api/uploads/complete",
            headers=headers,
            data=complete_data
        )
        
        assert complete_response.status_code == 200, f"Complete failed: {complete_response.text}"
        result = complete_response.json()
        
        assert result["upload_id"] == upload_id
        assert result["status"] == "complete"
        assert "url" in result
        assert result["url"].startswith("https://")  # Should be Cloudinary URL
        print(f"Step 3: Upload complete! URL: {result['url'][:50]}...")
    
    def test_complete_with_missing_chunks_fails(self, session, auth_token):
        """Test complete fails when chunks are missing"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Init with 5 chunks but only upload 2
        init_data = {
            "filename": "test_incomplete.mp4",
            "file_size": str(5 * 1024 * 1024),
            "total_chunks": "5",
            "resource_type": "video",
            "content_type": "video/mp4"
        }
        
        init_response = session.post(
            f"{BASE_URL}/api/uploads/init",
            headers=headers,
            data=init_data
        )
        
        assert init_response.status_code == 200
        upload_id = init_response.json()["upload_id"]
        
        # Upload only 2 chunks (0 and 1)
        for i in range(2):
            chunk_data = b"x" * (1024 * 1024)
            files = {"chunk": (f"chunk_{i}", io.BytesIO(chunk_data), "application/octet-stream")}
            data = {"upload_id": upload_id, "chunk_index": str(i)}
            session.post(f"{BASE_URL}/api/uploads/chunk", headers=headers, files=files, data=data)
        
        # Try to complete - should fail
        complete_response = session.post(
            f"{BASE_URL}/api/uploads/complete",
            headers=headers,
            data={"upload_id": upload_id}
        )
        
        assert complete_response.status_code == 400, f"Expected 400 for missing chunks, got {complete_response.status_code}"
        error = complete_response.json()
        assert "missing" in error.get("detail", "").lower() or "Missing" in error.get("detail", "")
        print("Complete correctly rejected due to missing chunks")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/uploads/cancel/{upload_id}", headers=headers)
    
    def test_upload_without_auth_fails(self, session):
        """Test that upload endpoints require authentication"""
        # Try init without auth
        data = {
            "filename": "test.mp4",
            "file_size": "1048576",
            "total_chunks": "1"
        }
        
        response = session.post(f"{BASE_URL}/api/uploads/init", data=data)
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("Upload endpoints correctly require authentication")


class TestDirectMediaUpload:
    """Test direct media upload (for images/small files)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        if not hasattr(TestAuthSetup, 'token1'):
            pytest.skip("No auth token available")
        return TestAuthSetup.token1
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_direct_image_upload(self, session, auth_token):
        """Test POST /api/media/upload - Direct image upload"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create a minimal valid PNG image (1x1 pixel)
        # This is a valid PNG header + minimal data
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("test_image.png", io.BytesIO(png_data), "image/png")}
        data = {"resource_type": "image"}
        
        response = session.post(
            f"{BASE_URL}/api/media/upload",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 200, f"Direct upload failed: {response.text}"
        result = response.json()
        
        assert "url" in result
        assert result["url"].startswith("https://")
        assert "cloudinary" in result["url"].lower()
        print(f"Direct image upload successful: {result['url'][:50]}...")
    
    def test_direct_upload_without_auth_fails(self, session):
        """Test direct upload requires authentication"""
        files = {"file": ("test.jpg", io.BytesIO(b"test"), "image/jpeg")}
        
        response = session.post(f"{BASE_URL}/api/media/upload", files=files)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Direct upload correctly requires authentication")


class TestAgoraCallEndpoints:
    """Test Agora voice/video call API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        if not hasattr(TestAuthSetup, 'token1'):
            pytest.skip("No auth token available")
        return TestAuthSetup.token1
    
    @pytest.fixture(scope="class")
    def auth_token2(self):
        if not hasattr(TestAuthSetup, 'token2'):
            pytest.skip("No second auth token available")
        return TestAuthSetup.token2
    
    @pytest.fixture(scope="class")
    def user2_id(self):
        if not hasattr(TestAuthSetup, 'user2_id'):
            pytest.skip("No user2_id available")
        return TestAuthSetup.user2_id
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_generate_call_token(self, session, auth_token):
        """Test POST /api/calls/token - Generate Agora RTC token"""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        # Generate token for a channel
        response = session.post(
            f"{BASE_URL}/api/calls/token",
            headers=headers,
            json={
                "channel": "test-channel-123",
                "uid": 0,
                "role": 1
            }
        )
        
        assert response.status_code == 200, f"Token generation failed: {response.text}"
        result = response.json()
        
        # Verify response structure
        assert "token" in result, "Missing token in response"
        assert "uid" in result, "Missing uid in response"
        assert "channel" in result, "Missing channel in response"
        assert "app_id" in result, "Missing app_id in response"
        assert "expiry_time" in result, "Missing expiry_time in response"
        
        # Verify values
        assert result["channel"] == "test-channel-123"
        assert result["app_id"] == "e7f6e9aeecf14b2ba10e3f40be9f56e7"  # From .env
        assert len(result["token"]) > 50  # Token should be substantial
        
        print(f"Token generated: {result['token'][:30]}... for channel: {result['channel']}")
    
    def test_generate_token_auto_channel(self, session, auth_token):
        """Test token generation with auto-generated channel"""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        response = session.post(
            f"{BASE_URL}/api/calls/token",
            headers=headers,
            json={}  # No channel provided
        )
        
        assert response.status_code == 200, f"Token generation failed: {response.text}"
        result = response.json()
        
        assert "channel" in result
        assert result["channel"].startswith("call-")  # Auto-generated format
        print(f"Auto-generated channel: {result['channel']}")
    
    def test_initiate_call(self, session, auth_token, user2_id):
        """Test POST /api/calls/initiate - Start a call"""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        response = session.post(
            f"{BASE_URL}/api/calls/initiate",
            headers=headers,
            json={
                "to_user_id": user2_id,
                "call_type": "video"
            }
        )
        
        assert response.status_code == 200, f"Initiate call failed: {response.text}"
        result = response.json()
        
        # Verify response structure
        assert "call_id" in result
        assert "channel" in result
        assert "token" in result
        assert "app_id" in result
        assert "caller_uid" in result
        assert "callee_uid" in result
        assert "call_type" in result
        assert "status" in result
        
        # Verify values
        assert result["call_type"] == "video"
        assert result["status"] == "pending"
        assert result["channel"].startswith("call-")
        
        # Store for later tests
        TestAgoraCallEndpoints.call_id = result["call_id"]
        print(f"Call initiated: {result['call_id']}, channel: {result['channel']}")
    
    def test_initiate_voice_call(self, session, auth_token, user2_id):
        """Test initiating a voice call"""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        response = session.post(
            f"{BASE_URL}/api/calls/initiate",
            headers=headers,
            json={
                "to_user_id": user2_id,
                "call_type": "voice"
            }
        )
        
        assert response.status_code == 200, f"Voice call failed: {response.text}"
        result = response.json()
        assert result["call_type"] == "voice"
        print(f"Voice call initiated: {result['call_id']}")
    
    def test_initiate_call_to_nonexistent_user(self, session, auth_token):
        """Test call to non-existent user returns 404"""
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        response = session.post(
            f"{BASE_URL}/api/calls/initiate",
            headers=headers,
            json={
                "to_user_id": "nonexistent_user_id_12345",
                "call_type": "video"
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Call to non-existent user correctly returns 404")
    
    def test_get_call_history(self, session, auth_token):
        """Test GET /api/calls/history - Get call history"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = session.get(
            f"{BASE_URL}/api/calls/history",
            headers=headers
        )
        
        assert response.status_code == 200, f"Get history failed: {response.text}"
        result = response.json()
        
        # Should be a list
        assert isinstance(result, list)
        
        # Should have at least the calls we created
        assert len(result) >= 1, "No calls in history after creating calls"
        
        # Verify call structure
        if len(result) > 0:
            call = result[0]
            assert "call_id" in call
            assert "channel" in call
            assert "caller_id" in call
            assert "callee_id" in call
            assert "call_type" in call
            assert "status" in call
            assert "created_at" in call
            assert "other_user" in call  # Should include other user info
            assert "is_outgoing" in call  # Should indicate direction
            
        print(f"Call history retrieved: {len(result)} calls")
    
    def test_get_pending_calls(self, session, auth_token2):
        """Test GET /api/calls/pending - Get pending calls (for callee)"""
        headers = {"Authorization": f"Bearer {auth_token2}"}
        
        response = session.get(
            f"{BASE_URL}/api/calls/pending",
            headers=headers
        )
        
        assert response.status_code == 200, f"Get pending failed: {response.text}"
        result = response.json()
        
        # Should be a list
        assert isinstance(result, list)
        print(f"Pending calls for user 2: {len(result)}")
    
    def test_answer_call(self, session, auth_token2):
        """Test POST /api/calls/answer/{call_id} - Answer a call"""
        if not hasattr(TestAgoraCallEndpoints, 'call_id'):
            pytest.skip("No call_id available - run initiate test first")
        
        headers = {
            "Authorization": f"Bearer {auth_token2}",
            "Content-Type": "application/json"
        }
        
        call_id = TestAgoraCallEndpoints.call_id
        
        response = session.post(
            f"{BASE_URL}/api/calls/answer/{call_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Answer call failed: {response.text}"
        result = response.json()
        
        assert result["call_id"] == call_id
        assert result["status"] == "active"
        assert "token" in result  # Callee should get their token
        print(f"Call answered: {call_id}")
    
    def test_end_call(self, session, auth_token):
        """Test POST /api/calls/end/{call_id} - End a call"""
        if not hasattr(TestAgoraCallEndpoints, 'call_id'):
            pytest.skip("No call_id available")
        
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        call_id = TestAgoraCallEndpoints.call_id
        
        response = session.post(
            f"{BASE_URL}/api/calls/end/{call_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"End call failed: {response.text}"
        result = response.json()
        
        assert result["success"] == True
        assert result["status"] == "ended"
        print(f"Call ended: {call_id}")
    
    def test_reject_call(self, session, auth_token, auth_token2, user2_id):
        """Test POST /api/calls/reject/{call_id} - Reject a call"""
        # First create a new call
        headers1 = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        
        init_response = session.post(
            f"{BASE_URL}/api/calls/initiate",
            headers=headers1,
            json={"to_user_id": user2_id, "call_type": "video"}
        )
        
        assert init_response.status_code == 200
        call_id = init_response.json()["call_id"]
        
        # Now reject as user 2
        headers2 = {
            "Authorization": f"Bearer {auth_token2}",
            "Content-Type": "application/json"
        }
        
        response = session.post(
            f"{BASE_URL}/api/calls/reject/{call_id}",
            headers=headers2
        )
        
        assert response.status_code == 200, f"Reject call failed: {response.text}"
        result = response.json()
        
        assert result["success"] == True
        assert result["status"] == "rejected"
        print(f"Call rejected: {call_id}")
    
    def test_call_token_without_auth_fails(self, session):
        """Test that call endpoints require authentication"""
        response = session.post(
            f"{BASE_URL}/api/calls/token",
            json={"channel": "test"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Call endpoints correctly require authentication")


class TestFileSizeValidation:
    """Test file size validation for chunked uploads"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        if not hasattr(TestAuthSetup, 'token1'):
            pytest.skip("No auth token available")
        return TestAuthSetup.token1
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_video_max_size_100mb(self, session, auth_token):
        """Test video upload rejects files > 100MB"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Try to init with 150MB file (should fail)
        data = {
            "filename": "huge_video.mp4",
            "file_size": str(150 * 1024 * 1024),  # 150MB
            "total_chunks": "150",
            "resource_type": "video",
            "content_type": "video/mp4"
        }
        
        response = session.post(
            f"{BASE_URL}/api/uploads/init",
            headers=headers,
            data=data
        )
        
        assert response.status_code == 400, f"Expected 400 for oversized video, got {response.status_code}"
        assert "too large" in response.text.lower() or "maximum" in response.text.lower()
        print("Video > 100MB correctly rejected")
    
    def test_image_max_size_10mb(self, session, auth_token):
        """Test image upload rejects files > 10MB"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Try to init with 15MB image (should fail)
        data = {
            "filename": "huge_image.jpg",
            "file_size": str(15 * 1024 * 1024),  # 15MB
            "total_chunks": "15",
            "resource_type": "image",
            "content_type": "image/jpeg"
        }
        
        response = session.post(
            f"{BASE_URL}/api/uploads/init",
            headers=headers,
            data=data
        )
        
        assert response.status_code == 400, f"Expected 400 for oversized image, got {response.status_code}"
        print("Image > 10MB correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
