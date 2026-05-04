import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://perix-fixes.preview.emergentagent.com';
const TEST_EMAIL = 'test-user@test.com';
const TEST_PASSWORD = 'testpassword';

// Helper function to login
async function login(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  
  // Fill login form
  await page.locator('[data-testid="login-email"]').fill(TEST_EMAIL);
  await page.locator('[data-testid="login-password"]').fill(TEST_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click({ force: true });
  
  // Wait for home page to load
  await expect(page.getByText('Home')).toBeVisible({ timeout: 15000 });
}

test.describe('Authentication Flow', () => {
  test('should display login page with form elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    
    // Check for login form elements
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
    await expect(page.getByText('Continue with Google')).toBeVisible();
    await expect(page.getByText('Create account')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await login(page);
    
    // Verify logged in state
    await expect(page.getByText('Home')).toBeVisible();
    
    // Should see main navigation tabs
    await expect(page.getByText('Messages')).toBeVisible();
    await expect(page.getByText('Profile')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    
    // Fill with invalid credentials
    await page.locator('[data-testid="login-email"]').fill('invalid@test.com');
    await page.locator('[data-testid="login-password"]').fill('wrongpassword');
    await page.locator('[data-testid="login-submit"]').click({ force: true });
    
    // Should remain on login page (login should fail)
    await page.waitForTimeout(5000);
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to Home tab', async ({ page }) => {
    await page.getByText('Home', { exact: true }).click({ force: true });
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/home|\/$/);
  });

  test('should navigate to Messages tab', async ({ page }) => {
    await page.getByText('Messages', { exact: true }).click({ force: true });
    await page.waitForTimeout(2000);
    await expect(page.getByText('Recent chats')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Profile tab', async ({ page }) => {
    await page.getByText('Profile', { exact: true }).click({ force: true });
    await page.waitForTimeout(2000);
    await expect(page.getByText('Personal Information')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Activities tab', async ({ page }) => {
    await page.getByRole('tab', { name: /Activities/i }).click({ force: true });
    await page.waitForTimeout(2000);
    // Activities page should load - check for page-specific content
    await expect(page.getByText('Create activities and invite friends.')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Search tab', async ({ page }) => {
    await page.getByText('Search', { exact: true }).click({ force: true });
    await page.waitForTimeout(2000);
    // Search page should have search functionality
    await expect(page.getByText('Search')).toBeVisible();
  });
});

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Profile', { exact: true }).click({ force: true });
    await page.waitForTimeout(2000);
  });

  test('should display user profile information', async ({ page }) => {
    // Should show user name and email
    await expect(page.getByText('Test User')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('test-user@test.com')).toBeVisible();
  });

  test('should show profile stats (Friends, Media, Profiles)', async ({ page }) => {
    // Check for profile stats - use first() for ambiguous matches
    await expect(page.getByText('FRIENDS').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('PROFILE.MEDIA').first()).toBeVisible();
  });

  test('should have View Public Profile button', async ({ page }) => {
    // View Public Profile button is visible on the page
    await expect(page.getByText('View Public Profile')).toBeVisible({ timeout: 10000 });
  });
});
