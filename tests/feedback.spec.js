// Tests for the feedback UI in the page. The tests put a test FEEDBACK_URL in the served page and catch
// each POST with page.route(), so they never call the real Worker.
import { test, expect } from '@playwright/test';

const URL_ = 'https://feedback.test/feedback';

// Serve the page with FEEDBACK_URL set to url ('' turns the feedback UI off).
async function serveWithUrl(page, url) {
  await page.route(u => u.pathname === '/', async route => {
    const r = await route.fetch(), html = await r.text();
    const out = html.replace(/^const FEEDBACK_URL = '[^']*';/m, `const FEEDBACK_URL = '${url}';`);
    expect(out, 'the page has a FEEDBACK_URL line').not.toBe(url ? html : null);
    await route.fulfill({ response: r, body: out });
  });
}
// Catch the sends. status: the reply status; 0 aborts the request, as when the user is offline.
async function catchSends(page, status = 200) {
  const sent = [];
  await page.route(URL_, async route => {
    const req = route.request();
    sent.push({ method: req.method(), type: req.headers()['content-type'], body: JSON.parse(req.postData()) });
    if (status === 0) return route.abort();
    await route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: status === 200 }) });
  });
  return sent;
}
// The page with no engine: no puzzle is on the board.
async function openNoEngine(page) {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.BlunderDrills);
}

test('with no FEEDBACK_URL, the page shows no feedback UI', async ({ page }) => {
  await serveWithUrl(page, '');
  await openNoEngine(page);
  await expect(page.locator('#bFeedback')).toBeHidden();
  await expect(page.locator('#fbPrivacy')).toBeHidden();
});

test('sends a general message as text/plain JSON, and says thanks', async ({ page }) => {
  await serveWithUrl(page, URL_);
  const sent = await catchSends(page);
  await openNoEngine(page);
  await expect(page.locator('#fbPrivacy')).toBeVisible();
  await page.locator('#bFeedback').click();
  const dlg = page.locator('#fbDlg');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#fbPosRow')).toBeHidden(); // no puzzle on the board
  await page.locator('#fbText').fill('  Nice site. ');
  await expect(page.locator('#fbCount')).toHaveText('13 / 1000');
  await page.locator('#fbSend').click();
  await expect(page.locator('#fbStatus')).toHaveText('Thanks. We read every message.');
  await expect(page.locator('#fbSend')).toBeHidden();
  await expect(page.locator('#fbText')).toHaveValue('');
  expect(sent).toHaveLength(1);
  const { body } = sent[0];
  expect([sent[0].method, sent[0].type]).toEqual(['POST', 'text/plain']);
  expect(body).toEqual({ v: 1, page: expect.stringMatching(/^[0-9a-f]{12}$/), app: 'dev', hp: '', kind: 'text', text: 'Nice site.' });
  await page.locator('#fbCancel', { hasText: 'Close' }).click();
  await expect(dlg).toBeHidden();
  await page.locator('#bFeedback').click(); // open again: ready for a new message
  await expect(page.locator('#fbSend')).toBeVisible();
  await expect(page.locator('#fbStatus')).toBeHidden();
});

test('a failed send says so and keeps the text; an empty message is not sent', async ({ page }) => {
  await serveWithUrl(page, URL_);
  const sent = await catchSends(page, 0);
  await openNoEngine(page);
  await page.locator('#bFeedback').click();
  await page.locator('#fbSend').click(); // empty: the browser asks for text
  expect(sent).toHaveLength(0);
  await page.locator('#fbText').fill('Hello');
  await page.locator('#fbSend').click();
  await expect(page.locator('#fbStatus')).toHaveText('Could not send. Try again later.');
  await expect(page.locator('#fbText')).toHaveValue('Hello');
  await expect(page.locator('#fbSend')).toHaveText('Send');
  await expect(page.locator('#fbSend')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#fbDlg')).toBeHidden();
});
