#!/usr/bin/env node
/**
 * Generuje ovladaciu konzolu (Artifact HTML) z validovanych navrhov.
 * Vstup: data/proposals/<datum>.json  +  config/seo-ace.config.json
 * Vystup: reports/console-<datum>.html
 *
 * Konzola je live dokument: nastavenia a stavy schvalenia su realne HTML
 * prvky, ktore viewer meni gestom, takze sa ukladaju samy. Preto sa zdielany
 * obsah pise ako HTML do stranky a handlery menia DOM priamo — nikdy sa
 * nerenderuje zo JS objektu.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));
const doc = JSON.parse(readFileSync(resolve(ROOT, `data/proposals/${date}.json`), 'utf8'));

const e = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = (n) => new Intl.NumberFormat('sk-SK').format(n);
const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

const SK_MONTHS = ['januára','februára','marca','apríla','mája','júna','júla','augusta','septembra','októbra','novembra','decembra'];
const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${+d}. ${SK_MONTHS[+m - 1]} ${y}`;
};

/** Meter showing where a length sits inside its allowed band. */
function meter(actual, min, max) {
  const lo = Math.round(min * 0.6);
  const hi = Math.round(max * 1.45);
  const pos = Math.min(100, Math.max(0, ((actual - lo) / (hi - lo)) * 100));
  const bandL = ((min - lo) / (hi - lo)) * 100;
  const bandW = ((max - min) / (hi - lo)) * 100;
  const ok = actual >= min && actual <= max;
  return `<span class="meter" role="img" aria-label="${actual} znakov, povolené ${min} až ${max}">
      <span class="meter-band" style="left:${bandL.toFixed(1)}%;width:${bandW.toFixed(1)}%"></span>
      <span class="meter-pin${ok ? '' : ' bad'}" style="left:${pos.toFixed(1)}%"></span>
    </span><span class="meter-num${ok ? '' : ' bad'}">${actual}<span class="meter-lim">/${min}–${max}</span></span>`;
}

const copyBtn = (id) =>
  `<button type="button" class="copy" data-copy="${id}" aria-label="Skopírovať">Kopírovať</button>`;

const STATUS = [
  { label: 'GSC cez Ahrefs', state: 'good', value: 'Funkčné',
    detail: 'Projekt 9364794, 626 keywordov. Endpointy nespotrebúvajú API units.' },
  { label: 'Ahrefs platené endpointy', state: 'warn', value: 'Vyčerpané',
    detail: `401 648 z 400 000 units. Objemy a difficulty pribudnú po ${prettyDate(cfg.dataSources.ahrefs.paidEndpointsResumeAfter)}.` },
  { label: 'Crawl e-shopu', state: 'bad', value: 'Blokovaný',
    detail: 'Cloudová session má domény blokované egress proxy. Rieši GitHub Actions alebo lokálny MCP server.' },
  { label: 'GitHub Actions', state: 'bad', value: 'Nespustené',
    detail: 'Workflow nie je na default branchi, preto ho nemožno dispatchnúť. Vyrieši merge tohto branchu.' },
  { label: 'Site Audit', state: 'bad', value: '2 / 100',
    detail: 'Crawl z 1. 8. 2026: 9 792 z 10 019 URL má chyby. Systémový problém mimo tejto dávky.' },
  { label: 'Lokálny MCP server', state: 'good', value: '9 nástrojov',
    detail: 'Selftest prechádza 9/9. Po gsc_login pridá URL Inspection a presné query dáta.' },
];

const RADIO = {
  priorita: [
    ['impressions_x_ctr_gap', 'Impresie × rozdiel CTR', true],
    ['position_edge', 'Na hranici prvej strany', false],
    ['missing_meta', 'Chýbajúce meta tagy', false],
    ['bestsellers', 'Bestsellery a marža', false],
  ],
  ton: [
    ['selling_accessible', 'Predávajúci a prístupný, vykanie', true],
    ['luxury_restrained', 'Luxusný a zdržanlivý', false],
    ['technical', 'Vecný a technický', false],
    ['match_existing', 'Zachovať existujúci štýl', false],
  ],
};

const radioRow = (name, opts) => opts.map(([val, label, on], i) => `
        <label class="opt">
          <input type="radio" name="${name}" value="${val}"${on ? ' checked' : ''}>
          <span>${e(label)}</span>
        </label>`).join('');

const CHANNELS = [
  ['repo', 'Commit do repozitára', true],
  ['artifact', 'HTML konzola (táto stránka)', true],
  ['slack', 'Slack správa', true],
  ['drive', 'Google Drive dokument', true],
  ['pr', 'GitHub Pull Request', true],
];

