const { test, expect } = require('@playwright/test');
const { makeHandler } = require('../netlify/functions/support-agent.js');

// Site help widget, end to end in a real browser against dist/.
//
// The widget's requests are answered in this process by the REAL
// support-agent handler running the REAL retrieval over the page index and
// corpus this build produced (run `node build.js` first, as for every spec
// here). Only three things are doubles: the model (so the run is free and
// deterministic), the email sender (so nothing reaches the support inbox),
// and Supabase (so no row is written). Spec: docs/support-widget-spec.md.

const MEMBER_TOKEN = 'e2e-member-token';
const ENDPOINT = '**/.netlify/functions/support-agent';

function harness() {
  const seen = { prompts: [], emails: [], rows: [] };
  const state = { emailWorks: true };
  process.env.SUPABASE_URL = 'https://e2e.invalid';
  process.env.SUPABASE_SERVICE_KEY = 'e2e-service-key-0123456789';
  const handler = makeHandler({
    createClient: () => ({
      from: () => {
        let row;
        const api = {
          insert(r) { row = r; return api; },
          select() { return api; },
          async maybeSingle() { seen.rows.push(row); return { data: { id: `e2e-${seen.rows.length}` }, error: null }; },
        };
        return api;
      },
    }),
    verifyToken: (token) => (token === MEMBER_TOKEN ? { ok: true, email: 'member@example.test' } : { ok: false, reason: 'bad_signature' }),
    loadEntitlement: async () => ({ ok: true, tier: 'premium' }),
    checkRateLimit: async () => ({ allowed: true }),
    callModel: async (_model, opts) => {
      seen.prompts.push(opts.messages[0].content);
      return { text: JSON.stringify({ answer: 'Stubbed wording for the first source.', sources: [1], answered: true }), usage: { input_tokens: 1, output_tokens: 1 } };
    },
    sendEmail: async (message) => {
      seen.emails.push(message);
      return state.emailWorks ? { success: true, id: 're_e2e' } : { success: false, error: 'stubbed failure' };
    },
  });
  const attach = (page) => page.route(ENDPOINT, async (route) => {
    const request = route.request();
    const res = await handler({ httpMethod: request.method(), headers: { 'x-nf-client-connection-ip': '198.51.100.9' }, body: request.postData() });
    await route.fulfill({ status: res.statusCode, contentType: 'application/json', body: res.body });
  });
  return { seen, state, attach };
}

const fab = (page) => page.locator('#support-fab');
const panel = (page) => page.locator('#support-panel');
const answers = (page) => page.locator('#support-messages [data-role="agent"]');

async function ask(page, question) {
  const before = await answers(page).count();
  await page.locator('#support-input').fill(question);
  await page.locator('#support-input').press('Enter');
  await expect(answers(page)).toHaveCount(before + 1);
  return answers(page).last();
}

