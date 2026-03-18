const { test, expect } = require('@playwright/test');

// Core page routes — title patterns match actual <title> content
const CORE_PAGES = [
  { path: '/', title: 'Mission Meets Tech' },
  { path: '/latest.html', title: 'Latest Articles' },
  { path: '/podcast.html', title: 'Fed UP Podcast' },
  { path: '/resources.html', title: 'Resources' },
  { path: '/proposal-pulse.html', title: 'ProposalPulse' },
  { path: '/about.html', title: 'Mary Womack' },
  { path: '/newsletter.html', title: 'Newsletter' },
  { path: '/topics.html', title: 'Topics' },
  { path: '/newswire.html', title: 'News Wire' },
  { path: '/contract-tracker.html', title: 'Contract Tracker' },
  { path: '/events.html', title: 'Events' },
  { path: '/privacy.html', title: 'Privacy' },
  { path: '/glossary.html', title: 'Glossary' },
];

test.describe('Page loads', () => {
  for (const pg of CORE_PAGES) {
    test(`${pg.path} loads with correct title`, async ({ page }) => {
      const response = await page.goto(pg.path);
      expect(response.status()).toBe(200);
      await expect(page).toHaveTitle(new RegExp(pg.title, 'i'));
    });
  }
});

test.describe('Header navigation', () => {
  test('desktop nav has all expected links', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav .hidden.md\\:flex');
    await expect(nav.getByRole('link', { name: 'Intelligence' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Podcast' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Resources' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'ProposalPulse' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'About' })).toBeVisible();
  });

  test('nav Intelligence link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav .hidden.md\\:flex').getByRole('link', { name: 'Intelligence' }).click();
    // serve uses clean URLs: latest.html → /latest
    await expect(page).toHaveURL(/latest/);
    await expect(page).toHaveTitle(/Latest Articles/i);
  });

  test('nav Podcast link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav .hidden.md\\:flex').getByRole('link', { name: 'Podcast' }).click();
    await expect(page).toHaveURL(/podcast/);
    await expect(page).toHaveTitle(/Fed UP Podcast/i);
  });

  test('nav logo returns home', async ({ page }) => {
    await page.goto('/about.html');
    await page.locator('nav a').first().click();
    // Root-level pages use relative hrefs; logo links to index.html which may resolve to /
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });
});

test.describe('Footer navigation', () => {
  test('footer has Explore and Connect columns', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Intelligence' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Podcast' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Resources' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'ProposalPulse' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Contact' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Events' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('footer Privacy Policy link works', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/privacy/);
    await expect(page).toHaveTitle(/Privacy/i);
  });
});

test.describe('Deep link and refresh', () => {
  test('newsletter article loads via direct URL', async ({ page }) => {
    const response = await page.goto('/newsletter/anthropic-ban-what-numbers-say/');
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(/Anthropic Ban/i);
    await expect(page.locator('main .article-content')).toBeVisible();
  });

  test('topic page loads via direct URL', async ({ page }) => {
    const response = await page.goto('/topics/ai-innovation/');
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(/AI/i);
  });

  test('refresh on nested article page works', async ({ page }) => {
    await page.goto('/newsletter/anthropic-ban-what-numbers-say/');
    await page.reload();
    await expect(page).toHaveTitle(/Anthropic Ban/i);
    await expect(page.locator('main')).toBeVisible();
  });

  test('contract detail page loads via direct URL', async ({ page }) => {
    const response = await page.goto('/contracts/mhs-genesis-electronic-health-record/');
    expect(response.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('CTA and content links', () => {
  test('homepage lead story card links to article (internal or external)', async ({ page }) => {
    await page.goto('/');
    const leadCard = page.locator('a.card').first();
    const href = await leadCard.getAttribute('href');
    // Lead story can be internal (/newsletter/...) or external (https://...)
    expect(href).toMatch(/^(\/newsletter\/.+\/|https:\/\/)/);
  });

  test('article prev/next navigation works', async ({ page }) => {
    await page.goto('/newsletter/anthropic-ban-what-numbers-say/');
    const prevNext = page.locator('a[href*="/newsletter/"]');
    const count = await prevNext.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('No console errors on key pages', () => {
  const pagesToCheck = ['/', '/about.html', '/latest.html', '/resources.html'];

  for (const path of pagesToCheck) {
    test(`${path} has no JS errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(path);
      await page.waitForTimeout(1000);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('404 page', () => {
  test('non-existent page returns 404 status', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist.html');
    expect(response.status()).toBe(404);
  });
});

test.describe('Back/forward navigation', () => {
  test('back button returns to previous page', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav .hidden.md\\:flex').getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/about/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});
