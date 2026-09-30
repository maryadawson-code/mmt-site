const { test, expect } = require('@playwright/test');

// Titles are matched against the live <title> of each page in dist/. When a
// title changes on purpose, change it here in the same PR (the 2026-09-21 QA
// pass found 16 stale expectations in this file and none of them were bugs).
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

// Primary nav order is a standing rule (CLAUDE.md, Design system).
const PRIMARY_NAV = ['Intelligence', 'ProposalPulse', 'MarketPulse', 'Resources', 'Podcast', 'About'];

const primaryNav = (page) => page.locator('nav .hidden.md\\:flex').first();

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
  test('desktop nav carries the six primary links in order', async ({ page }) => {
    await page.goto('/');
    const links = primaryNav(page).getByRole('link');
    await expect(links).toHaveText(PRIMARY_NAV);
    for (const name of PRIMARY_NAV) {
      await expect(primaryNav(page).getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('utility nav has Sign In, Premium and Choose a Tool', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav');
    await expect(nav.getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Premium/ }).first()).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Choose a Tool' })).toBeVisible();
  });

  test('nav Intelligence link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await primaryNav(page).getByRole('link', { name: 'Intelligence', exact: true }).click();
    await expect(page).toHaveURL(/latest/);
    await expect(page).toHaveTitle(/Analysis/i);
  });

  test('nav Podcast link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await primaryNav(page).getByRole('link', { name: 'Podcast', exact: true }).click();
    await expect(page).toHaveURL(/podcast/);
    await expect(page).toHaveTitle(/Fed UP Podcast/i);
  });

  test('revenue tools are reachable from the nav', async ({ page }) => {
    await page.goto('/');
    await primaryNav(page).getByRole('link', { name: 'ProposalPulse', exact: true }).click();
    await expect(page).toHaveURL(/proposal-pulse/);
    await page.goto('/');
    await primaryNav(page).getByRole('link', { name: 'MarketPulse', exact: true }).click();
    await expect(page).toHaveURL(/marketpulse/);
  });

  test('nav logo returns home', async ({ page }) => {
    await page.goto('/about.html');
    await page.locator('nav a').first().click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });
});

test.describe('Footer navigation', () => {
  test('footer carries the Read, Tools, Reference and Trust links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const name of ['Latest Intelligence', 'Podcast', 'Subscribe', 'ProposalPulse', 'MarketPulse', 'Contract Tracker', 'Glossary', 'Newswire', 'About', 'Privacy', 'Terms', 'Contact', 'MMT Premium']) {
      await expect(footer.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('footer never says "News Wire" (canonical string is Newswire)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).not.toContainText('News Wire');
  });

  test('footer Privacy link works', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveURL(/privacy/);
    await expect(page).toHaveTitle(/Privacy/i);
  });
});

test.describe('Deep link and refresh', () => {
  test('newest archive article loads via direct URL with content', async ({ page }) => {
    await page.goto('/newsletter.html');
    const href = await page.locator('article.card a[href^="/newsletter/"]').first().getAttribute('href');
    const response = await page.goto(href);
    expect(response.status()).toBe(200);
    await expect(page.locator('main .article-content')).toBeAttached();
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
  });

  test('topic page loads via direct URL', async ({ page }) => {
    const response = await page.goto('/topics/ai-innovation/');
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(/AI/i);
  });

  test('contract detail page loads via direct URL', async ({ page }) => {
    const response = await page.goto('/contracts/tpharm5-tricare-pharmacy/');
    expect(response.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
    await expect(page).toHaveTitle(/TPharm5/i);
  });
});

test.describe('CTA and content links', () => {
  test('homepage carries article cards that link to real articles', async ({ page }) => {
    await page.goto('/');
    // The first cards are the tool chooser (Ask MMT, ProposalPulse, MarketPulse);
    // the story cards are <a class="article-card"> linking on-site or to LinkedIn.
    const storyCards = page.locator('main a.article-card[href^="/newsletter/"], main a.article-card[href^="/intel/"], main a.article-card[href^="https://"]');
    expect(await storyCards.count()).toBeGreaterThan(0);
  });

  test('homepage keeps both revenue tools above the fold', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main').getByRole('link', { name: /ProposalPulse/ }).first()).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: /MarketPulse/ }).first()).toBeVisible();
  });
});

test.describe('No console errors on key pages', () => {
  const pagesToCheck = ['/', '/about.html', '/latest.html', '/resources.html', '/proposal-pulse.html', '/marketpulse.html', '/pricing.html', '/contract-tracker.html'];

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
    await primaryNav(page).getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/about/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});
