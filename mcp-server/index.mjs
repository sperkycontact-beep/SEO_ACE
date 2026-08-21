#!/usr/bin/env node
/**
 * SEO ACE — lokálny MCP server pre sperky-eshop.sk
 *
 * Beží na tvojom PC a dáva Claude dve veci, ktoré z cloudu nedosiahne:
 *   1. crawl e-shopu (cloudová session má doménu blokovanú egress proxy),
 *   2. priamy Search Console prístup pod tvojím Google účtom.
 *
 * Spustenie:  node mcp-server/index.mjs
 * Registrácia: claude mcp add seo-ace -- node /absolutna/cesta/mcp-server/index.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './src/rpc.mjs';
import * as gsc from './src/gsc.mjs';
import { parseProduct } from '../scripts/lib/parse-product.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));

const UA = 'SEO-ACE/1.0 (owner-operated SEO audit; +https://github.com/sperkycontact-beep/seo_ace)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function get(url, { asText = true } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'sk-SK,sk;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} pri ${url}`);
  return { body: asText ? await res.text() : res, finalUrl: res.url, status: res.status };
}

const absolute = (pathOrUrl) =>
  /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : cfg.site.baseUrl + (pathOrUrl.startsWith('/') ? '' : '/') + pathOrUrl;

/** Product links off a PrestaShop category listing, in listing order. */
function categoryProducts(html, baseUrl) {
  const found = new Map();
  const re = /href\s*=\s*["']([^"']*\/\d+-[^"']+\.html)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let abs;
    try {
      abs = new URL(m[1], baseUrl).href.split('#')[0].split('?')[0];
    } catch {
      continue;
    }
    if (!found.has(abs)) found.set(abs, { url: abs, productId: (abs.match(/\/(\d+)-/) || [, null])[1] });
  }
  return [...found.values()];
}