test.describe('Site help widget', () => {
  test('a signed-out reader asking for the DHA org chart is shown the page, marked Premium, and pricing', async ({ page }) => {
    const { seen, attach } = harness();
    await attach(page);
    await page.goto('/');
    await expect(fab(page)).toBeVisible();
    await expect(fab(page)).toHaveAttribute('aria-expanded', 'false');
    await fab(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('#support-input')).toBeFocused();

    const answer = await ask(page, 'Where can I find the DHA org chart?');
    await expect(answer).toContainText('Stubbed wording for the first source.');
    const links = answer.locator('a');
    await expect(links.first()).toHaveAttribute('href', '/premium/org-charts/dha');
    await expect(links.first()).toHaveText('DHA Organizational Structure');
    await expect(answer).toContainText('★ Premium');
    await expect(answer.locator('a[href="/pricing"]')).toHaveCount(1);

    // The paywall, end to end: the model was shown a locked source and no
    // text from behind the gate.
    expect(seen.prompts[0]).toContain('[1] DHA Organizational Structure (LOCKED Premium page');
    expect(seen.prompts[0]).not.toMatch(/Structure effective|Leadership as of/);
    expect(seen.rows[0].details).toMatchObject({ mode: 'anonymous', answered: true, source: 'model' });
    expect(seen.rows[0].user_email).toBeNull();
  });

  test('the answer is still there after the reader follows its link', async ({ page }) => {
    const { attach } = harness();
    await attach(page);
    await page.goto('/pricing.html');
    await fab(page).click();
    const answer = await ask(page, 'What is ProposalPulse?');
    await expect(answer.locator('a').first()).toHaveAttribute('href', '/proposal-pulse');
    await answer.locator('a').first().click();
    await expect(page).toHaveURL(/\/proposal-pulse/);
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('#support-messages [data-role="user"]')).toHaveText(['What is ProposalPulse?']);
    await expect(answers(page).last()).toContainText('Stubbed wording');
  });

  test('a signed-in member is answered from the member page', async ({ page }) => {
    const { seen, attach } = harness();
    await attach(page);
    await page.addInitScript((token) => window.localStorage.setItem('mmt_subscriber_token', token), MEMBER_TOKEN);
    await page.goto('/help.html');
    await fab(page).click();
    const answer = await ask(page, 'Where can I find the DHA org chart?');
    await expect(answer.locator('a').first()).toHaveAttribute('href', '/premium/org-charts/dha');
    await expect(answer.locator('a[href="/pricing"]')).toHaveCount(0);
    expect(seen.prompts[0]).toContain('[1] DHA Organizational Structure (Premium page');
    expect(seen.prompts[0]).not.toContain('LOCKED');
    expect(seen.prompts[0]).toMatch(/Structure effective/);
    expect(seen.rows[0]).toMatchObject({ user_email: 'member@example.test' });
    expect(seen.rows[0].details.mode).toBe('member');
  });

  test('a question the site has no page on says so, and can be sent to a person', async ({ page }) => {
    const { seen, state, attach } = harness();
    await attach(page);
    await page.goto('/');
    await fab(page).click();
    const answer = await ask(page, 'what is the weather in Boston');
    await expect(answer).toContainText('The site does not have a page on that.');
    await expect(answer.locator('a')).toHaveText(['Help and user guide', 'Ask MMT']);
    expect(seen.prompts).toHaveLength(0); // nothing retrieved, so the model was never called

    await answer.getByRole('button', { name: 'Email this to a person' }).click();
    await expect(page.locator('#support-escalate-email')).toBeFocused();
    expect(seen.emails).toHaveLength(0); // opening the form sends nothing
    await page.locator('#support-escalate-email').fill('reader@example.test');
    await page.getByRole('button', { name: 'Send to a person' }).click();
    await expect(answers(page).last()).toHaveText('Sent to MMT support, with reader@example.test as the address to reply to.');
    expect(seen.emails[0]).toMatchObject({ to: 'support@missionmeetstech.com', replyTo: 'reader@example.test' });
    expect(seen.emails[0].html).toContain('what is the weather in Boston');

    // The fault this widget was rebuilt for: a send that fails must say so.
    state.emailWorks = false;
    await page.getByRole('button', { name: 'Email a person instead' }).click();
    await page.locator('#support-escalate-email').fill('reader@example.test');
    await page.getByRole('button', { name: 'Send to a person' }).click();
    await expect(answers(page).last()).toContainText('That did not send.');
    await expect(answers(page).last()).not.toContainText('Sent to MMT support');
  });

  test('works by keyboard alone', async ({ page }) => {
    const { attach } = harness();
    await attach(page);
    await page.goto('/about.html');
    await fab(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('#support-input')).toBeFocused();
    await page.keyboard.type('How much does Premium cost?');
    await page.keyboard.press('Enter');
    await expect(answers(page).last().locator('a').first()).toHaveAttribute('href', '/pricing');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(fab(page)).toBeFocused();
    await expect(fab(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('fits a phone screen', async ({ page }) => {
    const { attach } = harness();
    await attach(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(fab(page)).toBeVisible();
    await fab(page).click();
    await ask(page, 'Where is the pursuit calendar?');
    const box = await panel(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y).toBeGreaterThanOrEqual(0);
    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(scrolls).toBe(false);
  });

  // /glossary.html is left out on purpose: `serve` (this suite's static
  // server) redirects it to /glossary and answers that with
  // dist/glossary/index.html, the term-page hub, which is a different page
  // from dist/glossary.html. Netlify serves glossary.html at both URLs.
  const SWEEP = [
    '/', '/pricing.html', '/help.html', '/contract-tracker.html', '/idiq-tracker.html', '/newswire.html',
    '/agencies/', '/agencies/dha/', '/proposal-pulse.html', '/marketpulse.html', '/dashboard.html',
    '/premium/org-charts/dha.html', '/premium/key-people.html', '/capture-corner.html', '/tools.html', '/security.html',
  ];
  for (const path of SWEEP) {
    test(`${path} mounts one help button and throws no script error`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(path);
      await expect(fab(page)).toHaveCount(1);
      await expect(panel(page)).toHaveCount(1);
      await fab(page).click();
      await expect(panel(page)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
