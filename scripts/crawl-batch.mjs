#!/usr/bin/env node
/**
 * Crawls the URLs in today's queue batch and writes one JSON per product.
 * Runs in GitHub Actions (the runner can reach the shop; the Claude sandbox cannot)
 * or locally via the MCP server.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProduct } from './lib/parse-product.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));

const UA = 'SEO-ACE/1.0 (+https://github.com/sperkycontact-beep/seo_ace; owner-operated SEO audit)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'sk-SK,sk;q=0.9' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { html: await res.text(), finalUrl: res.url, status: res.status };
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(attempt * 2000);
    return fetchHtml(url, attempt + 1);
  }
}

const today = process.env.SEO_ACE_DATE || new Date().toISOString().slice(0, 10);
const queuePath = resolve(ROOT, 'data/queue.json');
if (!existsSync(queuePath)) {
  console.error('data/queue.json neexistuje — spust najprv select-batch.mjs.');
  process.exit(2);
}
const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
const batch = queue.batches.find((b) => b.date === today) ?? queue.batches.at(-1);
if (!batch) {
  console.error('Ziadna davka v queue.json.');
  process.exit(2);
}

// The category page gives sibling products for internal-link suggestions.
const targets = [
  { url: cfg.site.baseUrl + cfg.target.categoryPath, kind: 'category' },
  ...batch.items.map((i) => ({ url: i.url, kind: 'product', meta: i })),
];

const outDir = resolve(ROOT, 'data/products', batch.date);
mkdirSync(outDir, { recursive: true });
const results = [];

for (const t of targets) {
  process.stdout.write(`crawl ${t.url} ... `);
  try {
    const { html, finalUrl, status } = await fetchHtml(t.url);
    const parsed = parseProduct(html, finalUrl);
    parsed.kind = t.kind;
    parsed.httpStatus = status;
    parsed.gsc = t.meta ?? null;
    parsed.htmlBytes = html.length;
    const name = t.kind === 'category' ? '_category' : parsed.productId || parsed.slug || 'unknown';
    writeFileSync(resolve(outDir, `${name}.json`), JSON.stringify(parsed, null, 2) + '\n');
    results.push({ url: t.url, ok: true, issues: parsed.diagnostics.length });
    console.log(`OK (${html.length} B, ${parsed.diagnostics.length} zistení)`);
  } catch (err) {
    results.push({ url: t.url, ok: false, error: String(err.message ?? err) });
    console.log(`CHYBA: ${err.message ?? err}`);
  }
  await sleep(1500); // be polite to the shop
}

writeFileSync(
  resolve(outDir, '_crawl-summary.json'),
  JSON.stringify({ date: batch.date, crawledAt: new Date().toISOString(), results }, null, 2) + '\n'
);

const failed = results.filter((r) => !r.ok);
console.log(`\nHotovo: ${results.length - failed.length}/${results.length} uspesne.`);
if (failed.length === results.length) process.exit(1);