function productCard(p) {
  const q = p.secondaryQueries
    .map((s) => `<tr><td>${e(s.q)}</td><td class="num">${nf(s.imp)}</td><td class="num">${s.clicks}</td>
        <td class="num${s.ctr < 0.5 ? ' bad' : ''}">${s.ctr.toFixed(2)}&nbsp;%</td><td class="num">${s.pos.toFixed(2)}</td></tr>`)
    .join('');
  const alts = p.proposed.imageAlts
    .map((a, i) => `<li><span class="alt-n">${i + 1}</span><span class="alt-t" id="p${p.productId}-alt${i}">${e(a)}</span>${copyBtn(`p${p.productId}-alt${i}`)}</li>`)
    .join('');
  const links = p.proposed.internalLinks
    .map((l) => `<tr><td><code>${e(l.path)}</code></td><td>${e(l.anchor)}</td><td class="why">${e(l.why)}</td></tr>`)
    .join('');
  const verify = p.needsVerification.map((v) => `<li>${e(v)}</li>`).join('');
  const paras = p.proposed.longDescription
    .split(/\n\n+/)
    .map((t) => `<p>${e(t)}</p>`)
    .join('');
  const purity = /14k|585/.test(p.url) ? (/14k/.test(p.url) ? '14k' : '585') : '—';

  return `
      <details class="card" id="p-${p.productId}" data-status="pending" data-purity="${purity}">
        <summary>
          <span class="rank">${p.rank}</span>
          <span class="sum-main">
            <span class="sum-title">${e(p.proposed.h1)}</span>
            <span class="sum-meta">
              <code>${e(p.productId)}</code>
              <span class="stamp">${purity}</span>
              <span class="sum-num">${nf(p.gsc.impressions)} impresií</span>
              <span class="sum-num">CTR ${p.gsc.ctrPercent.toFixed(2)}&nbsp;%</span>
              <span class="sum-num">poz. ${p.gsc.position.toFixed(2)}</span>
            </span>
          </span>
          <span class="sum-right">
            <span class="missed"><b>${p.gsc.missedClicks.toFixed(0)}</b><i>premrhaných klikov</i></span>
            <span class="pill status-pill">Čaká</span>
          </span>
        </summary>

        <div class="card-body">
          <div class="diag">
            <h4>Diagnóza</h4>
            <p>${e(p.diagnosis)}</p>
          </div>

          <h4>Čo Google reálne zobrazuje na túto URL</h4>
          <div class="twrap">
            <table class="data">
              <thead><tr><th>Dopyt</th><th class="num">Impresie</th><th class="num">Kliky</th><th class="num">CTR</th><th class="num">Pozícia</th></tr></thead>
              <tbody>${q}</tbody>
            </table>
          </div>

          <h4>Návrh</h4>
          <dl class="proposal">
            <dt>Meta title</dt>
            <dd>
              <span class="val" id="p${p.productId}-title">${e(p.proposed.metaTitle)}</span>
              ${copyBtn(`p${p.productId}-title`)}
              <span class="mrow">${meter(p.proposed.metaTitle.length, cfg.seoScope.metaTitle.minChars, cfg.seoScope.metaTitle.maxChars)}</span>
            </dd>
            <dt>H1</dt>
            <dd>
              <span class="val" id="p${p.productId}-h1">${e(p.proposed.h1)}</span>
              ${copyBtn(`p${p.productId}-h1`)}
              <span class="mrow">${meter(p.proposed.h1.length, 20, cfg.seoScope.h1.maxChars)}</span>
            </dd>
            <dt>Meta description</dt>
            <dd>
              <span class="val" id="p${p.productId}-desc">${e(p.proposed.metaDescription)}</span>
              ${copyBtn(`p${p.productId}-desc`)}
              <span class="mrow">${meter(p.proposed.metaDescription.length, cfg.seoScope.metaDescription.minChars, cfg.seoScope.metaDescription.maxChars)}</span>
            </dd>
            <dt>Krátky popis</dt>
            <dd>
              <span class="val" id="p${p.productId}-short">${e(p.proposed.shortDescription)}</span>
              ${copyBtn(`p${p.productId}-short`)}
              <span class="mrow"><span class="wc">${words(p.proposed.shortDescription)} slov</span></span>
            </dd>
          </dl>

          <h4>Dlhý popis <span class="wc">${words(p.proposed.longDescription)} slov</span> ${copyBtn(`p${p.productId}-long`)}</h4>
          <div class="longdesc" id="p${p.productId}-long">${paras}</div>

          <h4>Alt texty obrázkov</h4>
          <ol class="alts">${alts}</ol>

          <h4>JSON-LD <span class="wc">bez aggregateRating — hodnotenia sa nevymýšľajú</span> ${copyBtn(`p${p.productId}-ld`)}</h4>
          <pre class="code" id="p${p.productId}-ld">${e(JSON.stringify(p.proposed.jsonLd, null, 2))}</pre>

          <h4>Interné odkazy</h4>
          <div class="twrap">
            <table class="data">
              <thead><tr><th>Cieľ</th><th>Anchor text</th><th>Prečo</th></tr></thead>
              <tbody>${links}</tbody>
            </table>
          </div>

          <div class="verify">
            <h4>Treba overiť crawlom</h4>
            <ul>${verify}</ul>
          </div>

          <div class="finding">
            <h4>Štrukturálne zistenie</h4>
            <p>${e(p.structuralFinding)}</p>
          </div>

          <div class="actions">
            <button type="button" class="btn approve" data-act="approved">Schváliť</button>
            <button type="button" class="btn reject" data-act="rejected">Zamietnuť</button>
            <button type="button" class="btn reset" data-act="pending">Vrátiť na čaká</button>
          </div>
        </div>
      </details>`;
}

