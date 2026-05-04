import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://perix-fixes.preview.emergentagent.com';
const TEST_EMAIL = 'test-user@test.com';
const TEST_PASSWORD = 'testpassword';

// NOTE: Frontend login is currently broken due to backend URL misconfiguration
// The frontend is making requests to perix-preview.preview.emergentagent.com 
// instead of crash-debug-build.preview.emergentagent.com
// Backend API tests pass via direct HTTP calls (see test_analytics_api.py)

test.describe('Dashboard Analytics - Login Page Access', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    
    // Check for login form elements
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
  });

  test('should have correct login form placeholders', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    
    // Verify placeholder text
    await expect(page.locator('[data-testid="login-email"]')).toHaveAttribute('placeholder', 'Email');
    await expect(page.locator('[data-testid="login-password"]')).toHaveAttribute('placeholder', 'Password');
  });

  test('should fill in login credentials', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    
    // Fill login form
    await page.locator('[data-testid="login-email"]').fill(TEST_EMAIL);
    await page.locator('[data-testid="login-password"]').fill(TEST_PASSWORD);
    
    // Verify values were entered
    await expect(page.locator('[data-testid="login-email"]')).toHaveValue(TEST_EMAIL);
    await expect(page.locator('[data-testid="login-password"]')).toHaveValue(TEST_PASSWORD);
  });
});

test.describe('Dashboard Analytics - API Verification', () => {
  test('should verify analytics user endpoint returns data', async ({ request }) => {
    // First login to get session token
    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });
    
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    expect(loginData.session_token).toBeDefined();
    
    // Now call analytics endpoint
    const analyticsResponse = await request.get(`${BASE_URL}/api/analytics/user`, {
      headers: {
        'Authorization': `Bearer ${loginData.session_token}`
      }
    });
    
    expect(analyticsResponse.ok()).toBeTruthy();
    const analyticsData = await analyticsResponse.json();
    
    // Verify response structure
    expect(analyticsData).toHaveProperty('total_posts');
    expect(analyticsData).toHaveProperty('total_stories');
    expect(analyticsData).toHaveProperty('total_likes_received');
    expect(analyticsData).toHaveProperty('total_comments_received');
    expect(analyticsData).toHaveProperty('total_profile_views');
    expect(analyticsData).toHaveProperty('total_friends');
    expect(analyticsData).toHaveProperty('engagement_rate');
    expect(analyticsData).toHaveProperty('growth_data');
  });

  test('should verify analytics endpoint requires authentication', async ({ request }) => {
    // Call analytics without auth token
    const response = await request.get(`${BASE_URL}/api/analytics/user`);
    
    // Should return 401 or 422 (unprocessable entity)
    expect([401, 422]).toContain(response.status());
  });

  test('should verify artist analytics returns 404 for non-existent artist', async ({ request }) => {
    // Login first
    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });
    
    const loginData = await loginResponse.json();
    
    // Try to get analytics for non-existent artist
    const response = await request.get(`${BASE_URL}/api/analytics/artist/nonexistent_artist_123`, {
      headers: {
        'Authorization': `Bearer ${loginData.session_token}`
      }
    });
    
    expect(response.status()).toBe(404);
  });

  test('should verify business analytics returns 404 for non-existent business', async ({ request }) => {
    // Login first
    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });
    
    const loginData = await loginResponse.json();
    
    // Try to get analytics for non-existent business
    const response = await request.get(`${BASE_URL}/api/analytics/business/nonexistent_business_123`, {
      headers: {
        'Authorization': `Bearer ${loginData.session_token}`
      }
    });
    
    expect(response.status()).toBe(404);
  });

  test('should verify analytics data types are correct', async ({ request }) => {
    // Login first
    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });
    
    const loginData = await loginResponse.json();
    
    // Get analytics
    const analyticsResponse = await request.get(`${BASE_URL}/api/analytics/user`, {
      headers: {
        'Authorization': `Bearer ${loginData.session_token}`
      }
    });
    
    const data = await analyticsResponse.json();
    
    // Verify data types
    expect(typeof data.total_posts).toBe('number');
    expect(typeof data.total_stories).toBe('number');
    expect(typeof data.total_likes_received).toBe('number');
    expect(typeof data.total_comments_received).toBe('number');
    expect(typeof data.total_profile_views).toBe('number');
    expect(typeof data.total_friends).toBe('number');
    expect(typeof data.engagement_rate).toBe('number');
    expect(typeof data.growth_data).toBe('object');
    
    // Verify all values are non-negative
    expect(data.total_posts).toBeGreaterThanOrEqual(0);
    expect(data.total_stories).toBeGreaterThanOrEqual(0);
    expect(data.total_likes_received).toBeGreaterThanOrEqual(0);
    expect(data.engagement_rate).toBeGreaterThanOrEqual(0);
  });

  test('should verify growth data has valid date format', async ({ request }) => {
    // Login first
    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });
    
    const loginData = await loginResponse.json();
    
    // Get analytics
    const analyticsResponse = await request.get(`${BASE_URL}/api/analytics/user`, {
      headers: {
        'Authorization': `Bearer ${loginData.session_token}`
      }
    });
    
    const data = await analyticsResponse.json();
    
    // Check growth_data keys are valid dates
    const dateKeys = Object.keys(data.growth_data);
    expect(dateKeys.length).toBeGreaterThan(0);
    
    for (const dateStr of dateKeys) {
      // Should be in YYYY-MM-DD format
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
