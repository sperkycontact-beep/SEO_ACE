#!/usr/bin/env node
/**
 * Picks the next N products for the daily SEO batch.
 *
 * Input:  data/gsc/pages-latest.json  (written by the Claude run from Ahrefs GSC)
 *         data/queue.json             (history of already-processed URLs)
 * Output: data/queue.json             (today's batch appended, cooldown respected)
 *
 * Selection = highest opportunity score (impressions x CTR gap vs the site's own
 * position curve), restricted to real product pages in the target category.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { opportunity } from './lib/ctr-benchmark.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));
const P = cfg.prioritisation;

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

const pagesPath = resolve(ROOT, 'data/gsc/pages-latest.json');
const queuePath = resolve(ROOT, 'data/queue.json');

const snapshot = readJson(pagesPath, { pages: [] });
const pages = snapshot.pages ?? [];

// A stale snapshot silently picks yesterday's winners forever. Fail loudly instead.
const maxAge = P.maxSnapshotAgeDays ?? 7;
if (snapshot.fetchedAt) {
  const ageDays = (Date.now() - Date.parse(snapshot.fetchedAt)) / 86400000;
  if (ageDays > maxAge) {
    console.error(
      `GSC snapshot je stary ${ageDays.toFixed(1)} dni (limit ${maxAge}). ` +
        `Obnov data/gsc/pages-latest.json cez Ahrefs gsc-pages, alebo zvys prioritisation.maxSnapshotAgeDays.`
    );
    process.exit(3);
  }
  console.log(`GSC snapshot: ${snapshot.fetchedAt} (${ageDays.toFixed(1)} dni stary)\n`);
} else {
  console.error('VAROVANIE: GSC snapshot nema pole fetchedAt — vek sa neda overit.');
}
const queue = readJson(queuePath, { history: [], batches: [] });

const today = process.env.SEO_ACE_DATE || new Date().toISOString().slice(0, 10);

// Cooldown history excludes today's own batch: re-running the selector for a date
// must reproduce that date's batch, not skip past it as "already done".
const done = new Map();
for (const b of queue.batches) {
  if (b.date === today) continue;
  for (const item of b.items) done.set(item.url, b.date);
}
const cooldownMs = P.cooldownDays * 86400000;

function isEligible(p) {
  const url = p.page ?? p.url;
  if (!url) return false;
  if (P.requireHtmlProductUrl && !/\/\d+-[^/]+\.html$/.test(url)) return false;
  if (P.excludeUrlPatterns.some((pat) => url.includes(pat))) return false;
  if ((p.impressions ?? 0) < P.minImpressions) return false;
  if ((p.position ?? 999) > P.maxPosition) return false;
  const lastDone = done.get(url);
  if (lastDone && Date.now() - Date.parse(lastDone) < cooldownMs) return false;
  return true;
}

const scored = pages
  .filter(isEligible)
  .map((p) => {
    const url = p.page ?? p.url;
    const opp = opportunity({ impressions: p.impressions, ctr: p.ctr, position: p.position });
    return {
      url,
      productId: (url.match(/\/(\d+)-/) || [, null])[1],
      slug: (url.match(/\/\d+-([^/]+?)\.html/) || [, null])[1],
      impressions: p.impressions,
      clicks: p.clicks,
      position: +(p.position ?? 0).toFixed(2),
      keywordsCount: p.keywords_count ?? null,
      topKeyword: p.top_keyword ?? null,
      ...opp,
    };
  })
  .sort((a, b) => b.score - a.score);

const n = Number(process.env.SEO_ACE_BATCH_SIZE || cfg.target.productsPerDay);
const batch = scored.slice(0, n);

if (!batch.length) {
  console.error('Ziadne opravnene produkty — skontroluj data/gsc/pages-latest.json.');
  process.exit(2);
}

queue.batches = queue.batches.filter((b) => b.date !== today);
queue.batches.push({
  date: today,
  strategy: P.strategy,
  candidatePool: scored.length,
  items: batch,
});
queue.batches.sort((a, b) => a.date.localeCompare(b.date));
queue.updatedAt = new Date().toISOString();
queue.backlog = scored.slice(n, n + 25);
writeJson(queuePath, queue);

console.log(`Davka ${today} — ${batch.length} z ${scored.length} kandidatov:`);
for (const [i, b] of batch.entries()) {
  console.log(
    `  ${i + 1}. ${b.url}\n     imp ${b.impressions} | CTR ${b.actualCtrPercent}% vs ocakavane ${b.expectedCtrPercent}% | poz ${b.position} | premrhane kliky ~${b.missedClicks}`
  );
}
