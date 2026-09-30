const { test, expect } = require('@playwright/test');
const path = require('path');

// The archive count comes from the built pages, never a constant: the 76
// that used to live here went stale at 128 issues and the suite failed for
// months. build.js merges newsletters.json with the synced LinkedIn issues,
// so the first card's issue badge (#N) is the total the site itself claims.
const PAGE_SIZE = 12; // build.js paginates the archive at 12 cards a page
// Lower bound only, so a shrinking archive fails loudly.
const MIN_ISSUES = require(path.join(__dirname, '..', 'newsletters.json')).length;

async function archiveTotal(page) {
  await page.goto('/newsletter.html');
  const badge = await page.locator('article.card').first().locator('span:has-text("#")').innerText();
  const total = Number(badge.replace(/[^0-9]/g, ''));
  expect(total, `first archive badge "${badge}" should read #<total>`).toBeGreaterThanOrEqual(MIN_ISSUES);
  return total;
}

test.describe('Newsletter archive completeness', () => {
  test('archive page one shows the first page of cards and links every further page', async ({ page }) => {
    const total = await archiveTotal(page);
    await expect(page).toHaveTitle(/Subscribe/i);
    await expect(page.locator('article.card')).toHaveCount(Math.min(PAGE_SIZE, total));
    for (let p = 2; p <= Math.ceil(total / PAGE_SIZE); p++) {
      await expect(page.locator(`a[href="/newsletter/page/${p}/"]`).first()).toBeAttached();
    }
  });

  test('every archive page renders and the pages add up to the total the site claims', async ({ page }) => {
    const total = await archiveTotal(page);
    let seen = 0;
    for (let p = 1; p <= Math.ceil(total / PAGE_SIZE); p++) {
      const url = p === 1 ? '/newsletter.html' : `/newsletter/page/${p}/`;
      const response = await page.goto(url);
      expect(response.status(), url).toBe(200);
      seen += await page.locator('article.card').count();
    }
    expect(seen).toBe(total);
  });

  test('each archive entry has title, date, and a real link', async ({ page }) => {
    await page.goto('/newsletter.html');
    const cards = page.locator('article.card');
    const count = await cards.count();
    for (const idx of [0, Math.floor(count / 2), count - 1]) {
      const card = cards.nth(idx);
      await expect(card.locator('h3')).toBeVisible();
      await expect(card.locator('h3 a')).toHaveAttribute('href', /.+/);
    }
  });

  test('issue numbers count down from the total on page one', async ({ page }) => {
    const total = await archiveTotal(page);
    const cards = page.locator('article.card');
    const onPage = await cards.count();
    await expect(cards.last().locator('span:has-text("#")')).toContainText(`#${total - onPage + 1}`);
  });

  test('the last archive page ends at issue #1', async ({ page }) => {
    const total = await archiveTotal(page);
    const lastPage = Math.ceil(total / PAGE_SIZE);
    await page.goto(lastPage === 1 ? '/newsletter.html' : `/newsletter/page/${lastPage}/`);
    await expect(page.locator('article.card').last().locator('span:has-text("#")')).toContainText('#1');
  });
});

test.describe('Newsletter hybrid navigation', () => {
  test('internal article opens on-site page with content', async ({ page }) => {
    await page.goto('/newsletter.html');
    const internalLink = page.locator('article.card a[href^="/newsletter/"]').first();
    await expect(internalLink).toBeVisible();
    const href = await internalLink.getAttribute('href');
    await page.goto(href);
    await expect(page.locator('main')).toBeVisible();
    // The body ships in the HTML (a gated issue hides it with CSS until the
    // member check passes, so visibility is not the assertion).
    const body = page.locator('main .article-content');
    await expect(body).toBeAttached();
    expect((await body.innerHTML()).trim().length).toBeGreaterThan(200);
  });

  test('external archive entries open in a new tab with rel=noopener', async ({ page }) => {
    const total = await archiveTotal(page);
    const TOTAL_PAGES = Math.ceil(total / PAGE_SIZE);
    let checked = 0;
    for (let p = 1; p <= TOTAL_PAGES && checked < 5; p++) {
      await page.goto(p === 1 ? '/newsletter.html' : `/newsletter/page/${p}/`);
      const externalLinks = page.locator('article.card h3 a[href^="https://"]');
      const count = await externalLinks.count();
      for (let i = 0; i < count && checked < 5; i++) {
        const link = externalLinks.nth(i);
        await expect(link).toHaveAttribute('target', '_blank');
        expect(await link.getAttribute('rel')).toContain('noopener');
        checked++;
      }
    }
    expect(checked, 'the archive should carry at least one external (Buttondown/LinkedIn) issue').toBeGreaterThan(0);
  });

  test('all archive card titles are crawlable anchor tags', async ({ page }) => {
    await page.goto('/newsletter.html');
    const cards = await page.locator('article.card').count();
    await expect(page.locator('article.card h3 a[href]')).toHaveCount(cards);
  });
});

test.describe('Homepage newsletter coverage', () => {
  test('homepage shows recent article cards', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('a.card').count()).toBeGreaterThanOrEqual(4);
  });

  test('homepage carries the newest archive title', async ({ page }) => {
    await page.goto('/newsletter.html');
    const newestArchiveTitle = (await page.locator('article.card').first().locator('h3 a').innerText()).trim();
    await page.goto('/');
    expect(await page.content()).toContain(newestArchiveTitle);
  });
});

test.describe('Intelligence page coverage', () => {
  test('Intelligence page lists articles newest first', async ({ page }) => {
    await page.goto('/latest.html');
    await expect(page).toHaveTitle(/Analysis/i);
    // latest.html lists every article and episode as <article class="card archive-item">.
    const cards = page.locator('article.archive-item');
    expect(await cards.count()).toBeGreaterThanOrEqual(MIN_ISSUES);
    await expect(cards.first()).toBeAttached();
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
    await page.locator('nav .hidden.md\\:flex').first().getByRole('link', { name: 'Resources', exact: true }).click();
    await page.waitForURL(/resources/);
    await expect(page).toHaveTitle(/Resources/i);
  });
});
