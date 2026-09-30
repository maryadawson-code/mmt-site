const { test, expect } = require('@playwright/test');
const site = require('./built-site-data');

// Core page routes. Title patterns match the current <title> of each page;
// the pages say "Analysis", "About", "Subscribe" and "Newswire" (one word).
const CORE_PAGES = [
  { path: '/', title: 'Mission Meets Tech' },
  { path: '/latest.html', title: 'Analysis' },
  { path: '/podcast.html', title: 'Fed UP Podcast' },
  { path: '/resources.html', title: 'Resources' },
  { path: '/proposal-pulse.html', title: 'ProposalPulse' },
  { path: '/marketpulse.html', title: 'MarketPulse' },
  { path: '/pricing.html', title: 'MMT Premium' },
  { path: '/about.html', title: 'About' },
  { path: '/newsletter.html', title: 'Subscribe' },
  { path: '/topics.html', title: 'Topics' },
  { path: '/newswire.html', title: 'Newswire' },
  { path: '/contract-tracker.html', title: 'Contract Tracker' },
  { path: '/events.html', title: 'Events' },
  { path: '/privacy.html', title: 'Privacy' },
  { path: '/glossary.html', title: 'Glossary' },
];

const desktopNav = (page) => page.locator('nav .hidden.md\\:flex');

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
    const nav = desktopNav(page);
    for (const name of ['Intelligence', 'ProposalPulse', 'MarketPulse', 'Resources', 'Podcast', 'About']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('nav Intelligence link opens the Analysis page', async ({ page }) => {
    await page.goto('/');
    await desktopNav(page).getByRole('link', { name: 'Intelligence', exact: true }).click();
    // serve uses clean URLs: latest.html → /latest
    await expect(page).toHaveURL(/latest/);
    await expect(page).toHaveTitle(/Analysis/i);
  });

  test('nav Podcast link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await desktopNav(page).getByRole('link', { name: 'Podcast', exact: true }).click();
    await expect(page).toHaveURL(/podcast/);
    await expect(page).toHaveTitle(/Fed UP Podcast/i);
  });

  test('nav logo returns home', async ({ page }) => {
    await page.goto('/about.html');
    await page.locator('nav a').first().click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });
});

test.describe('Footer navigation', () => {
  test('footer has the Read, Tools, Reference, Trust and Premium columns', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const heading of ['Read', 'Tools', 'Reference', 'Trust', 'Premium']) {
      await expect(footer.locator('strong', { hasText: heading }).first()).toBeVisible();
    }
    for (const name of ['Latest Intelligence', 'Podcast', 'Subscribe', 'ProposalPulse', 'MarketPulse',
      'Contract Tracker', 'Glossary', 'About', 'Privacy', 'Terms', 'Contact']) {
      await expect(footer.getByRole('link', { name, exact: true }).first()).toBeVisible();
    }
    // Located by href on purpose: the link text still reads "News Wire" while
    // the canonical string is "Newswire". Fixing the copy must not break this.
    await expect(footer.locator('a[href="/newswire.html"]').first()).toBeVisible();
  });

  test('footer Privacy link works', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Privacy', exact: true }).first().click();
    await expect(page).toHaveURL(/privacy/);
    await expect(page).toHaveTitle(/Privacy/i);
  });
});

test.describe('Deep link and refresh', () => {
  test('newest free on-site issue loads via direct URL with its body', async ({ page }) => {
    const entry = site.newestFree;
    const response = await page.goto(entry.url);
    expect(response.status()).toBe(200);
    const title = (await page.title()).toLowerCase();
    expect(title).toContain(entry.title.slice(0, 20).toLowerCase());
    await expect(page.locator('main .article-content')).toBeVisible();
  });

  test('a topic page linked from the archive loads via direct URL', async ({ page }) => {
    await page.goto('/newsletter.html');
    const href = await page.locator('article.card a[href^="/topics/"]').first().getAttribute('href');
    expect(href).toMatch(/^\/topics\/.+\/$/);
    const response = await page.goto(href);
    expect(response.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  });

  test('refresh on nested article page works', async ({ page }) => {
    const entry = site.newestFree;
    await page.goto(entry.url);
    await page.reload();
    expect((await page.title()).toLowerCase()).toContain(entry.title.slice(0, 20).toLowerCase());
    await expect(page.locator('main')).toBeVisible();
  });

  test('contract detail pages load via direct URL', async ({ page }) => {
    // First and last tracker rows; slugs are read from contracts.json, so a
    // renamed contract moves the test instead of breaking it.
    const picks = [site.contracts[0], site.contracts[site.contracts.length - 1]];
    for (const contract of picks) {
      expect(contract.slug).toBeTruthy();
      const response = await page.goto(`/contracts/${contract.slug}/`);
      expect(response.status(), `/contracts/${contract.slug}/`).toBe(200);
      await expect(page.locator('main')).toBeVisible();
    }
  });
});

test.describe('CTA and content links', () => {
  test('homepage lead card links to a page that resolves', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('a.card').first().getAttribute('href');
    expect(href).toBeTruthy();
    const response = await page.goto(href);
    expect(response.status(), href).toBe(200);
  });

  test('homepage links the newest issue', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`a[href="${site.newest.url}"]`).first()).toBeAttached();
  });

  test('article prev/next navigation works', async ({ page }) => {
    await page.goto(site.newestFree.url);
    const prevNext = page.locator('a[href*="/newsletter/"]');
    expect(await prevNext.count()).toBeGreaterThan(0);
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
    await desktopNav(page).getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/about/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});
