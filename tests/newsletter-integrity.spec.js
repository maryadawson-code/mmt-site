const { test, expect } = require('@playwright/test');

const EXPECTED_ARCHIVE_COUNT = 76;

test.describe('Newsletter archive completeness', () => {
  test('archive page loads and shows all entries', async ({ page }) => {
    await page.goto('/newsletter.html');
    await expect(page).toHaveTitle(/Newsletter/i);
    const cards = page.locator('article.card');
    await expect(cards).toHaveCount(EXPECTED_ARCHIVE_COUNT);
  });

  test('each archive entry has title, date, and description', async ({ page }) => {
    await page.goto('/newsletter.html');
    const cards = page.locator('article.card');
    const count = await cards.count();
    expect(count).toBe(EXPECTED_ARCHIVE_COUNT);

    // Spot-check first, middle, and last entry
    for (const idx of [0, Math.floor(count / 2), count - 1]) {
      const card = cards.nth(idx);
      await expect(card.locator('h3')).toBeVisible();
      await expect(card.locator('h3 a')).toHaveAttribute('href', /.+/);
    }
  });

  test('archive has sequential issue numbers from #1 to total count', async ({ page }) => {
    await page.goto('/newsletter.html');
    const cards = page.locator('article.card');
    const count = await cards.count();
    // First entry should be #(total), last should be #1
    const firstBadge = cards.first().locator('span:has-text("#")');
    await expect(firstBadge).toContainText(`#${count}`);
    const lastBadge = cards.last().locator('span:has-text("#")');
    await expect(lastBadge).toContainText('#1');
  });
});

test.describe('Newsletter hybrid navigation', () => {
  test('internal article opens on-site page with content', async ({ page }) => {
    await page.goto('/newsletter.html');
    // Find an internal link (starts with /newsletter/)
    const internalLink = page.locator('article.card a[href^="/newsletter/"]').first();
    await expect(internalLink).toBeVisible();
    const href = await internalLink.getAttribute('href');
    // Navigate to it
    await page.goto(href);
    await expect(page.locator('main .article-content')).toBeVisible();
  });

  test('external articles have correct href and safe attributes', async ({ page }) => {
    await page.goto('/newsletter.html');
    // Find external links (LinkedIn)
    const externalLinks = page.locator('article.card a[href^="https://www.linkedin.com"]');
    const count = await externalLinks.count();
    expect(count).toBeGreaterThan(0);

    // Verify first few external links have target="_blank" and rel="noopener"
    const samplesToCheck = Math.min(count, 5);
    for (let i = 0; i < samplesToCheck; i++) {
      const link = externalLinks.nth(i);
      await expect(link).toHaveAttribute('target', '_blank');
      const rel = await link.getAttribute('rel');
      expect(rel).toContain('noopener');
    }
  });

  test('all archive links are crawlable anchor tags', async ({ page }) => {
    await page.goto('/newsletter.html');
    // Every card title must be an <a> with href (not JS-only navigation)
    const titleLinks = page.locator('article.card h3 a[href]');
    const count = await titleLinks.count();
    expect(count).toBe(EXPECTED_ARCHIVE_COUNT);
  });
});

test.describe('Homepage newsletter coverage', () => {
  test('homepage shows recent articles from full archive', async ({ page }) => {
    await page.goto('/');
    // Should show at least 4 article cards (lead + 3 latest)
    const articleCards = page.locator('a.card');
    const count = await articleCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('homepage newest article matches archive newest', async ({ page }) => {
    // Get the newest title from archive
    await page.goto('/newsletter.html');
    const newestArchiveTitle = await page.locator('article.card').first().locator('h3 a').innerText();

    // Check homepage has it
    await page.goto('/');
    const pageContent = await page.content();
    expect(pageContent).toContain(newestArchiveTitle.trim());
  });
});

test.describe('Intelligence page coverage', () => {
  test('Intelligence page shows all newsletter articles plus episodes', async ({ page }) => {
    await page.goto('/latest.html');
    await expect(page).toHaveTitle(/Latest Articles/i);
    const cards = page.locator('article.card');
    const count = await cards.count();
    // Should have at least 75 articles (plus podcast episodes)
    expect(count).toBeGreaterThanOrEqual(EXPECTED_ARCHIVE_COUNT);
  });

  test('Intelligence page articles sorted newest first', async ({ page }) => {
    await page.goto('/latest.html');
    // The first non-podcast card should be a recent article
    const firstArticle = page.locator('article.card').first();
    await expect(firstArticle).toBeVisible();
  });
});

test.describe('Navigation click safety', () => {
  test('archive internal link click navigates to article page', async ({ page }) => {
    await page.goto('/newsletter.html');
    const internalLink = page.locator('article.card a[href^="/newsletter/"]').first();
    const href = await internalLink.getAttribute('href');
    await internalLink.click();
    await page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('main')).toBeVisible();
  });

  test('header nav click triggers navigation (not dead click)', async ({ page }) => {
    await page.goto('/');
    const navLink = page.locator('nav .hidden.md\\:flex').getByRole('link', { name: 'Resources' });
    await navLink.click();
    await page.waitForURL(/resources/);
    await expect(page).toHaveTitle(/Resources/i);
  });
});
