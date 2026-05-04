Auth-Gated App Testing Playbook
Step 1: Create Test User & Session
mongosh --eval "
use('test_database');
var visitorId = 'user_' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: visitorId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: visitorId,  // Must match users.user_id exactly
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + visitorId);
"
Step 2: Test Backend API
# Test auth endpoint
curl -X GET "https://your-app.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test protected endpoints
curl -X GET "https://your-app.com/api/habits" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

curl -X POST "https://your-app.com/api/habits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"name": "Test Habit", "color": "#3B82F6"}'
Step 3: Browser Testing
// Set cookie and navigate
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "your-app.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
}]);
await page.goto("https://your-app.com");
MongoDB ID Handling
Use custom `user_id` field and ignore MongoDB's `_id`. This avoids all ObjectId serialization and Pydantic alias complexity.

**Pydantic Model** - straightforward, no aliases:
```python
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime
```

**MongoDB Queries** - always exclude `_id`:
```python
# CORRECT: Exclude _id from queries
user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
users = await db.users.find({}, {"_id": 0}).to_list(1000)

# WRONG: Don't query without excluding _id
user = await db.users.find_one({"user_id": user_id})  # Returns _id which breaks serialization
```

**Insert with custom user_id**:
```python
# Generate your own user_id
user_id = f"user_{uuid.uuid4().hex[:12]}"

await db.users.insert_one({
    "user_id": user_id,
    "email": user_data.email,
    "name": user_data.name,
    "picture": user_data.picture,
    "created_at": datetime.now(timezone.utc)
})
```

**MongoDB Documents**:
```javascript
// users collection
{
  "_id": ObjectId(...),  // MongoDB's internal - we ignore it
  "user_id": "user_abc123def456",  // Our ID - use this
  "email": "user@example.com",
  "name": "User Name"
}

// user_sessions collection
{
  "_id": ObjectId(...),  // Ignored
  "user_id": "user_abc123def456",  // References users.user_id
  "session_token": "token_xyz",
  "expires_at": ISODate(...)
}
```

**Backend Auth Code**:
```python
async def get_current_user(session_token: str) -> Optional[User]:
    session = await db.user_sessions.find_one(
        {"session_token": session_token}, 
        {"_id": 0}
    )
    if not session:
        return None
    
    user_doc = await db.users.find_one(
        {"user_id": session["user_id"]}, 
        {"_id": 0}
    )
    if user_doc:
        return User(**user_doc)
    return None
```

**API Endpoints** - can return Pydantic model directly:
```python
@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user  # Works fine - no _id in the model
```

Quick Debug
# Check data format
mongosh --eval "
use('test_database');
db.users.find().limit(2).pretty();
db.user_sessions.find().limit(2).pretty();
"

# Clean test data
mongosh --eval "
use('test_database');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
"
Checklist
 User document has `user_id` field (custom ID, not MongoDB's _id)
 Session `user_id` matches `users.user_id` exactly
 All queries exclude `_id` with `{"_id": 0}`
 Pydantic models use `user_id: str` (no aliases needed)
 API returns user data (not 401/404)
 Browser loads dashboard (not login page)
 CRUD operations work

Success Indicators
 /api/auth/me returns user data with `user_id` field
 Dashboard loads without redirect
 CRUD operations work

Failure Indicators
"User not found" errors
401 Unauthorized responses
Redirect to login page
