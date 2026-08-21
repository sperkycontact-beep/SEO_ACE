#!/usr/bin/env node
/**
 * Generuje ovladaciu konzolu (Artifact HTML) z evidencie, logu, frontu a navrhov.
 *
 * Konzola je LIVE DOKUMENT. Preto:
 *  - zdielany stav (stavy schvalenia, datumy nasadenia, poznamky, front, nastavenia)
 *    je napisany ako realne HTML prvky a handlery menia DOM priamo,
 *  - nikdy sa zdielane markup nerenderuje zo JS objektu,
 *  - per-viewer veci (zalozky, filtre, hladanie, vyber riadkov) su na data-local-*
 *    atributoch alebo v artifact-local, takze neprekrikuju ostatnych,
 *  - ziadne <select> ani <textarea> — ich hodnoty sa neukladaju.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const date = process.argv[2] ?? '2026-08-20';
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));
const doc = JSON.parse(readFileSync(resolve(ROOT, `data/proposals/${date}.json`), 'utf8'));
const reg = JSON.parse(readFileSync(resolve(ROOT, 'data/registry.json'), 'utf8'));
const logPath = resolve(ROOT, 'data/log.jsonl');
const log = existsSync(logPath)
  ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const queuePath = resolve(ROOT, 'data/url-queue.json');
const urlQueue = existsSync(queuePath) ? JSON.parse(readFileSync(queuePath, 'utf8')) : { items: [] };

const e = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = (n) => new Intl.NumberFormat('sk-SK').format(n ?? 0);
const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
const SK = ['januára','februára','marca','apríla','mája','júna','júla','augusta','septembra','októbra','novembra','decembra'];
const pretty = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${+d}. ${SK[+m - 1]} ${y}`; };
const clock = (iso) => iso.slice(11, 16);

/* ── merac dlzky ───────────────────────────────────────────────────────────── */
function meter(actual, min, max) {
  const lo = Math.round(min * 0.6), hi = Math.round(max * 1.45);
  const pos = Math.min(100, Math.max(0, ((actual - lo) / (hi - lo)) * 100));
  const bandL = ((min - lo) / (hi - lo)) * 100, bandW = ((max - min) / (hi - lo)) * 100;
  const ok = actual >= min && actual <= max;
  return `<span class="meter" role="img" aria-label="${actual} znakov, povolené ${min} až ${max}">
      <span class="meter-band" style="left:${bandL.toFixed(1)}%;width:${bandW.toFixed(1)}%"></span>
      <span class="meter-pin${ok ? '' : ' bad'}" style="left:${pos.toFixed(1)}%"></span>
    </span><span class="meter-num${ok ? '' : ' bad'}">${actual}<span class="meter-lim">/${min}–${max}</span></span>`;
}
const copyBtn = (id) => `<button type="button" class="copy" data-copy="${id}">Kopírovať</button>`;

/* ── stav pipeline ─────────────────────────────────────────────────────────── */
const STATUS = [
  ['GSC cez Ahrefs', 'good', 'Funkčné', 'Projekt 9364794. Endpointy nespotrebúvajú API units.'],
  ['Ahrefs platené', 'warn', 'Vyčerpané', `401 648 z 400 000 units. Objemy a difficulty po ${pretty(cfg.dataSources.ahrefs.paidEndpointsResumeAfter)}.`],
  ['Crawl e-shopu', 'bad', 'Blokovaný', 'Cloudová session má domény blokované egress proxy.'],
  ['GitHub Actions', 'bad', 'Nespustené', 'Workflow nie je na default branchi, nemožno ho dispatchnúť.'],
  ['Site Audit', 'bad', '2 / 100', 'Crawl z 1. 8. 2026: chyby na 9 792 z 10 019 URL.'],
  ['Lokálny MCP', 'good', '9 nástrojov', 'Selftest 9/9. Po gsc_login pridá URL Inspection.'],
];

/* ── zalozka: davka ────────────────────────────────────────────────────────── */
function productCard(p) {
  const q = p.secondaryQueries.map((s) =>
    `<tr><td>${e(s.q)}</td><td class="num">${nf(s.imp)}</td><td class="num">${s.clicks}</td>
      <td class="num${s.ctr < 0.5 ? ' bad' : ''}">${s.ctr.toFixed(2)}&nbsp;%</td><td class="num">${s.pos.toFixed(2)}</td></tr>`).join('');
  const alts = p.proposed.imageAlts.map((a, i) =>
    `<li><span class="alt-n">${i + 1}</span><span class="alt-t" id="p${p.productId}-alt${i}">${e(a)}</span>${copyBtn(`p${p.productId}-alt${i}`)}</li>`).join('');
  const links = p.proposed.internalLinks.map((l) =>
    `<tr><td><code>${e(l.path)}</code></td><td>${e(l.anchor)}</td><td class="why">${e(l.why)}</td></tr>`).join('');
  const verify = p.needsVerification.map((v) => `<li>${e(v)}</li>`).join('');
  const paras = p.proposed.longDescription.split(/\n\n+/).map((t) => `<p>${e(t)}</p>`).join('');
  const purity = /14k|585/.test(p.url) ? '14k' : /9k|375/.test(p.url) ? '9k' : '—';
  const S = cfg.seoScope;

  return `
      <details class="card" id="p-${p.productId}" data-status="pending">
        <summary>
          <span class="rank">${p.rank}</span>
          <span class="sum-main">
            <span class="sum-title">${e(p.proposed.h1)}</span>
            <span class="sum-meta"><code>${e(p.productId)}</code><span class="stamp">${purity}</span>
              <span class="sum-num">${nf(p.gsc.impressions)} impresií</span>
              <span class="sum-num">CTR ${p.gsc.ctrPercent.toFixed(2)}&nbsp;%</span>
              <span class="sum-num">poz. ${p.gsc.position.toFixed(2)}</span></span>
          </span>
          <span class="sum-right">
            <span class="missed"><b>${p.gsc.missedClicks.toFixed(0)}</b><i>premrhaných</i></span>
            <span class="pill status-pill">Čaká</span>
          </span>
        </summary>
        <div class="card-body">
          <div class="diag"><h4>Diagnóza</h4><p>${e(p.diagnosis)}</p></div>
          <h4>Čo Google reálne zobrazuje na túto URL</h4>
          <div class="twrap"><table class="data"><thead><tr><th>Dopyt</th><th class="num">Impresie</th><th class="num">Kliky</th><th class="num">CTR</th><th class="num">Pozícia</th></tr></thead><tbody>${q}</tbody></table></div>
          <h4>Návrh</h4>
          <dl class="proposal">
            <dt>Meta title</dt><dd><span class="val" id="p${p.productId}-title">${e(p.proposed.metaTitle)}</span>${copyBtn(`p${p.productId}-title`)}<span class="mrow">${meter(p.proposed.metaTitle.length, S.metaTitle.minChars, S.metaTitle.maxChars)}</span></dd>
            <dt>H1</dt><dd><span class="val" id="p${p.productId}-h1">${e(p.proposed.h1)}</span>${copyBtn(`p${p.productId}-h1`)}<span class="mrow">${meter(p.proposed.h1.length, 20, S.h1.maxChars)}</span></dd>
            <dt>Meta description</dt><dd><span class="val" id="p${p.productId}-desc">${e(p.proposed.metaDescription)}</span>${copyBtn(`p${p.productId}-desc`)}<span class="mrow">${meter(p.proposed.metaDescription.length, S.metaDescription.minChars, S.metaDescription.maxChars)}</span></dd>
            <dt>Krátky popis</dt><dd><span class="val" id="p${p.productId}-short">${e(p.proposed.shortDescription)}</span>${copyBtn(`p${p.productId}-short`)}<span class="mrow"><span class="wc">${words(p.proposed.shortDescription)} slov</span></span></dd>
          </dl>
          <h4>Dlhý popis <span class="wc">${words(p.proposed.longDescription)} slov</span> ${copyBtn(`p${p.productId}-long`)}</h4>
          <div class="longdesc" id="p${p.productId}-long">${paras}</div>
          <h4>Alt texty obrázkov</h4><ol class="alts">${alts}</ol>
          <h4>JSON-LD <span class="wc">bez aggregateRating — hodnotenia sa nevymýšľajú</span> ${copyBtn(`p${p.productId}-ld`)}</h4>
          <pre class="code" id="p${p.productId}-ld">${e(JSON.stringify(p.proposed.jsonLd, null, 2))}</pre>
          <h4>Interné odkazy</h4>
          <div class="twrap"><table class="data"><thead><tr><th>Cieľ</th><th>Anchor text</th><th>Prečo</th></tr></thead><tbody>${links}</tbody></table></div>
          <div class="verify"><h4>Treba overiť crawlom</h4><ul>${verify}</ul></div>
          <div class="finding"><h4>Štrukturálne zistenie</h4><p>${e(p.structuralFinding)}</p></div>
          <div class="actions">
            <button type="button" class="btn approve" data-act="approved">Schváliť</button>
            <button type="button" class="btn reject" data-act="rejected">Zamietnuť</button>
            <button type="button" class="btn reset" data-act="pending">Vrátiť na čaká</button>
          </div>
        </div>
      </details>`;
}