const tools = [
  {
    name: 'shop_reachable',
    description:
      'Overí, či je e-shop z tohto počítača dostupný, a vráti HTTP stav a hlavičky. Použi ako prvý krok pri diagnostike.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
    async handler({ url }) {
      const target = absolute(url ?? '/');
      const started = Date.now();
      const { status, finalUrl, body } = await get(target);
      return {
        ok: true,
        requested: target,
        finalUrl,
        status,
        elapsedMs: Date.now() - started,
        bytes: body.length,
        isPrestashop: /prestashop/i.test(body),
      };
    },
  },
  {
    name: 'crawl_product',
    description:
      'Načíta produktovú stránku a vráti kompletný SEO rozbor: title, meta description, H1/H2, popisy, obrázky s alt textami, JSON-LD Product, interné odkazy a zoznam nájdených problémov.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Plná URL alebo cesta, napr. /40226-zlate-nausnice-14k-zlato-zatocene-kruhy.html' },
        save: { type: 'boolean', description: 'Uložiť výsledok do data/products/<dátum>/ (predvolene true)' },
      },
      required: ['url'],
    },
    async handler({ url, save = true }) {
      const target = absolute(url);
      const { body, finalUrl, status } = await get(target);
      const parsed = parseProduct(body, finalUrl);
      parsed.kind = 'product';
      parsed.httpStatus = status;
      if (save) {
        const dir = resolve(ROOT, 'data/products', today());
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          resolve(dir, `${parsed.productId ?? parsed.slug ?? 'unknown'}.json`),
          JSON.stringify(parsed, null, 2) + '\n'
        );
      }
      return parsed;
    },
  },
  {
    name: 'crawl_category',
    description:
      'Vylistuje produkty v kategórii (predvolene Zlaté náušnice, ID 77) a vráti ich URL v poradí výpisu. Voliteľne prejde aj stránkovanie.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Cesta kategórie, predvolene z konfigurácie' },
        pages: { type: 'integer', description: 'Počet strán stránkovania (predvolene 1, max 10)' },
      },
    },
    async handler({ path, pages = 1 }) {
      const base = absolute(path ?? cfg.target.categoryPath);
      const limit = Math.min(Math.max(pages, 1), 10);
      const all = new Map();
      let categoryMeta = null;
      for (let p = 1; p <= limit; p++) {
        const url = p === 1 ? base : `${base}?page=${p}`;
        const { body, finalUrl } = await get(url);
        if (p === 1) {
          const parsed = parseProduct(body, finalUrl);
          categoryMeta = {
            title: parsed.current.title,
            metaDescription: parsed.current.metaDescription,
            h1: parsed.current.h1,
            diagnostics: parsed.diagnostics,
          };
        }
        for (const prod of categoryProducts(body, finalUrl)) all.set(prod.url, prod);
        if (p < limit) await sleep(1200);
      }
      return { category: base, categoryMeta, productCount: all.size, products: [...all.values()] };
    },
  },
  {
    name: 'crawl_batch',
    description:
      'Načíta všetkých 5 produktov z dnešnej dávky v data/queue.json (alebo zo zadaného zoznamu URL) a uloží rozbory. Toto je hlavný denný nástroj.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'Voliteľný vlastný zoznam URL' },
        date: { type: 'string', description: 'Dátum dávky YYYY-MM-DD' },
      },
    },
    async handler({ urls, date }) {
      const d = date ?? today();
      let targets = urls;
      if (!targets) {
        const qp = resolve(ROOT, 'data/queue.json');
        if (!existsSync(qp)) throw new Error('data/queue.json neexistuje — najprv spusť select-batch.mjs.');
        const q = JSON.parse(readFileSync(qp, 'utf8'));
        const batch = q.batches.find((b) => b.date === d) ?? q.batches.at(-1);
        if (!batch) throw new Error('V queue.json nie je žiadna dávka.');
        targets = batch.items.map((i) => i.url);
      }
      const dir = resolve(ROOT, 'data/products', d);
      mkdirSync(dir, { recursive: true });
      const results = [];
      for (const url of targets) {
        try {
          const { body, finalUrl, status } = await get(absolute(url));
          const parsed = parseProduct(body, finalUrl);
          parsed.kind = 'product';
          parsed.httpStatus = status;
          writeFileSync(
            resolve(dir, `${parsed.productId ?? 'unknown'}.json`),
            JSON.stringify(parsed, null, 2) + '\n'
          );
          results.push({
            url,
            ok: true,
            productId: parsed.productId,
            title: parsed.current.title,
            titleLength: parsed.current.titleLength,
            metaDescriptionLength: parsed.current.metaDescriptionLength,
            longDescriptionWords: parsed.current.longDescriptionWords,
            imagesMissingAlt: parsed.current.imagesMissingAlt,
            issues: parsed.diagnostics.length,
          });
        } catch (err) {
          results.push({ url, ok: false, error: String(err.message ?? err) });
        }
        await sleep(1500);
      }
      return { date: d, savedTo: `data/products/${d}/`, results };
    },
  },
  {
    name: 'gsc_login',
    description:
      'Otvorí v prehliadači prihlásenie do Google Search Console a uloží token do ~/.seo-ace/. Stačí raz. Vyžaduje ~/.seo-ace/gsc-client.json s OAuth klientom typu Desktop app.',
    inputSchema: { type: 'object', properties: { port: { type: 'integer' } } },
    handler: ({ port }) => gsc.authorize({ port }),
  },
  {
    name: 'gsc_status',
    description: 'Povie, či je Search Console pripojená, a vylistuje vlastnosti (properties), ku ktorým má účet prístup.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      if (!gsc.isAuthorized())
        return { authorized: false, hint: 'Spusť gsc_login.', tokenPath: gsc.TOKEN_PATH, clientPath: gsc.CLIENT_PATH };
      return { authorized: true, ...(await gsc.listSites()) };
    },
  },
  {
    name: 'gsc_queries_for_page',
    description:
      'Vráti reálne vyhľadávacie dopyty pre konkrétnu URL zo Search Console (kliky, impresie, CTR, pozícia). Toto je najpresnejší podklad pre nový title a meta description.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'Presná URL stránky' },
        days: { type: 'integer', description: 'Okno v dňoch, predvolene 90' },
        rowLimit: { type: 'integer' },
      },
      required: ['page'],
    },
    handler: ({ page, days = 90, rowLimit = 250 }) =>
      gsc.searchAnalytics({
        siteUrl: cfg.dataSources.gsc.propertyUrl,
        startDate: daysAgo(days + 3),
        endDate: daysAgo(3),
        dimensions: ['query'],
        page: absolute(page),
        rowLimit,
      }),
  },
  {
    name: 'gsc_inspect',
    description:
      'URL Inspection API — či je URL indexovaná, ktorý kanonický odkaz Google zvolil, kedy ju naposledy prešiel a či nájdené štruktúrované dáta prešli validáciou. Použi po nasadení zmien.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    handler: ({ url }) =>
      gsc.inspectUrl({ siteUrl: cfg.dataSources.gsc.propertyUrl, inspectionUrl: absolute(url) }),
  },
  {
    name: 'queue_add',
    description:
      'Prida jednu alebo viac URL do frontu na spracovanie (data/url-queue.json). Prijima len URL z vlastnej domeny. Nespracuje ich — na to je queue_process.',
    inputSchema: {
      type: 'object',
      properties: { urls: { type: 'array', items: { type: 'string' }, description: 'URL alebo cesty' } },
      required: ['urls'],
    },
    handler({ urls }) {
      const qp = resolve(ROOT, 'data/url-queue.json');
      const q = existsSync(qp) ? JSON.parse(readFileSync(qp, 'utf8')) : { items: [] };
      const host = cfg.site.canonicalHost.replace(/^www\./, '');
      const added = [];
      const rejected = [];
      for (const u of urls) {
        let ok = false;
        try {
          ok = new URL(absolute(u)).host.replace(/^www\./, '') === host;
        } catch {
          ok = false;
        }
        if (!ok) {
          rejected.push(u);
          continue;
        }
        if (!q.items.some((i) => i.url === u && i.status === 'pending')) {
          q.items.push({ url: u, addedAt: new Date().toISOString(), status: 'pending', result: null });
          added.push(u);
        }
      }
      q.updatedAt = new Date().toISOString();
      writeFileSync(qp, JSON.stringify(q, null, 2) + '\n');
      return { added: added.length, rejected, pending: q.items.filter((i) => i.status === 'pending').length };
    },
  },
  {
    name: 'queue_process',
    description:
      'Nacita vsetky cakajuce URL z frontu, urobi diagnostiku a zapise vysledky. Toto je nastroj za pokynom "spracuj front".',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const qp = resolve(ROOT, 'data/url-queue.json');
      const q = existsSync(qp) ? JSON.parse(readFileSync(qp, 'utf8')) : { items: [] };
      const pending = q.items.filter((i) => i.status === 'pending');
      if (!pending.length) return { processed: 0, note: 'Front je prazdny.' };
      const out = [];
      for (const item of pending) {
        try {
          const { body, finalUrl, status } = await get(absolute(item.url));
          const parsed = parseProduct(body, finalUrl);
          const errors = parsed.diagnostics.filter((d) => d.level === 'error').length;
          const warns = parsed.diagnostics.filter((d) => d.level === 'warn').length;
          item.status = 'done';
          item.processedAt = new Date().toISOString();
          item.httpStatus = status;
          item.productId = parsed.productId;
          item.reference = parsed.current.jsonLd.product?.sku ?? null;
          item.result = `${errors} chyb, ${warns} upozorneni`;
          item.diagnostics = parsed.diagnostics;
          const dir = resolve(ROOT, 'data/products', today());
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            resolve(dir, `${parsed.productId ?? 'page'}-${(parsed.slug ?? 'index').slice(0, 40)}.json`),
            JSON.stringify(parsed, null, 2) + '\n'
          );
          out.push({ url: item.url, ok: true, errors, warnings: warns, reference: item.reference });
        } catch (err) {
          item.status = 'error';
          item.processedAt = new Date().toISOString();
          item.result = String(err.message ?? err);
          out.push({ url: item.url, ok: false, error: item.result });
        }
        await sleep(1500);
      }
      q.updatedAt = new Date().toISOString();
      writeFileSync(qp, JSON.stringify(q, null, 2) + '\n');
      return { processed: out.length, results: out };
    },
  },
  {
    name: 'read_batch_data',
    description: 'Prečíta uložené rozbory produktov pre daný dátum, aby ich Claude mohol použiť bez opätovného crawlu.',
    inputSchema: { type: 'object', properties: { date: { type: 'string' } } },
    handler({ date }) {
      const dir = resolve(ROOT, 'data/products', date ?? today());
      if (!existsSync(dir)) return { date: date ?? today(), files: [], note: 'Pre tento dátum nič nie je.' };
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      return {
        date: date ?? today(),
        files,
        data: files.map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'))),
      };
    },
  },
];

serve({
  name: 'seo-ace',
  version: '1.0.0',
  tools,
  instructions:
    'Lokálny mostík pre SEO workflow na sperky-eshop.sk. Crawl e-shopu a Search Console dáta. ' +
    'Postup pri dennej dávke: shop_reachable → crawl_batch → gsc_queries_for_page pre každý produkt. ' +
    'Po nasadení zmien over výsledok cez gsc_inspect. Server nikdy nezapisuje do e-shopu.',
});
