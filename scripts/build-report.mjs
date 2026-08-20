#!/usr/bin/env node
/** Generuje markdown report dennej davky z validovanych navrhov. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const doc = JSON.parse(readFileSync(resolve(ROOT, `data/proposals/${date}.json`), 'utf8'));
const nf = (n) => new Intl.NumberFormat('sk-SK').format(n);
const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
const SK = ['januára','februára','marca','apríla','mája','júna','júla','augusta','septembra','októbra','novembra','decembra'];
const pretty = (iso) => { const [y,m,d]=iso.split('-'); return `${+d}. ${SK[+m-1]} ${y}`; };

let md = `# SEO dávka ${doc.batch} — ${pretty(doc.date)}

**Kategória:** ${doc.category.name} (\`${doc.category.path}\`)
**Výber:** ${doc.products.length} produktov podľa impresií × rozdielu CTR
**Rozsah:** ${nf(doc.totals.impressions)} impresií, ${doc.totals.clicks} klikov, priemerné CTR ${doc.totals.avgCtrPercent.toFixed(2)} %
**Príležitosť:** ${doc.totals.missedClicks.toFixed(0)} premrhaných klikov za kvartál

Žiadna zmena nebola zapísaná do e-shopu. Toto je návrh na schválenie.

## Prehľad

| # | Produkt | Impresie | Kliky | CTR | Pozícia | Očakávané CTR | Premrhané kliky |
|---|---|---:|---:|---:|---:|---:|---:|
`;
for (const p of doc.products) {
  md += `| ${p.rank} | [\`${p.productId}\`](${p.url}) | ${nf(p.gsc.impressions)} | ${p.gsc.clicks} | ${p.gsc.ctrPercent.toFixed(2)} % | ${p.gsc.position.toFixed(2)} | ${p.gsc.expectedCtrPercent.toFixed(2)} % | **${p.gsc.missedClicks.toFixed(0)}** |\n`;
}

md += `\n## Zdroje dát

| Zdroj | Stav |
|---|---|
| Dopyty | ${doc.dataSources.gsc} |
| CTR benchmark | ${doc.dataSources.ctrBenchmark} |
| Ahrefs platené | ${doc.dataSources.ahrefsPaid} |
| Crawl produktov | ${doc.dataSources.productCrawl} |

`;

for (const p of doc.products) {
  md += `---

## ${p.rank}. ${p.proposed.h1}

\`${p.productId}\` · ${p.url}

**Stav:** ${nf(p.gsc.impressions)} impresií, ${p.gsc.clicks} klikov, CTR ${p.gsc.ctrPercent.toFixed(2)} % na pozícii ${p.gsc.position.toFixed(2)}. Očakávané CTR na tejto pozícii je ${p.gsc.expectedCtrPercent.toFixed(2)} %, čo znamená **${p.gsc.missedClicks.toFixed(0)} premrhaných klikov**.

### Diagnóza

${p.diagnosis}

### Čo Google reálne zobrazuje na túto URL

| Dopyt | Impresie | Kliky | CTR | Pozícia |
|---|---:|---:|---:|---:|
`;
  for (const s of p.secondaryQueries) {
    md += `| ${s.q} | ${nf(s.imp)} | ${s.clicks} | ${s.ctr.toFixed(2)} % | ${s.pos.toFixed(2)} |\n`;
  }

  md += `
### Návrh

**Meta title** (${p.proposed.metaTitle.length} znakov)

> ${p.proposed.metaTitle}

**H1** (${p.proposed.h1.length} znakov)

> ${p.proposed.h1}

**Meta description** (${p.proposed.metaDescription.length} znakov)

> ${p.proposed.metaDescription}

**Krátky popis** (${words(p.proposed.shortDescription)} slov)

> ${p.proposed.shortDescription}

**Dlhý popis** (${words(p.proposed.longDescription)} slov)

${p.proposed.longDescription.split(/\n\n+/).map((t) => t.trim()).join('\n\n')}

**Alt texty obrázkov**

${p.proposed.imageAlts.map((a, i) => `${i + 1}. ${a}`).join('\n')}

**JSON-LD**

\`\`\`json
${JSON.stringify(p.proposed.jsonLd, null, 2)}
\`\`\`

**Interné odkazy**

| Cieľ | Anchor text | Prečo |
|---|---|---|
${p.proposed.internalLinks.map((l) => `| \`${l.path}\` | ${l.anchor} | ${l.why} |`).join('\n')}

### Treba overiť crawlom

${p.needsVerification.map((v) => `- ${v}`).join('\n')}

### Štrukturálne zistenie

${p.structuralFinding}

`;
}

md += `---

## Zistenia mimo tejto dávky

### Kanibalizácia: tri URL na jeden dopyt s intenciou akcie

Dopyt \`akcia na zlate nausnice\` má 454 impresií a delí sa medzi kategóriu \`/77-zlate-nausnice\`
(pozícia 2,42), produkt 32023 (1,77) a produkt 32102 (1,84). Všetky tri majú CTR pod 0,5 %.

Kto takto hľadá, chce výpis zliav a dostane jeden produkt. Stránka \`/110-vypredaj-skladu\` pritom
na dopyte \`zlate nausnice vypredaj\` drží CTR 2,14 % — päťnásobok. Dopyt patrí tam a žiadny
prepis titulku to nevyrieši.

### Produkt 36995: 674 impresií, nula klikov

Pätnásť dopytov, pozície od 1,21 do 16,7, ani jeden klik. Nula klikov pri pozícii 1,21 nie je
vysvetliteľná slabým titulkom. Pred prepisom textu overiť dostupnosť produktu a to, či sa snippet
v SERP renderuje.

### Parametrické URL v indexe

Stránky ako \`/77-zlate-nausnice?p=1&ob=2&ow=1&os=0&pp=5-1035\` majú reálne impresie (102).
Filtrované varianty tej istej kategórie patria do pravidiel \`robots.txt\` alebo canonical.

### Mobilná vetva \`/mobile/\` je stále indexovaná

\`/mobile/4077-piercing-do-pupku-penis-so-zirkonom.html\` má 127 impresií a 5 klikov. Pri
responzívnom e-shope by samostatná mobilná vetva už nemala existovať.

### Site Audit: health score 2 zo 100

Crawl z 1. 8. 2026 našiel chyby na 9 792 z 10 019 URL. Denná dávka piatich produktov je liečba
symptómov; duplicitné meta tagy na tisícoch URL sa opravujú v šablóne PrestaShopu. Oddelená úloha.

---

*Návrhy prešli validátorom \`scripts/validate-seo.mjs\` podľa \`docs/SEO_PLAYBOOK.md\`:
dĺžky, zakázané tvrdenia, unikátne alt texty, JSON-LD bez vymysleného hodnotenia.*
`;

mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
const out = resolve(ROOT, `reports/seo-batch-${doc.date}.md`);
writeFileSync(out, md);
console.log(`Napisane ${out} (${(md.length / 1024).toFixed(1)} kB, ${md.split('\n').length} riadkov)`);