/* ── zalozka: evidencia ────────────────────────────────────────────────────── */
function registryRow(p, i) {
  const g = p.gsc, o = p.opportunity;
  const ctrClass = g.ctrPercent === 0 ? ' bad' : g.ctrPercent < 1 ? ' warn' : '';
  const onPage = p.onPage
    ? `${p.onPage.titleLength} / ${p.onPage.metaDescriptionLength} znakov · ${p.onPage.h1Count} H1 · ${p.onPage.words} slov · ${p.onPage.imagesMissingAlt} bez alt`
    : 'čaká na crawl';
  const commerce = p.commerce
    ? `${p.commerce.price} ${p.commerce.currency} · ${p.commerce.availability}`
    : 'čaká na crawl';
  return `
        <tbody class="rrow" data-status="${p.status}" data-purity="${p.purity ?? ''}" data-form="${e(p.form)}"
               data-imp="${g.impressions}" data-ctr="${g.ctrPercent}" data-pos="${g.position}"
               data-deployed="${p.deployedAt ? '1' : '0'}"
               data-hay="${e((p.productId + ' ' + p.name + ' ' + p.slug + ' ' + (p.reference ?? '')).toLowerCase())}">
          <tr class="rmain">
            <td class="c-sel"><input type="checkbox" artifact-local class="sel" aria-label="Označiť ${e(p.productId)}"></td>
            <td class="c-id"><code>${e(p.productId)}</code></td>
            <td class="c-ref">${p.reference ? `<code>${e(p.reference)}</code>` : '<span class="pend">—</span>'}</td>
            <td class="c-name"><span class="rname">${e(p.name)}</span>
              <span class="rtags"><span class="stamp">${e(p.purity ?? '?')}</span><span class="tag">${e(p.form)}</span>${p.motif ? `<span class="tag">${e(p.motif)}</span>` : ''}${p.stone ? `<span class="tag">${e(p.stone)}</span>` : ''}</span></td>
            <td class="num">${nf(g.impressions)}</td>
            <td class="num">${g.clicks}</td>
            <td class="num${ctrClass}">${g.ctrPercent.toFixed(2)}</td>
            <td class="num">${g.position.toFixed(1)}</td>
            <td class="num missed-c">${o.missedClicks.toFixed(0)}</td>
            <td class="c-status"><span class="pill status-pill">${p.status === 'approved' ? 'Schválené' : p.status === 'rejected' ? 'Zamietnuté' : 'Čaká'}</span></td>
            <td class="c-dep"><span class="depdate">${p.deployedAt ? pretty(p.deployedAt) : '—'}</span></td>
            <td class="c-exp"><button type="button" class="expand" aria-label="Rozbaliť detail">+</button></td>
          </tr>
          <tr class="rdetail">
            <td colspan="12">
              <div class="rdet">
                <dl class="kv">
                  <dt>URL</dt><dd><a href="${e(p.url)}" target="_blank" rel="noopener">${e(p.url.replace('https://sperky-eshop.sk', ''))}</a></dd>
                  <dt>Najsilnejší dopyt</dt><dd>${e(g.topKeyword ?? '—')} <span class="wc">${nf(g.keywordsCount)} dopytov celkom</span></dd>
                  <dt>Očakávané CTR</dt><dd>${o.expectedCtrPercent.toFixed(2)} % na pozícii ${g.position.toFixed(1)} — rozdiel ${o.ctrGapPp.toFixed(2)} p. b.</dd>
                  <dt>Farba zlata</dt><dd>${e(p.goldColour)}${p.sizeMm ? ` · ${p.sizeMm} mm` : ''}</dd>
                  <dt>Názov</dt><dd>${p.nameSource === 'crawl' ? 'z e-shopu' : 'odvodený z URL, čaká na crawl'}</dd>
                  <dt>On-page</dt><dd class="${p.onPage ? '' : 'pend'}">${e(onPage)}</dd>
                  <dt>Cena a dostupnosť</dt><dd class="${p.commerce ? '' : 'pend'}">${e(commerce)}</dd>
                  <dt>V dávke</dt><dd>${p.batchDate ? pretty(p.batchDate) : 'ešte nebol'}</dd>
                </dl>
                <label class="notewrap"><span>Poznámka</span>
                  <input type="text" class="note" value="${e(p.note)}" placeholder="Vlastná poznámka k produktu">
                </label>
              </div>
            </td>
          </tr>
        </tbody>`;
}

/* ── zalozka: log ──────────────────────────────────────────────────────────── */
const KIND = {
  'pipeline.run': ['Beh pipeline', 'assay'],
  'registry.seeded': ['Evidencia naplnená', 'assay'],
  'registry.rebuilt': ['Evidencia prepočítaná', 'assay'],
  'registry.added': ['Nový produkt', 'assay'],
  'metrics.changed': ['Zmena metrík', 'brass'],
  'seo.written': ['SEO napísané', 'brass'],
  validation: ['Validácia', 'brass'],
  'crawl.blocked': ['Crawl blokovaný', 'bad'],
  'crawl.done': ['Crawl hotový', 'good'],
  delivery: ['Doručenie', 'good'],
  'cron.created': ['Cron založený', 'good'],
  'queue.added': ['Front: nová URL', 'brass'],
  'queue.processed': ['Front: spracované', 'good'],
  'status.changed': ['Zmena stavu', 'brass'],
  deployed: ['Nasadené', 'good'],
};

function logRow(ev) {
  const [label, tone] = KIND[ev.kind] ?? [ev.kind, 'assay'];
  const detail = Object.entries(ev)
    .filter(([k]) => !['at', 'kind'].includes(k))
    .map(([k, v]) => `<span class="lk">${e(k)}</span> ${e(typeof v === 'object' ? JSON.stringify(v) : v)}`)
    .join(' · ');
  return `<tr><td class="c-time"><span class="ldate">${pretty(ev.at)}</span><span class="ltime">${clock(ev.at)}</span></td>
      <td class="c-kind"><span class="kind ${tone}">${e(label)}</span></td>
      <td class="c-detail">${detail}</td></tr>`;
}

/* ── zalozka: front URL ────────────────────────────────────────────────────── */
function queueRow(q) {
  return `<tr data-qstatus="${e(q.status)}">
      <td class="c-time">${pretty(q.addedAt)}</td>
      <td class="c-qurl"><span class="qurl">${e(q.url)}</span></td>
      <td class="c-qstatus"><span class="pill ${q.status === 'done' ? 'good' : q.status === 'error' ? 'bad' : 'warn'}">${q.status === 'done' ? 'Spracované' : q.status === 'error' ? 'Chyba' : 'Čaká'}</span></td>
      <td class="c-qres"><span class="qres">${e(q.result ?? '—')}</span></td>
    </tr>`;
}

