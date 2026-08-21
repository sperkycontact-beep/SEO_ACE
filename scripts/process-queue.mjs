#!/usr/bin/env node
/**
 * Spracuje front URL: nacita stranku, urobi diagnostiku, zapise vysledok.
 *
 * Bezi tam, kde je web dostupny — v GitHub Actions alebo na lokalnom MCP serveri.
 * Cloudova Claude session ma domeny blokovane egress proxy, preto tam nebezi.
 *
 * Pouzitie:
 *   node scripts/process-queue.mjs                      # spracuje pending z data/url-queue.json
 *   node scripts/process-queue.mjs /77-zlate-nausnice   # spracuje zadane URL a prida ich do frontu
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseProduct } from './lib/parse-product.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));
const qPath = resolve(ROOT, 'data/url-queue.json');
const logPath = resolve(ROOT, 'data/log.jsonl');
const now = new Date().toISOString();
const UA = 'SEO-ACE/1.0 (+https://github.com/sperkycontact-beep/seo_ace; owner-operated SEO audit)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const q = existsSync(qPath) ? JSON.parse(readFileSync(qPath, 'utf8')) : { items: [] };
const host = cfg.site.canonicalHost;

const absolute = (u) => (/^https?:\/\//i.test(u) ? u : cfg.site.baseUrl + (u.startsWith('/') ? '' : '/') + u);

/** Prijima len vlastnu domenu — front nie je nastroj na crawlovanie cudzich webov. */
function accept(u) {
  try {
    return new URL(absolute(u)).host.replace(/^www\./, '') === host.replace(/^www\./, '');
  } catch {
    return false;
  }
}

// URL z argumentov sa pridaju do frontu ako pending.
for (const arg of process.argv.slice(2)) {
  if (!accept(arg)) {
    console.error(`Odmietnute (nie je to ${host}): ${arg}`);
    continue;
  }
  if (!q.items.some((i) => i.url === arg && i.status === 'pending')) {
    q.items.push({ url: arg, addedAt: now, status: 'pending', result: null });
  }
}

const pending = q.items.filter((i) => i.status === 'pending');
if (!pending.length) {
  console.log('Front je prazdny — nic na spracovanie.');
  process.exit(0);
}

const events = [];
console.log(`Front: ${pending.length} URL na spracovanie\n`);

for (const item of pending) {
  const target = absolute(item.url);
  process.stdout.write(`  ${target} ... `);
  if (!accept(item.url)) {
    item.status = 'error';
    item.result = `Odmietnute: prijimam len URL z ${host}`;
    item.processedAt = new Date().toISOString();
    console.log('ODMIETNUTE');
    continue;
  }
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'sk-SK,sk;q=0.9' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const parsed = parseProduct(html, res.url);

    const errors = parsed.diagnostics.filter((d) => d.level === 'error');
    const warns = parsed.diagnostics.filter((d) => d.level === 'warn');
    item.status = 'done';
    item.processedAt = new Date().toISOString();
    item.httpStatus = res.status;
    item.finalUrl = res.url;
    item.productId = parsed.productId;
    item.reference = parsed.current.jsonLd.product?.sku ?? null;
    item.onPage = {
      title: parsed.current.title,
      titleLength: parsed.current.titleLength,
      metaDescriptionLength: parsed.current.metaDescriptionLength,
      h1Count: parsed.current.h1Count,
      words: parsed.current.longDescriptionWords,
      images: parsed.current.images.length,
      imagesMissingAlt: parsed.current.imagesMissingAlt,
      hasProductSchema: parsed.current.jsonLd.hasProduct,
      internalLinks: parsed.current.internalLinks.length,
    };
    item.commerce = parsed.current.jsonLd.product
      ? {
          price: parsed.current.jsonLd.product.price,
          currency: parsed.current.jsonLd.product.priceCurrency,
          availability: (parsed.current.jsonLd.product.availability ?? '').replace('https://schema.org/', ''),
          weight: parsed.current.jsonLd.product.weight,
        }
      : null;
    item.result = `${errors.length} chýb, ${warns.length} upozornení${item.reference ? ` · kód ${item.reference}` : ''}`;
    item.diagnostics = parsed.diagnostics;

    // Plny rozbor si odkladame, aby sa dal pouzit pri pisani SEO bez dalsieho requestu.
    const dir = resolve(ROOT, 'data/products', now.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, `${parsed.productId ?? 'page'}-${(parsed.slug ?? 'index').slice(0, 40)}.json`),
      JSON.stringify(parsed, null, 2) + '\n'
    );

    console.log(`OK — ${item.result}`);
    events.push({ at: item.processedAt, kind: 'queue.processed', url: item.url, errors: errors.length, warnings: warns.length, reference: item.reference });
  } catch (err) {
    item.status = 'error';
    item.processedAt = new Date().toISOString();
    item.result = String(err.message ?? err);
    console.log(`CHYBA: ${item.result}`);
    events.push({ at: item.processedAt, kind: 'queue.error', url: item.url, error: item.result });
  }
  await sleep(1500); // ohlad na e-shop
}

q.updatedAt = new Date().toISOString();
writeFileSync(qPath, JSON.stringify(q, null, 2) + '\n');
if (events.length) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, events.map((x) => JSON.stringify(x)).join('\n') + '\n');
}

const done = q.items.filter((i) => i.status === 'done').length;
const bad = q.items.filter((i) => i.status === 'error').length;
console.log(`\nHotovo: ${done} spracovanych, ${bad} s chybou. Front ulozeny do data/url-queue.json`);
