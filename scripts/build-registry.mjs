#!/usr/bin/env node
/**
 * Stavia evidenciu produktov (data/registry.json) a pripisuje do logu
 * (data/log.jsonl).
 *
 * Evidencia je zaznam pravdy. Konzola je len jej zobrazenie.
 *
 * Stavy schvalenia, datumy nasadenia a baseline metriky sa pri prepocte NIKDY
 * neprepisuju — su to rozhodnutia cloveka, nie odvodene data.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { classify } from './lib/classify.mjs';
import { opportunity } from './lib/ctr-benchmark.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));
const now = new Date(process.env.SEO_ACE_NOW || '2026-08-20T14:00:00Z').toISOString();
const today = now.slice(0, 10);

const readJson = (p, f) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : f);
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

const registryPath = resolve(ROOT, 'data/registry.json');
const logPath = resolve(ROOT, 'data/log.jsonl');

const gsc = readJson(resolve(ROOT, 'data/gsc/pages-latest.json'), { pages: [] });
const prev = readJson(registryPath, { products: [] });
const byId = new Map(prev.products.map((p) => [p.productId, p]));

const events = [];
const logEvent = (ev) => events.push({ at: now, ...ev });
const isSeed = prev.products.length === 0;
const seeded = [];

let added = 0;
let changed = 0;
const products = [];

for (const page of gsc.pages) {
  const url = page.page ?? page.url;
  const c = classify(url);
  if (!c.isGold) continue;

  const opp = opportunity({ impressions: page.impressions, ctr: page.ctr, position: page.position });
  const existing = byId.get(c.productId);
  const gscNow = {
    impressions: page.impressions,
    clicks: page.clicks,
    ctrPercent: +(page.ctr ?? 0).toFixed(2),
    position: +(page.position ?? 0).toFixed(2),
    keywordsCount: page.keywords_count ?? null,
    topKeyword: page.top_keyword ?? null,
    measuredAt: gsc.fetchedAt ?? today,
  };

  if (!existing) {
    added++;
    // Prvotne naplnenie by inak vyrobilo 69 riadkov sumu; suhrn staci jeden.
    if (isSeed) seeded.push(c.productId);
    else logEvent({ kind: 'registry.added', productId: c.productId, url, impressions: page.impressions });
  } else {
    const before = existing.gsc ?? {};
    const moved =
      before.impressions !== gscNow.impressions ||
      before.clicks !== gscNow.clicks ||
      Math.abs((before.position ?? 0) - gscNow.position) >= 0.5;
    if (moved) {
      changed++;
      logEvent({
        kind: 'metrics.changed',
        productId: c.productId,
        from: { impressions: before.impressions, clicks: before.clicks, ctrPercent: before.ctrPercent, position: before.position },
        to: { impressions: gscNow.impressions, clicks: gscNow.clicks, ctrPercent: gscNow.ctrPercent, position: gscNow.position },
      });
    }
  }

  products.push({
    productId: c.productId,
    url,
    slug: c.slug,
    // Nazov odvodeny zo slugu. Skutocny nazov z e-shopu prinesie crawl.
    name: existing?.crawledName ?? c.derivedName,
    nameSource: existing?.crawledName ? 'crawl' : 'slug',
    reference: existing?.reference ?? null, // pole "Kod" z PrestaShopu, potrebuje crawl
    category: cfg.target.categoryName,
    purity: c.purity,
    purityMillesimal: c.purityMillesimal,
    form: c.form,
    motif: c.motif,
    stone: c.stone,
    goldColour: c.goldColour,
    sizeMm: c.sizeMm,
    gsc: gscNow,
    opportunity: opp,
    // Rozhodnutia cloveka — prepocet ich nikdy neprepisuje.
    status: existing?.status ?? 'pending',
    deployedAt: existing?.deployedAt ?? null,
    baseline: existing?.baseline ?? null,
    checks: existing?.checks ?? [],
    note: existing?.note ?? '',
    batchDate: existing?.batchDate ?? null,
    // Diagnostika a obchodne udaje — z crawlu, inak null.
    onPage: existing?.onPage ?? null,
    commerce: existing?.commerce ?? null,
    lastCrawledAt: existing?.lastCrawledAt ?? null,
  });
}

// Batch prislusnost z queue.json — aby evidencia vedela, kedy bol produkt v davke.
const queue = readJson(resolve(ROOT, 'data/queue.json'), { batches: [] });
const inBatch = new Map();
for (const b of queue.batches) for (const it of b.items) inBatch.set(it.productId, b.date);
for (const p of products) if (inBatch.has(p.productId)) p.batchDate = inBatch.get(p.productId);

products.sort((a, b) => b.opportunity.score - a.opportunity.score);

const totals = {
  products: products.length,
  impressions: products.reduce((s, p) => s + p.gsc.impressions, 0),
  clicks: products.reduce((s, p) => s + p.gsc.clicks, 0),
  missedClicks: +products.reduce((s, p) => s + p.opportunity.missedClicks, 0).toFixed(1),
  zeroClickProducts: products.filter((p) => p.gsc.clicks === 0).length,
  crawled: products.filter((p) => p.lastCrawledAt).length,
  approved: products.filter((p) => p.status === 'approved').length,
  rejected: products.filter((p) => p.status === 'rejected').length,
  deployed: products.filter((p) => p.deployedAt).length,
};

writeJson(registryPath, { updatedAt: now, source: gsc.source, dateRange: `${gsc.dateFrom}..${gsc.dateTo}`, totals, products });

if (isSeed) logEvent({ kind: 'registry.seeded', products: seeded.length, source: 'GSC kategoria Zlate nausnice', missedClicks: totals.missedClicks });
logEvent({ kind: 'registry.rebuilt', added, metricsChanged: changed, total: products.length, missedClicks: totals.missedClicks });
mkdirSync(dirname(logPath), { recursive: true });
appendFileSync(logPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

console.log(`Evidencia: ${products.length} produktov (${added} novych, ${changed} so zmenenymi metrikami)`);
console.log(`  impresie ${totals.impressions}, kliky ${totals.clicks}, premrhane ~${totals.missedClicks}`);
console.log(`  s nulou klikov: ${totals.zeroClickProducts} | crawlnutych: ${totals.crawled} | nasadenych: ${totals.deployed}`);
console.log(`Log: +${events.length} zaznamov -> data/log.jsonl`);