const RADIO = {
  priorita: [['impressions_x_ctr_gap', 'Impresie × rozdiel CTR', true], ['position_edge', 'Hranica prvej strany', false], ['missing_meta', 'Chýbajúce meta tagy', false], ['bestsellers', 'Bestsellery a marža', false]],
  ton: [['selling_accessible', 'Predávajúci a prístupný, vykanie', true], ['luxury_restrained', 'Luxusný a zdržanlivý', false], ['technical', 'Vecný a technický', false], ['match_existing', 'Zachovať existujúci štýl', false]],
};
const radioRow = (name, opts) => opts.map(([val, label, on]) =>
  `<label class="opt"><input type="radio" name="${name}" value="${val}"${on ? ' checked' : ''}><span>${e(label)}</span></label>`).join('');
const CHANNELS = [['repo', 'Commit do repozitára'], ['artifact', 'HTML konzola'], ['slack', 'Slack #seo-daily-sperky'], ['drive', 'Google Drive'], ['pr', 'GitHub Pull Request']];

const T = reg.totals;
const pendingCount = T.products - T.approved - T.rejected;

writeFileSync(resolve(ROOT, 'reports/console.html'), `<title>Zlaté náušnice — SEO konzola</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --brass:#b8912f; --brass-lo:#8d6f24; --assay:#0d8b91; --assay-lo:#0a6c71;
  --ground:#f5f7f7; --surface:#ffffff; --surface2:#eef2f2; --surface3:#e6ecec;
  --line:#d9e2e1; --line-hi:#c3d1d0;
  --ink:#0f1716; --ink2:#425855; --dim:#6b8280;
  --good:#2f7d52; --warn:#a8791f; --bad:#a94238;
  --good-bg:#e7f2eb; --warn-bg:#f7efdd; --bad-bg:#f7e6e4;
  --shadow:0 1px 2px rgba(15,23,22,.05), 0 8px 24px -16px rgba(15,23,22,.18);
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --body:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --disp:"Fraunces",Georgia,"Times New Roman",serif;
  --topbar:118px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --brass:#d4ae56; --brass-lo:#a8862f; --assay:#2fb3ba; --assay-lo:#17888e;
  --ground:#0b1211; --surface:#111a19; --surface2:#16211f; --surface3:#1c2826;
  --line:#233130; --line-hi:#324442;
  --ink:#e7f0ef; --ink2:#a6bfbc; --dim:#7a9391;
  --good:#4fa871; --warn:#cfa03c; --bad:#cf6157;
  --good-bg:#12261b; --warn-bg:#2a2113; --bad-bg:#2b1614;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.7);
}}
:root[data-theme="dark"]{
  --brass:#d4ae56; --brass-lo:#a8862f; --assay:#2fb3ba; --assay-lo:#17888e;
  --ground:#0b1211; --surface:#111a19; --surface2:#16211f; --surface3:#1c2826;
  --line:#233130; --line-hi:#324442;
  --ink:#e7f0ef; --ink2:#a6bfbc; --dim:#7a9391;
  --good:#4fa871; --warn:#cfa03c; --bad:#cf6157;
  --good-bg:#12261b; --warn-bg:#2a2113; --bad-bg:#2b1614;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.7);
}
*{box-sizing:border-box}
body{margin:0; background:var(--ground); color:var(--ink); font-family:var(--body);
  font-size:15px; line-height:1.55; font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:var(--disp); text-wrap:balance; margin:0}
code,pre,.num,.stamp,.meter-num,.ltime{font-family:var(--mono)}
a{color:var(--assay)}
:focus-visible{outline:2px solid var(--brass); outline-offset:2px; border-radius:3px}
button{font-family:inherit}

/* ── trvaly horny panel ── */
.top{position:sticky; top:0; z-index:30; background:var(--surface); border-bottom:1px solid var(--line)}
.top-in{max-width:1240px; margin:0 auto; padding:12px 22px 0}
.brand{display:flex; align-items:baseline; justify-content:space-between; gap:20px; flex-wrap:wrap}
.brand h1{font-size:19px; font-weight:600; letter-spacing:-.01em}
.brand h1 span{color:var(--dim); font-weight:400; font-size:13px; font-family:var(--body); margin-left:9px}
.hnums{display:flex; gap:22px; font-size:12px}
.hnum b{font-family:var(--mono); font-size:17px; font-weight:600; display:block; line-height:1.1}
.hnum i{font-style:normal; color:var(--dim); font-size:10.5px; letter-spacing:.02em}
.hnum.risk b{color:var(--bad)} .hnum.wait b{color:var(--brass)}
.dots{display:flex; gap:5px; align-items:center; margin:9px 0 0; flex-wrap:wrap}
.dot{display:flex; align-items:center; gap:5px; font-size:10.5px; color:var(--dim); padding:2px 7px 2px 5px;
  border:1px solid var(--line); border-radius:999px; white-space:nowrap}
.dot i{width:6px; height:6px; border-radius:50%; flex:0 0 6px}
.dot.good i{background:var(--good)} .dot.warn i{background:var(--warn)} .dot.bad i{background:var(--bad)}
nav.tabs{display:flex; gap:2px; margin-top:10px; overflow-x:auto}
nav.tabs button{border:none; background:transparent; color:var(--dim); font-size:13px; font-weight:600;
  padding:9px 15px; border-bottom:2px solid transparent; cursor:pointer; white-space:nowrap;
  transition:color .14s, border-color .14s}
nav.tabs button:hover{color:var(--ink2)}
nav.tabs button b{font-family:var(--mono); font-size:11px; font-weight:500; color:var(--dim); margin-left:6px}
#app[data-local-tab="davka"] nav.tabs [data-tab="davka"],
#app[data-local-tab="evidencia"] nav.tabs [data-tab="evidencia"],
#app[data-local-tab="log"] nav.tabs [data-tab="log"],
#app[data-local-tab="front"] nav.tabs [data-tab="front"],
#app[data-local-tab="nastavenia"] nav.tabs [data-tab="nastavenia"]{color:var(--ink); border-bottom-color:var(--brass)}

.wrap{max-width:1240px; margin:0 auto; padding:26px 22px 80px}
.panel{display:none}
#app[data-local-tab="davka"] #t-davka,
#app[data-local-tab="evidencia"] #t-evidencia,
#app[data-local-tab="log"] #t-log,
#app[data-local-tab="front"] #t-front,
#app[data-local-tab="nastavenia"] #t-nastavenia{display:block}

.shead{margin-bottom:18px}
.shead h2{font-size:23px; font-weight:600; letter-spacing:-.012em}
.shead p{margin:5px 0 0; color:var(--dim); font-size:13.5px; max-width:74ch}
.pill{font-family:var(--mono); font-size:10.5px; font-weight:500; letter-spacing:.05em; text-transform:uppercase;
  padding:3px 8px; border-radius:3px; white-space:nowrap; border:1px solid transparent}
.pill.good{background:var(--good-bg); color:var(--good); border-color:color-mix(in srgb,var(--good) 26%,transparent)}
.pill.warn{background:var(--warn-bg); color:var(--warn); border-color:color-mix(in srgb,var(--warn) 26%,transparent)}
.pill.bad{background:var(--bad-bg); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 26%,transparent)}
.stamp{font-family:var(--mono); font-size:9.5px; font-weight:600; letter-spacing:.05em; padding:1px 5px; border-radius:2px;
  border:1px solid var(--brass); color:var(--brass); background:color-mix(in srgb,var(--brass) 9%,transparent)}
.tag{font-size:10px; padding:1px 6px; border-radius:2px; background:var(--surface3); color:var(--dim)}
.wc{font-family:var(--mono); font-size:10.5px; font-weight:400; letter-spacing:.02em; text-transform:none; color:var(--dim)}
.pend{color:var(--dim); font-style:italic}

/* ── karty davky ── */
.cards{display:flex; flex-direction:column; gap:10px}
.card{border:1px solid var(--line); border-radius:4px; background:var(--surface); box-shadow:var(--shadow)}
.card[data-status="approved"]{border-left:3px solid var(--good)}
.card[data-status="rejected"]{border-left:3px solid var(--bad); opacity:.66}
.card[data-status="pending"]{border-left:3px solid var(--brass)}
.card > summary{display:flex; gap:14px; align-items:center; padding:14px 17px; cursor:pointer; list-style:none}
.card > summary::-webkit-details-marker{display:none}
.card > summary:hover{background:var(--surface2)}
.rank{font-family:var(--mono); font-size:12px; font-weight:600; color:var(--brass-lo); width:24px; height:24px;
  flex:0 0 24px; display:grid; place-items:center; border:1px solid var(--line-hi); border-radius:2px}
.sum-main{flex:1 1 auto; min-width:0}
.sum-title{display:block; font-family:var(--disp); font-size:16px; font-weight:600; line-height:1.3}
.sum-meta{display:flex; gap:11px; flex-wrap:wrap; margin-top:4px; font-size:11.5px; color:var(--dim); align-items:center}
.sum-right{display:flex; align-items:center; gap:14px; flex:0 0 auto}
.missed{text-align:right}
.missed b{display:block; font-family:var(--mono); font-size:19px; font-weight:600; color:var(--bad); line-height:1}
.missed i{display:block; font-style:normal; font-size:10px; color:var(--dim); margin-top:3px}
.status-pill{background:var(--warn-bg); color:var(--warn); border:1px solid color-mix(in srgb,var(--warn) 26%,transparent)}
[data-status="approved"] .status-pill{background:var(--good-bg); color:var(--good); border-color:color-mix(in srgb,var(--good) 26%,transparent)}
[data-status="rejected"] .status-pill{background:var(--bad-bg); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 26%,transparent)}
.card-body{padding:4px 17px 20px; border-top:1px solid var(--line)}
.card-body h4{font-family:var(--body); font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
  color:var(--dim); margin:24px 0 9px; display:flex; align-items:center; gap:10px; flex-wrap:wrap}
.diag{margin-top:18px; padding:13px 15px; background:var(--surface2); border-radius:3px; border-left:2px solid var(--assay)}
.diag h4{margin:0 0 6px} .diag p{margin:0; font-size:14px; line-height:1.6; color:var(--ink2)}
dl.proposal{margin:0; display:grid; grid-template-columns:minmax(120px,150px) 1fr}
dl.proposal dt{font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--dim); padding:11px 0; border-top:1px solid var(--line)}
dl.proposal dd{margin:0; padding:11px 0; border-top:1px solid var(--line); display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center}
dl.proposal dt:first-of-type,dl.proposal dd:first-of-type{border-top:none}
.val{font-size:14.5px; line-height:1.5; flex:1 1 320px; min-width:0}
.mrow{display:flex; align-items:center; gap:8px; flex:0 0 auto}
.meter{position:relative; display:block; width:110px; height:5px; background:var(--surface2); border:1px solid var(--line); border-radius:3px}
.meter-band{position:absolute; top:0; bottom:0; background:color-mix(in srgb,var(--good) 32%,transparent)}
.meter-pin{position:absolute; top:-3px; width:2px; height:11px; background:var(--assay); border-radius:1px}
.meter-pin.bad{background:var(--bad)}
.meter-num{font-size:11.5px; color:var(--good); font-weight:500} .meter-num.bad{color:var(--bad)}
.meter-lim{color:var(--dim); font-weight:400}
.longdesc{border:1px solid var(--line); border-radius:3px; padding:14px 16px; background:var(--surface2)}
.longdesc p{margin:0 0 11px; font-size:14px; line-height:1.62; max-width:66ch} .longdesc p:last-child{margin:0}
ol.alts{margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:1px; background:var(--line);
  border:1px solid var(--line); border-radius:3px; overflow:hidden}
ol.alts li{background:var(--surface); padding:8px 11px; display:flex; gap:11px; align-items:center; font-size:13.5px}
.alt-n{font-family:var(--mono); font-size:11px; color:var(--dim); flex:0 0 16px}
.alt-t{flex:1 1 auto; min-width:0}
pre.code{margin:0; overflow-x:auto; background:var(--surface2); border:1px solid var(--line); border-radius:3px;
  padding:13px 15px; font-size:12px; line-height:1.55; color:var(--ink2)}
.verify,.finding{margin-top:22px; padding:13px 15px; border-radius:3px; font-size:13.5px}
.verify{background:var(--warn-bg); border-left:2px solid var(--warn)}
.verify h4,.finding h4{margin:0 0 7px}
.verify ul{margin:0; padding-left:19px; color:var(--ink2)} .verify li{margin-bottom:3px}
.finding{background:var(--surface2); border-left:2px solid var(--brass)}
.finding p{margin:0; color:var(--ink2); line-height:1.6}
.actions{display:flex; gap:9px; margin-top:24px; padding-top:17px; border-top:1px solid var(--line); flex-wrap:wrap}
.btn{font-size:13px; font-weight:600; padding:8px 15px; border-radius:3px; border:1px solid var(--line-hi);
  background:var(--surface); color:var(--ink); cursor:pointer; transition:background .14s,border-color .14s,color .14s}
.btn:hover{background:var(--surface2)}
.btn.approve{border-color:color-mix(in srgb,var(--good) 42%,transparent); color:var(--good)}
.btn.approve:hover{background:var(--good-bg)}
.btn.reject{border-color:color-mix(in srgb,var(--bad) 42%,transparent); color:var(--bad)}
.btn.reject:hover{background:var(--bad-bg)}
.btn.reset{color:var(--dim)}
.btn.primary{background:var(--assay); border-color:var(--assay); color:#fff}
.btn.primary:hover{background:var(--assay-lo); border-color:var(--assay-lo)}
.btn:disabled{opacity:.45; cursor:not-allowed}
.copy{font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; padding:3px 8px; border-radius:2px;
  border:1px solid var(--line-hi); background:transparent; color:var(--dim); cursor:pointer; flex:0 0 auto}
.copy:hover{color:var(--assay); border-color:var(--assay)}

/* ── ovladacia lista tabuliek ── */
.ctrl{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; padding:11px 13px;
  background:var(--surface); border:1px solid var(--line); border-radius:4px}
.ctrl .sep{width:1px; height:22px; background:var(--line); margin:0 3px}
.ctrl label.chip{display:flex; align-items:center; gap:6px; font-size:12.5px; cursor:pointer; padding:4px 9px;
  border:1px solid var(--line-hi); border-radius:999px; color:var(--ink2)}
.ctrl label.chip input{margin:0; accent-color:var(--assay); width:14px; height:14px}
input[type=text],input[type=number],input[type=search]{font-family:var(--mono); font-size:13px; padding:6px 9px;
  border:1px solid var(--line-hi); border-radius:3px; background:var(--surface2); color:var(--ink); max-width:100%}
input[type=search]{min-width:210px; font-family:var(--body)}
input[type=number]{width:76px}
.ctrl .lbl{font-size:11.5px; color:var(--dim)}
.shown{font-family:var(--mono); font-size:12px; color:var(--ink2); margin-left:auto}
.shown b{color:var(--ink)}
.bulk{display:flex; gap:7px; align-items:center; flex-wrap:wrap; padding:10px 13px; margin-bottom:12px;
  background:var(--surface2); border:1px solid var(--line); border-radius:4px; font-size:12.5px}
.bulk .n{font-family:var(--mono); color:var(--ink)}
.bulk button{font-size:12px; padding:5px 11px; border-radius:3px; border:1px solid var(--line-hi);
  background:var(--surface); color:var(--ink2); cursor:pointer}
.bulk button:hover{color:var(--ink); border-color:var(--assay)}

/* ── tabulky ── */
.tblwrap{overflow-x:auto; border:1px solid var(--line); border-radius:4px; background:var(--surface)}
table.grid{width:100%; border-collapse:collapse; font-size:13px; min-width:1000px}
table.grid thead th{position:sticky; top:var(--topbar); z-index:10; background:var(--surface3);
  text-align:left; font-family:var(--body); font-size:10px; font-weight:700; letter-spacing:.07em; text-transform:uppercase;
  color:var(--dim); padding:9px 10px; border-bottom:1px solid var(--line-hi); white-space:nowrap}
table.grid thead th.num{text-align:right}
table.grid td{padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:middle}
table.grid .num{text-align:right; font-family:var(--mono); white-space:nowrap}
table.grid .num.bad{color:var(--bad)} table.grid .num.warn{color:var(--warn)}
.missed-c{font-weight:600; color:var(--bad)}
tbody.rrow[data-status="approved"] .rmain{background:color-mix(in srgb,var(--good) 5%,transparent)}
tbody.rrow[data-status="rejected"] .rmain{opacity:.55}
tbody.rrow[data-local-hidden="1"]{display:none}
.rmain:hover{background:var(--surface2)}
.c-sel{width:34px} .c-id{width:64px} .c-ref{width:92px} .c-exp{width:34px}
.c-status{width:96px} .c-dep{width:104px}
.rname{display:block; line-height:1.35}
.rtags{display:flex; gap:5px; margin-top:3px; flex-wrap:wrap; align-items:center}
.expand{width:22px; height:22px; border:1px solid var(--line-hi); border-radius:2px; background:transparent;
  color:var(--dim); cursor:pointer; font-family:var(--mono); font-size:13px; line-height:1; padding:0}
.expand:hover{color:var(--assay); border-color:var(--assay)}
.rdetail{display:none} tbody.rrow[data-local-open="1"] .rdetail{display:table-row}
tbody.rrow[data-local-open="1"] .expand{color:var(--assay); border-color:var(--assay)}
.rdet{padding:6px 4px 12px; background:var(--surface2); border-radius:3px; margin:4px 0 6px}
dl.kv{display:grid; grid-template-columns:minmax(120px,160px) 1fr; gap:4px 16px; margin:0 0 12px; padding:10px 12px 0; font-size:12.5px}
dl.kv dt{color:var(--dim); font-weight:600} dl.kv dd{margin:0; color:var(--ink2)}
.notewrap{display:flex; gap:10px; align-items:center; padding:0 12px 10px; font-size:12px; color:var(--dim)}
.notewrap input{flex:1 1 auto; font-family:var(--body)}
.c-time{white-space:nowrap; width:132px}
.ldate{display:block; font-size:12px} .ltime{display:block; font-size:10.5px; color:var(--dim)}
.c-kind{width:172px}
.kind{font-size:10.5px; font-weight:600; letter-spacing:.03em; padding:2px 7px; border-radius:2px; white-space:nowrap}
.kind.assay{background:color-mix(in srgb,var(--assay) 12%,transparent); color:var(--assay)}
.kind.brass{background:color-mix(in srgb,var(--brass) 14%,transparent); color:var(--brass-lo)}
.kind.good{background:var(--good-bg); color:var(--good)}
.kind.bad{background:var(--bad-bg); color:var(--bad)}
.c-detail{font-size:12px; color:var(--ink2); line-height:1.5}
.lk{font-family:var(--mono); font-size:10.5px; color:var(--dim)}
.qurl{font-family:var(--mono); font-size:12px; word-break:break-all}
.c-qstatus{width:112px} .c-qres{width:300px}
.qres{font-size:12px; color:var(--ink2)}

/* ── nastavenia ── */
.settings{border:1px solid var(--line); border-radius:4px; background:var(--surface); overflow:hidden}
.srow{display:grid; grid-template-columns:minmax(190px,250px) 1fr; gap:18px; padding:15px 18px;
  border-bottom:1px solid var(--line); align-items:start}
.srow:last-child{border-bottom:none}
.srow > .k{font-size:13px; font-weight:600; padding-top:3px}
.srow .k small{display:block; font-weight:400; color:var(--dim); font-size:12px; margin-top:2px; line-height:1.4}
.opts{display:flex; flex-wrap:wrap; gap:8px 18px}
.opt{display:flex; align-items:center; gap:7px; font-size:13.5px; cursor:pointer}
.opt input{accent-color:var(--assay); width:15px; height:15px; margin:0; cursor:pointer}
.guard{background:var(--warn-bg); border-left:2px solid var(--warn)} .guard .k small{color:var(--warn)}

/* ── zistenia ── */
.finds{display:flex; flex-direction:column; gap:10px; margin-top:30px}
.find{border:1px solid var(--line); border-left:3px solid var(--bad); border-radius:4px; background:var(--surface); padding:16px 18px}
.find h3{font-size:16px; font-weight:600; margin-bottom:7px}
.find p{margin:0 0 9px; font-size:14px; color:var(--ink2); line-height:1.6; max-width:74ch} .find p:last-child{margin:0}
.find .tagl{font-family:var(--mono); font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:var(--bad); display:block; margin-bottom:5px}
.find.med{border-left-color:var(--warn)} .find.med .tagl{color:var(--warn)}

.addrow{display:flex; gap:9px; align-items:flex-end; flex-wrap:wrap; padding:15px 17px; background:var(--surface);
  border:1px solid var(--line); border-radius:4px; margin-bottom:14px}
.addrow .fl{display:flex; flex-direction:column; gap:5px; flex:1 1 380px}
.addrow .fl span{font-size:11.5px; color:var(--dim); font-weight:600}
.addrow input{font-family:var(--mono)}
.hint{font-size:12px; color:var(--dim); margin:10px 0 0; max-width:74ch}
.synced{font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; padding:3px 8px; border-radius:2px;
  border:1px solid var(--line-hi); color:var(--dim); white-space:nowrap}
.synced[data-on="1"]{color:var(--good); border-color:color-mix(in srgb,var(--good) 36%,transparent)}
.synced[data-on="0"]{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 36%,transparent)}
footer{margin-top:44px; padding-top:20px; border-top:1px solid var(--line); color:var(--dim); font-size:12.5px}
footer dl{display:grid; grid-template-columns:minmax(140px,190px) 1fr; gap:6px 18px; margin:0}
footer dt{font-weight:600; color:var(--ink2)} footer dd{margin:0}
.toast{position:fixed; left:50%; bottom:26px; transform:translateX(-50%); background:var(--ink); color:var(--ground);
  font-size:13px; font-weight:500; padding:9px 17px; border-radius:3px; z-index:99; box-shadow:var(--shadow)}
[data-local-density="cozy"] table.grid td{padding:12px 10px}
@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}
@media (max-width:760px){
  :root{--topbar:150px}
  dl.proposal,.srow,footer dl,dl.kv{grid-template-columns:1fr; gap:4px}
  dl.proposal dd{border-top:none; padding-top:0}
  .card > summary{flex-wrap:wrap}
  .sum-right{width:100%; justify-content:space-between; padding-left:38px}
  .hnums{gap:14px}
}
</style>

<div id="app" data-local-tab="davka" data-local-density="compact">
<div class="top"><div class="top-in">
  <div class="brand">
    <h1>Zlaté náušnice<span>SEO konzola · ${e(cfg.site.domain)}</span></h1>
    <div class="hnums">
      <span class="hnum"><b>${nf(T.products)}</b><i>v evidencii</i></span>
      <span class="hnum risk"><b>${nf(Math.round(T.missedClicks))}</b><i>premrhaných klikov</i></span>
      <span class="hnum wait"><b>${nf(pendingCount)}</b><i>čaká na schválenie</i></span>
      <span class="hnum"><b>${nf(T.zeroClickProducts)}</b><i>s nulou klikov</i></span>
    </div>
  </div>
  <div class="dots">
    ${STATUS.map(([l, s, v]) => `<span class="dot ${s}"><i></i>${e(l)}: ${e(v)}</span>`).join('\n    ')}
  </div>
  <nav class="tabs">
    <button type="button" data-tab="davka">Dávka<b>${doc.products.length}</b></button>
    <button type="button" data-tab="evidencia">Evidencia<b>${T.products}</b></button>
    <button type="button" data-tab="log">Log<b>${log.length}</b></button>
    <button type="button" data-tab="front">Front URL<b>${urlQueue.items.length}</b></button>
    <button type="button" data-tab="nastavenia">Nastavenia</button>
  </nav>
</div></div>

<div class="wrap">

<section class="panel" id="t-davka">
  <div class="shead">
    <h2>Dávka ${doc.batch} — ${pretty(doc.date)}</h2>
    <p>${nf(doc.totals.impressions)} impresií, ${doc.totals.clicks} klikov, priemerné CTR ${doc.totals.avgCtrPercent.toFixed(2)} %.
      Chýba ${doc.totals.missedClicks.toFixed(0)} klikov. Každý návrh prešiel validátorom podľa playbooku.</p>
  </div>
  <div class="cards">${doc.products.map(productCard).join('\n')}
  </div>
  <div class="finds">
    <div class="find">
      <span class="tagl">Kanibalizácia · vysoká priorita</span>
      <h3>Tri URL súťažia o jeden dopyt s intenciou akcie</h3>
      <p>Dopyt <code>akcia na zlate nausnice</code> má 454 impresií a rozdeľuje sa medzi kategóriu
        <code>/77-zlate-nausnice</code> (pozícia 2,42), produkt 32023 (1,77) a produkt 32102 (1,84).
        Všetky tri majú CTR pod 0,5 %.</p>
      <p>Kto takto hľadá, chce výpis zliav a dostane jeden produkt. Stránka <code>/110-vypredaj-skladu</code>
        pritom na dopyte <code>zlate nausnice vypredaj</code> drží CTR 2,14 % — päťnásobok. Dopyt patrí tam.</p>
    </div>
    <div class="find">
      <span class="tagl">Podozrenie na technický problém</span>
      <h3>Nula klikov pri 692 impresiách — a nie je to jediný prípad</h3>
      <p>Produkt 36995 má 15 dopytov, pozície od 1,21 do 16,7, a ani jeden klik. V celej evidencii má
        <b>${T.zeroClickProducts} zo ${T.products} produktov nulu klikov</b>, pričom mnohé rankujú v top 10.</p>
      <p>Pri jednom produkte je to podozrenie, pri ${T.zeroClickProducts} je to vzorec. Pred prepisovaním textov
        overiť dostupnosť a rendering snippetov — ak sú vypredané, správna oprava nie je nový title.</p>
    </div>
    <div class="find med">
      <span class="tagl">Indexácia</span>
      <h3>Parametrické URL kanibalizujú kategóriu</h3>
      <p>Stránky ako <code>/77-zlate-nausnice?p=1&amp;ob=2&amp;ow=1&amp;os=0&amp;pp=5-1035</code> majú reálne
        impresie (102). Filtrované varianty tej istej kategórie patria do pravidiel <code>robots.txt</code>
        alebo canonical, nie do indexu.</p>
    </div>
    <div class="find med">
      <span class="tagl">Systémový dlh</span>
      <h3>Site Audit: health score 2 zo 100</h3>
      <p>Chyby na 9 792 z 10 019 URL. Denná päťka je liečba symptómov; duplicitné meta tagy na tisícoch URL
        sa opravujú v šablóne PrestaShopu. Oddelená úloha s vlastným rozsahom.</p>
    </div>
  </div>
</section>

<section class="panel" id="t-evidencia">
  <div class="shead">
    <h2>Evidencia produktov</h2>
    <p>Celá kategória Zlaté náušnice, ${T.products} produktov s impresiami v Search Console. Napĺňa sa
      pri každom behu. Kód produktu, on-page diagnostika a ceny prídu z crawlu — dovtedy sú prázdne,
      nie vymyslené.</p>
  </div>
  <artifact-local>
    <div class="ctrl">
      <input type="search" id="q" placeholder="Hľadať názov, kód alebo URL" aria-label="Hľadať v evidencii">
      <span class="sep"></span>
      <label class="chip"><input type="checkbox" class="f-status" value="pending" checked><span>Čaká</span></label>
      <label class="chip"><input type="checkbox" class="f-status" value="approved" checked><span>Schválené</span></label>
      <label class="chip"><input type="checkbox" class="f-status" value="rejected" checked><span>Zamietnuté</span></label>
      <span class="sep"></span>
      <label class="chip"><input type="checkbox" id="f-undeployed"><span>Len nenasadené</span></label>
      <span class="sep"></span>
      <label class="chip"><input type="checkbox" class="f-purity" value="14k" checked><span>14k</span></label>
      <label class="chip"><input type="checkbox" class="f-purity" value="9k" checked><span>9k</span></label>
      <span class="sep"></span>
      <span class="lbl">min. impresie</span><input type="number" id="f-imp" value="0" min="0" step="10">
      <span class="lbl">max. CTR %</span><input type="number" id="f-ctr" value="100" min="0" step="0.5">
      <span class="shown">Zobrazených <b id="shown">${T.products}</b> z ${T.products}</span>
    </div>
    <div class="bulk">
      <span>Označených <span class="n" id="seln">0</span></span>
      <span class="sep"></span>
      <button type="button" data-bulk="approved">Schváliť</button>
      <button type="button" data-bulk="rejected">Zamietnuť</button>
      <button type="button" data-bulk="pending">Vrátiť na čaká</button>
      <button type="button" data-bulk="deploy">Označiť ako nasadené</button>
      <button type="button" data-bulk="queue">Zaradiť do frontu</button>
      <span class="sep"></span>
      <button type="button" data-bulk="csv-sel">Export označených</button>
      <button type="button" data-bulk="csv-all">Export všetkých</button>
      <span class="synced" id="synced" data-on="0">stav ukladania sa zisťuje</span>
    </div>
  </artifact-local>
  <div class="tblwrap">
    <table class="grid" id="reg">
      <thead><tr>
        <th class="c-sel"></th><th>ID</th><th>Kód</th><th>Produkt</th>
        <th class="num">Impresie</th><th class="num">Kliky</th><th class="num">CTR&nbsp;%</th><th class="num">Poz.</th>
        <th class="num">Premrhané</th><th>Stav</th><th>Nasadené</th><th></th>
      </tr></thead>
      ${reg.products.map(registryRow).join('\n')}
    </table>
  </div>
  <p class="hint">Premrhané kliky = impresie × rozdiel medzi CTR, ktoré e-shop na danej pozícii bežne dosahuje,
    a tým, ktoré stránka reálne má. Krivka je z <code>gsc-ctr-by-position</code> tohto e-shopu, izotonicky vyhladená.</p>
</section>

<section class="panel" id="t-log">
  <div class="shead">
    <h2>Log udalostí</h2>
    <p>Behy pipeline, zásahy do produktov, zmeny metrík a požiadavky z frontu. Zdroj je
      <code>data/log.jsonl</code> v repozitári — každý záznam má commit, takže sa nedá prepísať bez stopy.</p>
  </div>
  <div class="tblwrap">
    <table class="grid" style="min-width:760px">
      <thead><tr><th>Kedy</th><th>Udalosť</th><th>Detail</th></tr></thead>
      <tbody>${log.slice().reverse().map(logRow).join('\n')}</tbody>
    </table>
  </div>
</section>

<section class="panel" id="t-front">
  <div class="shead">
    <h2>Front URL na spracovanie</h2>
    <p>Vlož URL z ${e(cfg.site.domain)} a pridaj ju do frontu. Front sa spracuje, keď to vyžiadaš —
      napíš mi „spracuj front" a každú čakajúcu URL načítam, urobím diagnostiku a doplním dopyty
      zo Search Console.</p>
  </div>
  <artifact-local>
    <div class="addrow">
      <label class="fl"><span>URL stránky</span>
        <input type="text" id="newurl" placeholder="/77-zlate-nausnice alebo celá adresa" autocomplete="off">
      </label>
      <button type="button" class="btn primary" id="addurl">Pridať do frontu</button>
    </div>
  </artifact-local>
  <div class="tblwrap">
    <table class="grid" style="min-width:720px">
      <thead><tr><th>Pridané</th><th>URL</th><th>Stav</th><th>Výsledok</th></tr></thead>
      <tbody id="qbody">${urlQueue.items.length ? urlQueue.items.map(queueRow).join('\n') : ''}</tbody>
    </table>
  </div>
  <p class="hint">Prijímam akúkoľvek stránku na ${e(cfg.site.domain)} — produkt, kategóriu, blog aj statickú stránku.
    Parser rozpozná typ stránky sám. Fetch nerobí prehliadač, robí ho pipeline, takže tvoje PC nemusí byť zapnuté.</p>
</section>

<section class="panel" id="t-nastavenia">
  <div class="shead">
    <h2>Nastavenia</h2>
    <p>Zmeny sa ukladajú do dokumentu a načítam ich pri ďalšom dennom behu. Do e-shopu sa nezapisuje nič.</p>
  </div>
  <div class="settings">
    <div class="srow"><span class="k">Produktov denne<small>Koľko produktov spracovať v jednej dávke</small></span>
      <span><input type="number" name="productsPerDay" min="1" max="20" value="${cfg.target.productsPerDay}"></span></div>
    <div class="srow"><span class="k">Kategória<small>Cesta v e-shope, z ktorej sa vyberá</small></span>
      <span><input type="text" name="categoryPath" value="${e(cfg.target.categoryPath)}" style="width:min(320px,100%)"></span></div>
    <div class="srow"><span class="k">Priorita výberu<small>Podľa čoho sa vyberá päťka na dnes</small></span>
      <span class="opts">${radioRow('priorita', RADIO.priorita)}</span></div>
    <div class="srow"><span class="k">Tón textov<small>Ovplyvňuje každý napísaný popis</small></span>
      <span class="opts">${radioRow('ton', RADIO.ton)}</span></div>
    <div class="srow"><span class="k">Čas denného behu<small>UTC; crawl beží dve hodiny pred generovaním</small></span>
      <span><input type="text" name="runTime" value="05:23" style="width:100px" inputmode="numeric"></span></div>
    <div class="srow"><span class="k">Doručenie reportu<small>Kam poslať dennú dávku</small></span>
      <span class="opts">${CHANNELS.map(([v, l]) => `<label class="opt"><input type="checkbox" name="ch-${v}" checked><span>${e(l)}</span></label>`).join('')}</span></div>
    <div class="srow"><span class="k">Meranie výsledku<small>Kontrola metrík po nasadení zmeny</small></span>
      <span class="opts"><label class="opt"><input type="checkbox" name="check14" checked><span>Po 14 dňoch</span></label>
        <label class="opt"><input type="checkbox" name="check28" checked><span>Po 28 dňoch</span></label></span></div>
    <div class="srow"><span class="k">Ahrefs platené endpointy<small>Objemy a difficulty; zapnúť po ${pretty(cfg.dataSources.ahrefs.paidEndpointsResumeAfter)}</small></span>
      <span class="opts"><label class="opt"><input type="checkbox" name="ahrefsPaid"><span>Zapnuté</span></label></span></div>
    <div class="srow guard"><span class="k">Automatický zápis do e-shopu<small>Zámerne vypnuté. Každá dávka ide na schválenie.</small></span>
      <span class="opts"><label class="opt"><input type="checkbox" name="autoPublish"><span>Povoliť zápis bez schválenia</span></label></span></div>
  </div>
</section>

<footer>
  <dl>
    <dt>Zdroj dopytov</dt><dd>${e(doc.dataSources.gsc)}</dd>
    <dt>Evidencia</dt><dd>data/registry.json — ${T.products} produktov, prepočítané ${pretty(reg.updatedAt)}</dd>
    <dt>Log</dt><dd>data/log.jsonl — ${log.length} záznamov</dd>
    <dt>Ahrefs platené</dt><dd>${e(doc.dataSources.ahrefsPaid)}</dd>
    <dt>Crawl produktov</dt><dd>${e(doc.dataSources.productCrawl)}</dd>
    <dt>Pravidlá písania</dt><dd>docs/SEO_PLAYBOOK.md · validované scripts/validate-seo.mjs</dd>
  </dl>
</footer>
</div>
</div>

<script>
(function () {
  var app = document.getElementById('app');
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 2100);
  }
  function today() {
    var d = new Date(); var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var SK = ['januára','februára','marca','apríla','mája','júna','júla','augusta','septembra','októbra','novembra','decembra'];
  function pretty(iso) { var a = iso.slice(0, 10).split('-'); return (+a[2]) + '. ' + SK[(+a[1]) - 1] + ' ' + a[0]; }

  /* ── zalozky: per-viewer, na data-local-tab ── */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('nav.tabs button[data-tab]');
    if (!t) return;
    app.dataset.localTab = t.dataset.tab;
  });

  /* ── kopirovanie ── */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.copy');
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    var src = document.getElementById(btn.dataset.copy);
    if (!src) return;
    var text = src.tagName === 'PRE' ? src.textContent : src.innerText.trim();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Skopírované'); },
        function () { toast('Kopírovanie zablokoval prehliadač'); });
    } else { toast('Kopírovanie tu nie je dostupné'); }
  });

  /* ── stav karty v davke: menime data-status priamo, aby to bola cast dokumentu ── */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.card .btn[data-act]');
    if (!btn) return;
    var card = btn.closest('.card');
    setStatus(card, btn.dataset.act);
  });

  function setStatus(el, st) {
    el.dataset.status = st;
    var pill = el.querySelector('.status-pill');
    if (pill) pill.textContent = st === 'approved' ? 'Schválené' : st === 'rejected' ? 'Zamietnuté' : 'Čaká';
  }

  /* ── rozbalenie riadku evidencie: per-viewer ── */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('.expand');
    if (!b) return;
    var tb = b.closest('tbody.rrow');
    var open = tb.dataset.localOpen === '1';
    tb.dataset.localOpen = open ? '0' : '1';
    b.textContent = open ? '+' : '\\u2212';
  });

  /* ── filtre: per-viewer, cez data-local-hidden ── */
  var rows = Array.prototype.slice.call(document.querySelectorAll('tbody.rrow'));
  var q = document.getElementById('q');
  var fImp = document.getElementById('f-imp');
  var fCtr = document.getElementById('f-ctr');
  var fUndep = document.getElementById('f-undeployed');
  var shown = document.getElementById('shown');

  function checkedVals(cls) {
    return Array.prototype.slice.call(document.querySelectorAll('.' + cls + ':checked')).map(function (i) { return i.value; });
  }
  function applyFilters() {
    if (!rows.length) return;
    var needle = (q && q.value || '').trim().toLowerCase();
    var st = checkedVals('f-status');
    var pu = checkedVals('f-purity');
    var minImp = Number(fImp && fImp.value || 0);
    var maxCtr = Number(fCtr && fCtr.value || 100);
    var onlyUndep = !!(fUndep && fUndep.checked);
    var n = 0;
    rows.forEach(function (r) {
      var ok = true;
      if (needle && r.dataset.hay.indexOf(needle) === -1) ok = false;
      if (ok && st.indexOf(r.dataset.status) === -1) ok = false;
      if (ok && r.dataset.purity && pu.indexOf(r.dataset.purity) === -1) ok = false;
      if (ok && Number(r.dataset.imp) < minImp) ok = false;
      if (ok && Number(r.dataset.ctr) > maxCtr) ok = false;
      if (ok && onlyUndep && r.dataset.deployed === '1') ok = false;
      r.dataset.localHidden = ok ? '0' : '1';
      if (ok) n++;
    });
    if (shown) shown.textContent = n;
  }
  ['input', 'change'].forEach(function (evt) {
    document.addEventListener(evt, function (ev) {
      if (ev.target.closest('.ctrl')) applyFilters();
      if (ev.target.classList && ev.target.classList.contains('sel')) countSel();
    });
  });
  applyFilters();

  /* ── vyber riadkov: checkboxy su artifact-local, takze vyber je len moj ── */
  function selected() {
    return rows.filter(function (r) {
      var c = r.querySelector('.sel');
      return c && c.checked && r.dataset.localHidden !== '1';
    });
  }
  var selnEl = document.getElementById('seln');
  function countSel() { if (selnEl) selnEl.textContent = selected().length; }
  countSel();

  /* ── hromadne akcie: menia zdielany stav, preto priamo v DOM ── */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-bulk]');
    if (!b) return;
    var act = b.dataset.bulk;
    if (act === 'csv-all') return exportCsv(rows, 'evidencia-vsetky');
    if (act === 'csv-sel') {
      var s = selected();
      if (!s.length) return toast('Najprv označ riadky');
      return exportCsv(s, 'evidencia-oznacene');
    }
    var sel = selected();
    if (!sel.length) return toast('Najprv označ riadky');
    if (act === 'deploy') {
      var d = today();
      sel.forEach(function (r) {
        r.dataset.deployed = '1';
        var el = r.querySelector('.depdate');
        if (el) el.textContent = pretty(d);
      });
      toast(sel.length + ' označených ako nasadené — meranie začína dnes');
    } else if (act === 'queue') {
      sel.forEach(function (r) {
        var link = r.querySelector('.rdet a');
        addQueueRow(link ? link.textContent.trim() : '/' + r.dataset.hay.split(' ')[0], null);
      });
      toast(sel.length + ' zaradených do frontu');
    } else {
      sel.forEach(function (r) { setStatus(r, act); });
      toast(sel.length + ' → ' + (act === 'approved' ? 'schválené' : act === 'rejected' ? 'zamietnuté' : 'čaká'));
    }
    applyFilters(); countSel();
  });

  /* ── front URL: novy riadok vznika gestom, preto sa ulozi ── */
  var qbody = document.getElementById('qbody');
  function addQueueRow(label, productId) {
    var url = productId ? '/' + productId : label;
    var tr = document.createElement('tr');
    tr.dataset.qstatus = 'pending';
    var c1 = document.createElement('td'); c1.className = 'c-time'; c1.textContent = pretty(today());
    var c2 = document.createElement('td'); c2.className = 'c-qurl';
    var s = document.createElement('span'); s.className = 'qurl'; s.textContent = url; c2.appendChild(s);
    var c3 = document.createElement('td'); c3.className = 'c-qstatus';
    var p = document.createElement('span'); p.className = 'pill warn'; p.textContent = 'Čaká'; c3.appendChild(p);
    var c4 = document.createElement('td'); c4.className = 'c-qres';
    var r = document.createElement('span'); r.className = 'qres'; r.textContent = '—'; c4.appendChild(r);
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4);
    qbody.appendChild(tr);
    return tr;
  }
  var addBtn = document.getElementById('addurl');
  var newUrl = document.getElementById('newurl');
  function submitUrl() {
    var v = (newUrl.value || '').trim();
    if (!v) return toast('Vlož URL');
    var host = '${e(cfg.site.domain)}';
    if (/^https?:\\/\\//i.test(v) && v.indexOf(host) === -1) return toast('Prijímam len URL z ' + host);
    if (!/^https?:\\/\\//i.test(v) && v.charAt(0) !== '/') v = '/' + v;
    addQueueRow(v, null);
    newUrl.value = '';
    toast('Pridané do frontu. Napíš mi „spracuj front" a načítam ju.');
  }
  if (addBtn) addBtn.addEventListener('click', submitUrl);
  if (newUrl) newUrl.addEventListener('keydown', function (e2) { if (e2.key === 'Enter') { e2.preventDefault(); submitUrl(); } });

  /* ── CSV: bodkociarka a UTF-8 s BOM, aby sa v slovenskom Exceli otvoril dvojklikom ── */
  var HEAD = ['ID','Kod','Nazov','Rydzost','Tvar','Motiv','Kamen','Impresie','Kliky','CTR %','Pozicia','Premrhane kliky','Stav','Nasadene','Poznamka','URL'];
  function cell(v) {
    var s = v == null ? '' : String(v);
    return /[";\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function rowValues(r) {
    var td = r.querySelectorAll('.rmain td');
    var tags = r.querySelectorAll('.rtags .tag');
    var note = r.querySelector('.note');
    var link = r.querySelector('.rdet a');
    return [
      td[1].textContent.trim(), td[2].textContent.trim().replace('—', ''),
      r.querySelector('.rname').textContent.trim(),
      r.dataset.purity, tags[0] ? tags[0].textContent : '', tags[1] ? tags[1].textContent : '', tags[2] ? tags[2].textContent : '',
      td[4].textContent.trim(), td[5].textContent.trim(), td[6].textContent.trim(), td[7].textContent.trim(), td[8].textContent.trim(),
      r.dataset.status === 'approved' ? 'schvalene' : r.dataset.status === 'rejected' ? 'zamietnute' : 'caka',
      r.dataset.deployed === '1' ? r.querySelector('.depdate').textContent.trim() : '',
      note ? note.value : '',
      link ? 'https://${e(cfg.site.canonicalHost)}' + link.textContent.trim() : '',
    ];
  }
  function exportCsv(list, base) {
    var lines = [HEAD.map(cell).join(';')];
    list.forEach(function (r) { lines.push(rowValues(r).map(cell).join(';')); });
    var csv = '\\uFEFF' + lines.join('\\r\\n') + '\\r\\n';
    var name = base + '-' + today() + '.csv';
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (d) {
        if (!d) return toast('Stiahnutie tu nie je dostupné');
        d.save({ filename: name, data: csv }).then(
          function () { toast(list.length + ' riadkov v ' + name); },
          function (err) { toast('Stiahnutie sa neuskutočnilo' + (err && err.code ? ' (' + err.code + ')' : '')); });
      }, function () { toast('Stiahnutie tu nie je dostupné'); });
    } else { toast('Stiahnutie tu nie je dostupné'); }
  }

  /* ── stav ukladania: hlasime pravdivo ── */
  var syncEl = document.getElementById('synced');
  function setSync(on, label) { if (syncEl) { syncEl.dataset.on = on ? '1' : '0'; syncEl.textContent = label; } }
  document.addEventListener('claude:sync-off', function () { setSync(false, 'ukladanie vypnuté'); });
  document.addEventListener('claude:sync-lost', function () { setSync(false, 'ukladanie sa opakuje'); });
  document.addEventListener('claude:edit', function () { applyFilters(); countSel(); });
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('artifact').then(
      function (a) { setSync(!!a, a ? 'zmeny sa ukladajú' : 'iba na čítanie'); },
      function () { setSync(false, 'iba na čítanie'); });
  } else { setSync(false, 'iba na čítanie'); }
})();
</script>
`);
console.log('Napisane reports/console.html');