const html = `<title>Zlaté náušnice — SEO konzola</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --brass:#b8912f; --brass-lo:#8d6f24; --assay:#0d8b91; --assay-lo:#0a6c71;
  --ground:#f5f7f7; --surface:#ffffff; --surface2:#eef2f2;
  --line:#d9e2e1; --line-hi:#c3d1d0;
  --ink:#0f1716; --ink2:#425855; --dim:#6b8280;
  --good:#2f7d52; --warn:#a8791f; --bad:#a94238;
  --good-bg:#e7f2eb; --warn-bg:#f7efdd; --bad-bg:#f7e6e4;
  --shadow:0 1px 2px rgba(15,23,22,.05), 0 8px 24px -16px rgba(15,23,22,.18);
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --body:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --disp:"Fraunces",Georgia,"Times New Roman",serif;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --brass:#d4ae56; --brass-lo:#a8862f; --assay:#2fb3ba; --assay-lo:#17888e;
    --ground:#0b1211; --surface:#111a19; --surface2:#16211f;
    --line:#233130; --line-hi:#324442;
    --ink:#e7f0ef; --ink2:#a6bfbc; --dim:#7a9391;
    --good:#4fa871; --warn:#cfa03c; --bad:#cf6157;
    --good-bg:#12261b; --warn-bg:#2a2113; --bad-bg:#2b1614;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.7);
  }
}
:root[data-theme="dark"]{
  --brass:#d4ae56; --brass-lo:#a8862f; --assay:#2fb3ba; --assay-lo:#17888e;
  --ground:#0b1211; --surface:#111a19; --surface2:#16211f;
  --line:#233130; --line-hi:#324442;
  --ink:#e7f0ef; --ink2:#a6bfbc; --dim:#7a9391;
  --good:#4fa871; --warn:#cfa03c; --bad:#cf6157;
  --good-bg:#12261b; --warn-bg:#2a2113; --bad-bg:#2b1614;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.7);
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:var(--body); font-size:15px; line-height:1.55;
  font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1080px; margin:0 auto; padding:0 24px 72px}
h1,h2,h3,h4{font-family:var(--disp); text-wrap:balance; margin:0}
code,pre,.stamp,.num,.meter-num{font-family:var(--mono)}
a{color:var(--assay)}
:focus-visible{outline:2px solid var(--brass); outline-offset:2px; border-radius:3px}

/* ─── header ─── */
header{padding:56px 0 30px; border-bottom:1px solid var(--line)}
.eyebrow{
  font-family:var(--mono); font-size:11px; letter-spacing:.13em; text-transform:uppercase;
  color:var(--brass-lo); display:flex; gap:14px; flex-wrap:wrap; margin-bottom:16px;
}
.eyebrow span{position:relative; padding-left:14px}
.eyebrow span:first-child{padding-left:0}
.eyebrow span:not(:first-child)::before{
  content:""; position:absolute; left:0; top:50%; width:5px; height:1px; background:var(--line-hi);
}
h1{font-size:clamp(34px,5.4vw,54px); font-weight:600; letter-spacing:-.02em; line-height:1.04}
.lede{color:var(--ink2); font-size:17px; max-width:60ch; margin:14px 0 0}
.lede b{color:var(--ink); font-weight:600}

/* ─── sections ─── */
section{padding:44px 0 4px}
.shead{display:flex; align-items:baseline; justify-content:space-between; gap:16px; margin-bottom:20px; flex-wrap:wrap}
h2{font-size:clamp(21px,2.5vw,27px); font-weight:600; letter-spacing:-.012em}
.shead p{margin:0; color:var(--dim); font-size:13.5px; max-width:52ch}

/* ─── status plate ─── */
.plate{display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:1px;
  background:var(--line); border:1px solid var(--line); border-radius:4px; overflow:hidden}
.st{background:var(--surface); padding:15px 17px 16px; display:flex; flex-direction:column; gap:6px}
.st-top{display:flex; align-items:center; justify-content:space-between; gap:10px}
.st-label{font-size:12.5px; font-weight:600; letter-spacing:.01em}
.st-detail{color:var(--dim); font-size:12.5px; line-height:1.45; margin:0}
.pill{
  font-family:var(--mono); font-size:10.5px; font-weight:500; letter-spacing:.05em; text-transform:uppercase;
  padding:3px 8px; border-radius:3px; white-space:nowrap; border:1px solid transparent;
}
.pill.good{background:var(--good-bg); color:var(--good); border-color:color-mix(in srgb,var(--good) 26%,transparent)}
.pill.warn{background:var(--warn-bg); color:var(--warn); border-color:color-mix(in srgb,var(--warn) 26%,transparent)}
.pill.bad{background:var(--bad-bg); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 26%,transparent)}

/* ─── KPI ─── */
.kpis{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px;
  background:var(--line); border:1px solid var(--line); border-radius:4px; overflow:hidden; margin-bottom:8px}
.kpi{background:var(--surface); padding:16px 17px 15px}
.kpi b{display:block; font-family:var(--mono); font-size:26px; font-weight:600; letter-spacing:-.02em; line-height:1.1}
.kpi i{display:block; font-style:normal; font-size:11.5px; color:var(--dim); margin-top:5px; letter-spacing:.01em}
.kpi.hero b{color:var(--brass)}

/* ─── settings ─── */
.settings{border:1px solid var(--line); border-radius:4px; background:var(--surface); overflow:hidden}
.srow{display:grid; grid-template-columns:minmax(180px,240px) 1fr; gap:18px;
  padding:15px 18px; border-bottom:1px solid var(--line); align-items:start}
.srow:last-child{border-bottom:none}
.srow > .k{font-size:13px; font-weight:600; padding-top:3px}
.srow .k small{display:block; font-weight:400; color:var(--dim); font-size:12px; margin-top:2px; line-height:1.4}
.opts{display:flex; flex-wrap:wrap; gap:8px 18px}
.opt{display:flex; align-items:center; gap:7px; font-size:13.5px; cursor:pointer}
.opt input{accent-color:var(--assay); width:15px; height:15px; margin:0; cursor:pointer}
input[type=text],input[type=number]{
  font-family:var(--mono); font-size:13.5px; padding:6px 9px; border:1px solid var(--line-hi);
  border-radius:3px; background:var(--surface2); color:var(--ink); max-width:100%;
}
input[type=number]{width:80px}
.w-url{width:min(320px,100%)}
.w-time{width:110px}
.guard{background:var(--warn-bg); border-left:2px solid var(--warn)}
.guard .k small{color:var(--warn)}

/* ─── cards ─── */
.cards{display:flex; flex-direction:column; gap:10px}
.card{border:1px solid var(--line); border-radius:4px; background:var(--surface); box-shadow:var(--shadow)}
.card[data-status="approved"]{border-left:3px solid var(--good)}
.card[data-status="rejected"]{border-left:3px solid var(--bad); opacity:.66}
.card[data-status="pending"]{border-left:3px solid var(--brass)}
.card > summary{
  display:flex; gap:14px; align-items:center; padding:14px 17px; cursor:pointer; list-style:none;
}
.card > summary::-webkit-details-marker{display:none}
.card > summary:hover{background:var(--surface2)}
.rank{
  font-family:var(--mono); font-size:12px; font-weight:600; color:var(--brass-lo);
  width:24px; height:24px; flex:0 0 24px; display:grid; place-items:center;
  border:1px solid var(--line-hi); border-radius:2px;
}
.sum-main{flex:1 1 auto; min-width:0}
.sum-title{display:block; font-family:var(--disp); font-size:16px; font-weight:600; line-height:1.3}
.sum-meta{display:flex; gap:12px; flex-wrap:wrap; margin-top:4px; font-size:11.5px; color:var(--dim)}
.sum-meta code{font-size:11px; color:var(--ink2)}
.sum-num{font-family:var(--mono)}
.stamp{
  font-size:10px; font-weight:600; letter-spacing:.06em; padding:1px 6px; border-radius:2px;
  border:1px solid var(--brass); color:var(--brass); background:color-mix(in srgb,var(--brass) 9%,transparent);
}
.sum-right{display:flex; align-items:center; gap:14px; flex:0 0 auto}
.missed{text-align:right}
.missed b{display:block; font-family:var(--mono); font-size:19px; font-weight:600; color:var(--bad); line-height:1}
.missed i{display:block; font-style:normal; font-size:10px; color:var(--dim); margin-top:3px}
.status-pill{background:var(--warn-bg); color:var(--warn); border:1px solid color-mix(in srgb,var(--warn) 26%,transparent)}
.card[data-status="approved"] .status-pill{background:var(--good-bg); color:var(--good); border-color:color-mix(in srgb,var(--good) 26%,transparent)}
.card[data-status="rejected"] .status-pill{background:var(--bad-bg); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 26%,transparent)}

.card-body{padding:4px 17px 20px; border-top:1px solid var(--line)}
.card-body h4{
  font-family:var(--body); font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
  color:var(--dim); margin:24px 0 9px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
}
.wc{font-family:var(--mono); font-size:10.5px; font-weight:400; letter-spacing:.02em; text-transform:none; color:var(--dim)}
.diag{margin-top:18px; padding:13px 15px; background:var(--surface2); border-radius:3px; border-left:2px solid var(--assay)}
.diag h4{margin:0 0 6px}
.diag p{margin:0; font-size:14px; line-height:1.6; color:var(--ink2)}

.twrap{overflow-x:auto; border:1px solid var(--line); border-radius:3px}
table.data{width:100%; border-collapse:collapse; font-size:13px; min-width:460px}
table.data th{
  text-align:left; font-family:var(--body); font-size:10.5px; font-weight:700; letter-spacing:.07em;
  text-transform:uppercase; color:var(--dim); padding:8px 11px; background:var(--surface2);
  border-bottom:1px solid var(--line); white-space:nowrap;
}
table.data td{padding:7px 11px; border-bottom:1px solid var(--line); vertical-align:top}
table.data tr:last-child td{border-bottom:none}
table.data .num{text-align:right; font-family:var(--mono); white-space:nowrap}
table.data .num.bad{color:var(--bad)}
table.data .why{color:var(--dim); font-size:12px}
table.data code{font-size:11.5px}

dl.proposal{margin:0; display:grid; grid-template-columns:minmax(120px,150px) 1fr; gap:0}
dl.proposal dt{
  font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--dim);
  padding:11px 0; border-top:1px solid var(--line);
}
dl.proposal dd{margin:0; padding:11px 0; border-top:1px solid var(--line); display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center}
.val{font-size:14.5px; line-height:1.5; flex:1 1 320px; min-width:0}
dl.proposal dt:first-of-type,dl.proposal dd:first-of-type{border-top:none}
.mrow{display:flex; align-items:center; gap:8px; flex:0 0 auto}
.meter{position:relative; display:block; width:110px; height:5px; background:var(--surface2);
  border:1px solid var(--line); border-radius:3px}
.meter-band{position:absolute; top:0; bottom:0; background:color-mix(in srgb,var(--good) 32%,transparent)}
.meter-pin{position:absolute; top:-3px; width:2px; height:11px; background:var(--assay); border-radius:1px}
.meter-pin.bad{background:var(--bad)}
.meter-num{font-size:11.5px; color:var(--good); font-weight:500}
.meter-num.bad{color:var(--bad)}
.meter-lim{color:var(--dim); font-weight:400}

.longdesc{border:1px solid var(--line); border-radius:3px; padding:14px 16px; background:var(--surface2)}
.longdesc p{margin:0 0 11px; font-size:14px; line-height:1.62; max-width:66ch}
.longdesc p:last-child{margin-bottom:0}

ol.alts{margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:1px;
  background:var(--line); border:1px solid var(--line); border-radius:3px; overflow:hidden}
ol.alts li{background:var(--surface); padding:8px 11px; display:flex; gap:11px; align-items:center; font-size:13.5px}
.alt-n{font-family:var(--mono); font-size:11px; color:var(--dim); flex:0 0 16px}
.alt-t{flex:1 1 auto; min-width:0}

pre.code{
  margin:0; overflow-x:auto; background:var(--surface2); border:1px solid var(--line); border-radius:3px;
  padding:13px 15px; font-size:12px; line-height:1.55; color:var(--ink2);
}
.verify,.finding{margin-top:22px; padding:13px 15px; border-radius:3px; font-size:13.5px}
.verify{background:var(--warn-bg); border-left:2px solid var(--warn)}
.verify h4,.finding h4{margin:0 0 7px}
.verify ul{margin:0; padding-left:19px; color:var(--ink2)}
.verify li{margin-bottom:3px}
.finding{background:var(--surface2); border-left:2px solid var(--brass)}
.finding p{margin:0; color:var(--ink2); line-height:1.6}

.actions{display:flex; gap:9px; margin-top:24px; padding-top:17px; border-top:1px solid var(--line); flex-wrap:wrap}
.btn{
  font-family:var(--body); font-size:13px; font-weight:600; padding:8px 15px; border-radius:3px;
  border:1px solid var(--line-hi); background:var(--surface); color:var(--ink); cursor:pointer;
  transition:background .14s,border-color .14s,color .14s;
}
.btn:hover{background:var(--surface2)}
.btn.approve{border-color:color-mix(in srgb,var(--good) 42%,transparent); color:var(--good)}
.btn.approve:hover{background:var(--good-bg)}
.btn.reject{border-color:color-mix(in srgb,var(--bad) 42%,transparent); color:var(--bad)}
.btn.reject:hover{background:var(--bad-bg)}
.btn.reset{color:var(--dim)}
.copy{
  font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; padding:3px 8px; border-radius:2px;
  border:1px solid var(--line-hi); background:transparent; color:var(--dim); cursor:pointer; flex:0 0 auto;
  transition:color .14s,border-color .14s;
}
.copy:hover{color:var(--assay); border-color:var(--assay)}

/* ─── findings band ─── */
.finds{display:flex; flex-direction:column; gap:10px}
.find{border:1px solid var(--line); border-left:3px solid var(--bad); border-radius:4px;
  background:var(--surface); padding:16px 18px}
.find h3{font-size:16px; font-weight:600; margin-bottom:7px}
.find p{margin:0 0 9px; font-size:14px; color:var(--ink2); line-height:1.6; max-width:70ch}
.find p:last-child{margin-bottom:0}
.find .tag{font-family:var(--mono); font-size:10px; letter-spacing:.07em; text-transform:uppercase;
  color:var(--bad); display:block; margin-bottom:5px}
.find.med{border-left-color:var(--warn)} .find.med .tag{color:var(--warn)}

/* ─── local chrome ─── */
.localbar{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px;
  font-size:12.5px; color:var(--dim)}
.tally{font-family:var(--mono); font-size:12px; color:var(--ink2)}
.tally b{color:var(--ink)}
.synced{font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; padding:3px 8px; border-radius:2px;
  border:1px solid var(--line-hi); color:var(--dim)}
.synced[data-on="1"]{color:var(--good); border-color:color-mix(in srgb,var(--good) 36%,transparent)}
.synced[data-on="0"]{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 36%,transparent)}

footer{margin-top:52px; padding-top:22px; border-top:1px solid var(--line); color:var(--dim); font-size:12.5px}
footer dl{display:grid; grid-template-columns:minmax(140px,190px) 1fr; gap:6px 18px; margin:0}
footer dt{font-weight:600; color:var(--ink2)}
footer dd{margin:0}
.toast{
  position:fixed; left:50%; bottom:26px; transform:translateX(-50%);
  background:var(--ink); color:var(--ground); font-size:13px; font-weight:500;
  padding:9px 17px; border-radius:3px; z-index:99; box-shadow:var(--shadow);
}
@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}
@media (max-width:640px){
  dl.proposal,.srow,footer dl{grid-template-columns:1fr; gap:4px}
  dl.proposal dd{border-top:none; padding-top:0}
  .srow{gap:8px}
  .card > summary{flex-wrap:wrap}
  .sum-right{width:100%; justify-content:space-between; padding-left:38px}
}
</style>

<div class="wrap">
<header>
  <div class="eyebrow">
    <span>SEO ACE</span><span>Dávka ${doc.batch}</span><span>${prettyDate(doc.date)}</span><span>${e(doc.category.name)}</span>
  </div>
  <h1>Zlaté náušnice</h1>
  <p class="lede">Päť produktov, ktoré Google už zobrazuje — a na ktoré nikto neklikne.
    Spolu <b>${nf(doc.totals.impressions)} impresií</b> a <b>${doc.totals.clicks} klikov</b> za posledný kvartál.
    Pri CTR, ktoré tieto pozície bežne dosahujú, tu chýba <b>${doc.totals.missedClicks.toFixed(0)} klikov</b>.</p>
</header>

<section id="sumar">
  <div class="shead">
    <h2>Rozsah dávky</h2>
    <p>Premrhané kliky = impresie × rozdiel medzi CTR, ktoré e-shop na danej pozícii bežne má, a tým, ktoré stránka reálne dosahuje.</p>
  </div>
  <div class="kpis">
    <div class="kpi"><b>${doc.products.length}</b><i>produktov v dávke</i></div>
    <div class="kpi"><b>${nf(doc.totals.impressions)}</b><i>impresií za kvartál</i></div>
    <div class="kpi"><b>${doc.totals.clicks}</b><i>klikov za kvartál</i></div>
    <div class="kpi"><b>${doc.totals.avgCtrPercent.toFixed(2)}&nbsp;%</b><i>priemerné CTR</i></div>
    <div class="kpi hero"><b>${doc.totals.missedClicks.toFixed(0)}</b><i>premrhaných klikov</i></div>
  </div>
</section>

<section id="stav">
  <div class="shead">
    <h2>Stav pipeline</h2>
    <p>Čo v tejto chvíli funguje a čo blokuje ďalší krok.</p>
  </div>
  <div class="plate">
    ${STATUS.map((s) => `<div class="st">
      <div class="st-top"><span class="st-label">${e(s.label)}</span><span class="pill ${s.state}">${e(s.value)}</span></div>
      <p class="st-detail">${e(s.detail)}</p>
    </div>`).join('\n    ')}
  </div>
</section>

<section id="nastavenia">
  <div class="shead">
    <h2>Nastavenia</h2>
    <p>Zmeny sa ukladajú do dokumentu a načítam ich pri ďalšom dennom behu. Nič sa nezapisuje do e-shopu.</p>
  </div>
  <div class="settings">
    <div class="srow">
      <span class="k">Produktov denne<small>Koľko produktov spracovať v jednej dávke</small></span>
      <span><input type="number" name="productsPerDay" min="1" max="20" value="${cfg.target.productsPerDay}"></span>
    </div>
    <div class="srow">
      <span class="k">Kategória<small>Cesta v e-shope, z ktorej sa vyberá</small></span>
      <span><input type="text" class="w-url" name="categoryPath" value="${e(cfg.target.categoryPath)}"></span>
    </div>
    <div class="srow">
      <span class="k">Priorita výberu<small>Podľa čoho sa vyberá päťka na dnes</small></span>
      <span class="opts">${radioRow('priorita', RADIO.priorita)}</span>
    </div>
    <div class="srow">
      <span class="k">Tón textov<small>Ovplyvňuje každý napísaný popis</small></span>
      <span class="opts">${radioRow('ton', RADIO.ton)}</span>
    </div>
    <div class="srow">
      <span class="k">Čas denného behu<small>UTC; crawl beží dve hodiny pred generovaním</small></span>
      <span><input type="text" class="w-time" name="runTime" value="05:23" inputmode="numeric" pattern="[0-9]{2}:[0-9]{2}"></span>
    </div>
    <div class="srow">
      <span class="k">Doručenie reportu<small>Kam poslať dennú dávku</small></span>
      <span class="opts">${CHANNELS.map(([v, l, on]) => `
        <label class="opt"><input type="checkbox" name="ch-${v}"${on ? ' checked' : ''}><span>${e(l)}</span></label>`).join('')}
      </span>
    </div>
    <div class="srow">
      <span class="k">Ahrefs platené endpointy<small>Objemy a difficulty; zapnúť po ${prettyDate(cfg.dataSources.ahrefs.paidEndpointsResumeAfter)}</small></span>
      <span class="opts"><label class="opt"><input type="checkbox" name="ahrefsPaid"><span>Zapnuté</span></label></span>
    </div>
    <div class="srow guard">
      <span class="k">Automatický zápis do e-shopu<small>Zámerne vypnuté. Každá dávka ide na schválenie.</small></span>
      <span class="opts"><label class="opt"><input type="checkbox" name="autoPublish"><span>Povoliť zápis bez schválenia</span></label></span>
    </div>
  </div>
</section>

<section id="davka">
  <div class="shead">
    <h2>Dávka na schválenie</h2>
    <p>Každý návrh prešiel validátorom podľa playbooku: dĺžky, zakázané tvrdenia, unikátne alt texty, JSON-LD bez vymysleného hodnotenia.</p>
  </div>
  <artifact-local>
    <div class="localbar">
      <span class="tally" id="tally">Čaká <b>${doc.products.length}</b> · schválené <b>0</b> · zamietnuté <b>0</b></span>
      <span class="synced" id="synced" data-on="0">stav ukladania sa zisťuje</span>
    </div>
  </artifact-local>
  <div class="cards">${doc.products.map(productCard).join('\n')}
  </div>
</section>

<section id="zistenia">
  <div class="shead">
    <h2>Zistenia mimo tejto dávky</h2>
    <p>Veci, ktoré nespraví denná päťka a treba ich riešiť na úrovni šablóny alebo architektúry.</p>
  </div>
  <div class="finds">
    <div class="find">
      <span class="tag">Kanibalizácia · vysoká priorita</span>
      <h3>Tri URL súťažia o jeden dopyt s intenciou akcie</h3>
      <p>Dopyt <code>akcia na zlate nausnice</code> má 454 impresií a rozdeľuje sa medzi kategóriu
        <code>/77-zlate-nausnice</code> (pozícia 2,42), produkt 32023 (1,77) a produkt 32102 (1,84).
        Všetky tri majú CTR pod 0,5 %.</p>
      <p>Kto takto hľadá, chce výpis zliav. Dostane jeden produkt. Stránka <code>/110-vypredaj-skladu</code>
        pritom na dopyte <code>zlate nausnice vypredaj</code> drží CTR 2,14 % — päťnásobok.
        Dopyt patrí tam, a žiadny prepis titulku to nevyrieši.</p>
    </div>
    <div class="find">
      <span class="tag">Podozrenie na technický problém</span>
      <h3>Produkt 36995: 674 impresií, nula klikov</h3>
      <p>Pätnásť dopytov, pozície od 1,21 do 16,7, a ani jeden klik. Nula klikov pri pozícii 1,21
        nie je vysvetliteľná slabým titulkom — taký snippet by nejaký klik dostal.</p>
      <p>Pred prepisom textu treba overiť dostupnosť produktu a to, či sa snippet v SERP vôbec
        renderuje. Ak je vypredaný, správna oprava nie je nový title.</p>
    </div>
    <div class="find med">
      <span class="tag">Indexácia</span>
      <h3>Parametrické URL sú v indexe a kanibalizujú kategóriu</h3>
      <p>V Search Console majú reálne impresie stránky ako
        <code>/77-zlate-nausnice?p=1&amp;ob=2&amp;ow=1&amp;os=0&amp;pp=5-1035</code> (102 impresií) —
        filtrované varianty tej istej kategórie. Patria do pravidiel <code>robots.txt</code>
        alebo canonical, nie do indexu.</p>
    </div>
    <div class="find med">
      <span class="tag">Zvyšok po starej verzii</span>
      <h3>Mobilná vetva <code>/mobile/</code> je stále indexovaná</h3>
      <p>Napríklad <code>/mobile/4077-piercing-do-pupku-penis-so-zirkonom.html</code> má 127 impresií
        a 5 klikov. Samostatná mobilná vetva by pri responzívnom e-shope už nemala existovať.</p>
    </div>
    <div class="find med">
      <span class="tag">Systémový dlh</span>
      <h3>Site Audit: health score 2 zo 100</h3>
      <p>Crawl z 1. 8. 2026 našiel chyby na 9 792 z 10 019 URL. Denná dávka piatich produktov je
        liečba symptómov. Duplicitné meta tagy na tisícoch URL sa opravujú v šablóne PrestaShopu,
        nie produkt po produkte — je to oddelená úloha s vlastným rozsahom.</p>
    </div>
  </div>
</section>

<footer>
  <dl>
    <dt>Zdroj dopytov</dt><dd>${e(doc.dataSources.gsc)}</dd>
    <dt>CTR benchmark</dt><dd>${e(doc.dataSources.ctrBenchmark)}</dd>
    <dt>Ahrefs platené</dt><dd>${e(doc.dataSources.ahrefsPaid)}</dd>
    <dt>Crawl produktov</dt><dd>${e(doc.dataSources.productCrawl)}</dd>
    <dt>Pravidlá písania</dt><dd>docs/SEO_PLAYBOOK.md · validované scripts/validate-seo.mjs</dd>
  </dl>
</footer>
</div>

<script>
(function () {
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.hidden = true; }, 1900);
  }

  // Copy buttons: read the rendered text, never a JS copy of it.
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.copy');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    var src = document.getElementById(btn.dataset.copy);
    if (!src) return;
    var text = src.tagName === 'PRE' ? src.textContent : src.innerText.trim();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Skopírované'); },
        function () { toast('Kopírovanie zablokoval prehliadač'); }
      );
    } else {
      toast('Kopírovanie tu nie je dostupné');
    }
  });

  // Approve / reject: mutate the card's data-status directly so the change is
  // part of the document, not a JS-side model.
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.btn[data-act]');
    if (!btn) return;
    var card = btn.closest('.card');
    if (!card) return;
    card.dataset.status = btn.dataset.act;
    var pill = card.querySelector('.status-pill');
    if (pill) pill.textContent = btn.dataset.act === 'approved' ? 'Schválené'
      : btn.dataset.act === 'rejected' ? 'Zamietnuté' : 'Čaká';
    tally();
  });

  // The tally lives inside <artifact-local>, so rendering it from script is safe.
  function tally() {
    var el = document.getElementById('tally');
    if (!el) return;
    var cards = document.querySelectorAll('.card');
    var a = 0, r = 0, p = 0;
    cards.forEach(function (c) {
      var s = c.dataset.status;
      if (s === 'approved') a++; else if (s === 'rejected') r++; else p++;
    });
    el.innerHTML = 'Čaká <b>' + p + '</b> · schválené <b>' + a + '</b> · zamietnuté <b>' + r + '</b>';
  }
  tally();

  // Saving state: report honestly whether edits are being captured.
  var syncEl = document.getElementById('synced');
  function setSync(on, label) {
    if (!syncEl) return;
    syncEl.dataset.on = on ? '1' : '0';
    syncEl.textContent = label;
  }
  document.addEventListener('claude:sync-off', function () { setSync(false, 'ukladanie vypnuté'); });
  document.addEventListener('claude:sync-lost', function () { setSync(false, 'ukladanie sa opakuje'); });
  document.addEventListener('claude:edit', function () { tally(); });

  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('artifact').then(function (a) {
      setSync(!!a, a ? 'zmeny sa ukladajú' : 'iba na čítanie');
    }, function () { setSync(false, 'iba na čítanie'); });
  } else {
    setSync(false, 'iba na čítanie');
  }
})();
</script>
`;

mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
const out = resolve(ROOT, `reports/console-${doc.date}.html`);
writeFileSync(out, html);
console.log(`Napisane ${out} (${(html.length / 1024).toFixed(1)} kB)`);
