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
// Catch the sends in an array. Its status is the reply status, which a test can change; 0 aborts the request,
// as when the user is offline.
async function catchSends(page, status = 200) {
  const sent = [];
  sent.status = status;
  await page.route(URL_, async route => {
    const req = route.request();
    sent.push({ method: req.method(), type: req.headers()['content-type'], body: JSON.parse(req.postData()) });
    if (sent.status === 0) return route.abort();
    await route.fulfill({ status: sent.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: sent.status === 200 }) });
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

// With the real engine (needs network), on the sample game at depth 14, as in app.spec.js.
test('thumbs on the advice: a vote, a changed vote, a note after a thumbs-down, and memory for the page load', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('drills.depth')) localStorage.setItem('drills.depth', '14') });
  await serveWithUrl(page, URL_);
  const sent = await catchSends(page);
  await page.goto('/');
  await expect(page.locator('#ptext')).toHaveText('Analysis complete', { timeout: 90_000 });
  await page.locator('.pitem .mv', { hasText: '20… Rb8' }).click();
  const p = await page.evaluate(() => { const p = window.BlunderDrills.trainer.p; return { fen: p.fen, played: p.played.uci, pv: p.pv, refute: p.refute } });
  const vote = page.locator('#vote'), up = vote.getByRole('button', { name: 'Yes' }), down = vote.getByRole('button', { name: 'No' });
  await expect(vote).toBeHidden(); // no advice yet
  await page.locator('#bSol').click();
  const note = 'The game move, 20... Rb8, lost your rook. It allowed 21. Nc6, which forks your queen on d8 and your rook on b8, and wins the rook.';
  await expect(page.locator('#fb .note')).toHaveText(note);
  await expect(vote.getByRole('group', { name: 'Was this explanation right?' })).toBeVisible();

  await up.click();
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#voteMsg')).toHaveText('Thanks.');
  await expect(page.locator('#voteWhy')).toBeHidden();
  const advice = { fen: p.fen, type: 'blunder', played: p.played, line: p.pv.slice(0, 12), refute: p.refute.slice(0, 12), idea: null, allowed: 'fork', note };
  expect(sent.map(s => s.body)).toEqual([{ v: 1, page: expect.stringMatching(/^[0-9a-f]{12}$/), app: 'dev', hp: '', kind: 'vote', vote: 1, puzzle: advice }]);
  await up.click(); // the same vote again: nothing to send
  await down.click(); // a changed vote is a new row
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#voteWhy')).toBeVisible();
  expect(sent.map(s => s.body.vote)).toEqual([1, -1]);

  await page.locator('#voteText').fill('The rook was lost already.');
  await page.locator('#voteSend').click();
  await expect(page.locator('#voteMsg')).toHaveText('Thanks. We read every message.');
  await expect(page.locator('#voteWhy')).toBeHidden();
  expect(sent[2].body).toMatchObject({ kind: 'text', text: 'The rook was lost already.', puzzle: advice });

  // The general message takes the advice too. A key in the dialog does not work the puzzle shortcuts.
  await page.locator('#bFeedback').click();
  await expect(page.locator('#fbPos')).toBeChecked();
  await page.locator('#fbText').fill('Good site.');
  await page.locator('#fbCancel').focus();
  await page.keyboard.press('n');
  await expect(page.locator('#tcount')).toHaveText('Puzzle 1 of 6');
  await page.locator('#fbSend').click();
  await expect(page.locator('#fbStatus')).toHaveText('Thanks. We read every message.');
  expect(sent[3].body).toMatchObject({ kind: 'text', text: 'Good site.', puzzle: advice });
  await page.keyboard.press('Escape');

  // Another puzzle: no thumbs until its advice. Back again: the vote of this page load is still pressed.
  await page.locator('#bNext').click();
  await expect(vote).toBeHidden();
  await page.locator('#bPrev').click();
  await page.locator('#bSol').click();
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#voteMsg')).toHaveText('');

  // A failed send says so and puts the old vote back.
  sent.status = 500;
  await up.click();
  await expect(page.locator('#voteMsg')).toHaveText('Could not send. Try again later.');
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  expect(sent).toHaveLength(5);
});
