const { test, expect } = require('@playwright/test');
const site = require('./built-site-data');

// The archive paginates (12 to a page at the time of writing). The page size
// is read off page 1 rather than assumed, and the entry count comes from
// dist/newsletters.json, so a content drop cannot break these.
async function archivePageSize(page) {
  await page.goto('/newsletter.html');
  const perPage = await page.locator('article.card').count();
  expect(perPage).toBeGreaterThan(0);
  return perPage;
}

const badgeNumber = (text) => Number(text.trim().replace('#', ''));

test.describe('Newsletter archive completeness', () => {
  test('page 1 opens on the newest issue with the top issue number', async ({ page }) => {
    await page.goto('/newsletter.html');
    await expect(page).toHaveTitle(/Subscribe/i);
    const first = page.locator('article.card').first();
    await expect(first.locator('h3 a')).toHaveAttribute('href', site.newest.url);
    await expect(first.locator('span.text-eyebrow')).toHaveText(`#${site.archive.length}`);
  });

  test('every archive page renders, and together they hold every issue once, numbered #N down to #1', async ({ page }) => {
    const perPage = await archivePageSize(page);
    const totalPages = Math.ceil(site.archive.length / perPage);
    const hrefs = [];
    const badges = [];
    for (let n = 1; n <= totalPages; n++) {
      if (n > 1) {
        const response = await page.goto(`/newsletter/page/${n}/`);
        expect(response.status(), `/newsletter/page/${n}/`).toBe(200);
      }
      const cards = page.locator('article.card');
      const expected = n === totalPages ? site.archive.length - perPage * (totalPages - 1) : perPage;
      await expect(cards).toHaveCount(expected);
      hrefs.push(...(await cards.locator('h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))));
      badges.push(...(await cards.locator('span.text-eyebrow').allInnerTexts()).map(badgeNumber));
    }
    expect(hrefs).toEqual(site.archive.map((e) => e.url));
    expect(badges).toEqual(site.archive.map((_, i) => site.archive.length - i));
    const past = await page.goto(`/newsletter/page/${totalPages + 1}/`);
    expect(past.status()).toBe(404);
  });

  test('each archive card has a linked title, a date line and a description', async ({ page }) => {
    await page.goto('/newsletter.html');
    const cards = page.locator('article.card');
    const count = await cards.count();
    for (const idx of [0, Math.floor(count / 2), count - 1]) {
      const card = cards.nth(idx);
      await expect(card.locator('h3 a')).toHaveAttribute('href', /.+/);
      await expect(card.locator('p.text-caption').first()).toBeVisible();
      await expect(card.locator('p.text-caption')).toHaveCount(2);
    }
  });

  test('page 1 links forward to page 2 when the archive paginates', async ({ page }) => {
    const perPage = await archivePageSize(page);
    test.skip(site.archive.length <= perPage, 'archive fits on one page');
    await page.locator('a[href="/newsletter/page/2/"]').first().click();
    await expect(page).toHaveURL(/\/newsletter\/page\/2\/$/);
    await expect(page.locator('article.card').first().locator('span.text-eyebrow'))
      .toHaveText(`#${site.archive.length - perPage}`);
  });
});

test.describe('Newsletter hybrid navigation', () => {
  test('a free on-site issue opens with its body; a gated one hides it from a signed-out reader', async ({ page }) => {
    const perPage = await archivePageSize(page);
    const n = site.pageOf(site.newestFree, perPage);
    await page.goto(n === 1 ? '/newsletter.html' : `/newsletter/page/${n}/`);
    const link = page.locator(`article.card a[href="${site.newestFree.url}"]`).first();
    await expect(link).toBeVisible();
    await page.goto(site.newestFree.url);
    await expect(page.locator('main .article-content')).toBeVisible();
    if (site.newestGated) {
      await page.goto(site.newestGated.url);
      await expect(page.locator('article.article-shell[data-access="premium"]')).toBeHidden();
    }
  });

  test('external issues open in a new tab with rel="noopener"', async ({ page }) => {
    test.skip(site.external.length === 0, 'no external issues in dist/newsletters.json');
    const perPage = await archivePageSize(page);
    for (const entry of site.external) {
      const n = site.pageOf(entry, perPage);
      await page.goto(n === 1 ? '/newsletter.html' : `/newsletter/page/${n}/`);
      const link = page.locator(`article.card a[href="${entry.url}"]`).first();
      await expect(link, `${entry.url} on archive page ${n}`).toBeAttached();
      await expect(link).toHaveAttribute('target', '_blank');
      expect(await link.getAttribute('rel')).toContain('noopener');
    }
  });

  test('all archive card titles are crawlable anchor tags', async ({ page }) => {
    await page.goto('/newsletter.html');
    const cards = await page.locator('article.card').count();
    await expect(page.locator('article.card h3 a[href]')).toHaveCount(cards);
  });
});

test.describe('Homepage newsletter coverage', () => {
  test('homepage shows recent articles from full archive', async ({ page }) => {
    await page.goto('/');
    const articleCards = page.locator('a.card');
    expect(await articleCards.count()).toBeGreaterThanOrEqual(4);
  });

  test('homepage newest article matches archive newest', async ({ page }) => {
    await page.goto('/newsletter.html');
    const newestArchiveTitle = await page.locator('article.card').first().locator('h3 a').innerText();
    await page.goto('/');
    const pageContent = await page.content();
    expect(pageContent).toContain(newestArchiveTitle.trim());
  });
});

test.describe('Analysis page coverage', () => {
  const articleCards = (page) => page.locator('article.archive-item[data-content-type="article"]');

  test('Analysis page lists every newsletter article', async ({ page }) => {
    await page.goto('/latest.html');
    await expect(page).toHaveTitle(/Analysis/i);
    expect(await articleCards(page).count()).toBeGreaterThanOrEqual(site.archive.length);
  });

  test('Analysis page articles sorted newest first', async ({ page }) => {
    await page.goto('/latest.html');
    await expect(articleCards(page).first().locator('h3 a')).toHaveAttribute('href', site.newest.url);
  });

  test('premium-gated cards stay hidden for a signed-out reader; free cards show', async ({ page }) => {
    await page.goto('/latest.html');
    const gated = page.locator('article.archive-item[data-access="premium"]');
    test.skip((await gated.count()) === 0, 'no premium-gated cards on the Analysis page');
    await expect(gated.first()).toBeHidden();
    await expect(page.locator('article.archive-item[data-content-type="article"]:not([data-access="premium"])').first()).toBeVisible();
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
    const navLink = page.locator('nav .hidden.md\\:flex').getByRole('link', { name: 'Resources', exact: true });
    await navLink.click();
    await page.waitForURL(/resources/);
    await expect(page).toHaveTitle(/Resources/i);
  });
});
