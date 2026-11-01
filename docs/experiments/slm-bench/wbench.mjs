import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [repo, file, mode, threads, useSchema] = process.argv.slice(2);
const P = JSON.parse(fs.readFileSync(new URL('./prompt.json', import.meta.url)));
let user = P.user; if (/qwen3/i.test(repo)) user += ' /no_think';
const schema = useSchema ? { type: 'object', required: ['verdict', 'right', 'wrong', 'habit'], properties: {
  verdict: { enum: ['right', 'partial', 'missed'] }, right: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  wrong: { type: 'array', items: { type: 'string' }, maxItems: 3 }, habit: { type: 'string' } } } : null;
const ctx = await chromium.launchPersistentContext(new URL('./profile', import.meta.url).pathname, { headless: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${mode === 'iso' ? 8811 : 8810}/w`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const res = await page.evaluate(a => window.run(a), { repo, file, threads: threads ? +threads : 0, maxNew: 300, schema,
  messages: [{ role: 'system', content: P.system }, { role: 'user', content: user }] });
console.log(JSON.stringify({ repo, file, mode, ...res }, null, 1));
await ctx.close();
