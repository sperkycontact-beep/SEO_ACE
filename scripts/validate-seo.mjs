#!/usr/bin/env node
/**
 * Vynucuje docs/SEO_PLAYBOOK.md na navrhoch. Ked toto neprejde, navrh nejde do reportu.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'config/seo-ace.config.json'), 'utf8'));
const S = cfg.seoScope;
const file = process.argv[2] ?? `data/proposals/${new Date().toISOString().slice(0, 10)}.json`;
const doc = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

const problems = [];
const warns = [];
const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

for (const p of doc.products) {
  const id = p.productId;
  const at = (msg) => `[${id}] ${msg}`;

  const t = p.proposed.metaTitle;
  if (t.length < S.metaTitle.minChars || t.length > S.metaTitle.maxChars)
    problems.push(at(`metaTitle ${t.length} znakov, povolene ${S.metaTitle.minChars}-${S.metaTitle.maxChars}: "${t}"`));
  if (!norm(t.slice(0, 40)).includes(norm(p.primaryQuery).slice(0, 14)))
    warns.push(at(`primarny dopyt "${p.primaryQuery}" nie je v prvych 40 znakoch title`));
  if (/[!]|NAJLEP|KUPIT|KÚPIŤ/i.test(t)) problems.push(at('metaTitle obsahuje zakazany superlativ alebo vykricnik'));

  const d = p.proposed.metaDescription;
  if (d.length < S.metaDescription.minChars || d.length > S.metaDescription.maxChars)
    problems.push(at(`metaDescription ${d.length} znakov, povolene ${S.metaDescription.minChars}-${S.metaDescription.maxChars}`));
  if (/\d+[,.]\d{2}\s*(€|eur)|€\s*\d/i.test(d)) problems.push(at('metaDescription obsahuje cenu — zakazane, cena zastara'));
  if (/dorucen|doprava zdarma|na druhy den/i.test(norm(d)))
    problems.push(at('metaDescription slubuje dorucenie, ktore nie je overene z dat produktu'));

  if (p.proposed.h1.length > S.h1.maxChars) problems.push(at(`h1 ${p.proposed.h1.length} znakov, max ${S.h1.maxChars}`));
  if (norm(p.proposed.h1) === norm(t)) problems.push(at('h1 je kopia metaTitle'));

  const sw = words(p.proposed.shortDescription);
  if (sw < S.shortDescription.minWords || sw > S.shortDescription.maxWords)
    problems.push(at(`shortDescription ${sw} slov, povolene ${S.shortDescription.minWords}-${S.shortDescription.maxWords}`));

  const lw = words(p.proposed.longDescription);
  if (lw < S.longDescription.minWords || lw > S.longDescription.maxWords)
    problems.push(at(`longDescription ${lw} slov, povolene ${S.longDescription.minWords}-${S.longDescription.maxWords}`));
  for (const sentence of (p.proposed.longDescription ?? '').split(/(?<=[.!?])\s+/)) {
    if (words(sentence) > 25) warns.push(at(`veta ma ${words(sentence)} slov (max 25): "${sentence.slice(0, 60)}..."`));
  }

  const alts = p.proposed.imageAlts ?? [];
  if (!alts.length) problems.push(at('ziadne alt texty'));
  if (new Set(alts.map(norm)).size !== alts.length) problems.push(at('duplicitne alt texty'));
  for (const a of alts) {
    if (a.length > S.imageAlt.maxChars) problems.push(at(`alt ma ${a.length} znakov, max ${S.imageAlt.maxChars}`));
    if (/^(obrazok|foto|fotka|image)/i.test(norm(a))) problems.push(at(`alt zacina zakazanym slovom: "${a}"`));
  }

  const ld = p.proposed.jsonLd;
  if (!ld) problems.push(at('chyba JSON-LD'));
  else {
    if (JSON.stringify(ld).includes('aggregateRating'))
      problems.push(at('JSON-LD obsahuje aggregateRating — zakazane bez realnych hodnoteni'));
    for (const req of ['name', 'image', 'description', 'brand', 'offers'])
      if (!(req in ld)) problems.push(at(`JSON-LD Product bez povinneho pola "${req}"`));
  }

  const links = p.proposed.internalLinks ?? [];
  if (links.length < S.internalLinks.min || links.length > S.internalLinks.max)
    problems.push(at(`${links.length} internych odkazov, povolene ${S.internalLinks.min}-${S.internalLinks.max}`));
  if (new Set(links.map((l) => norm(l.anchor))).size !== links.length)
    problems.push(at('duplicitne anchor texty v internych odkazoch'));
  for (const l of links)
    if (/^(tu|sem|klikni|viac)$/i.test(norm(l.anchor))) problems.push(at(`nepopisny anchor "${l.anchor}"`));
}

console.log(`Validacia ${file} — ${doc.products.length} produktov\n`);
if (warns.length) {
  console.log(`Upozornenia (${warns.length}):`);
  for (const w of warns) console.log('  ~ ' + w);
  console.log('');
}
if (problems.length) {
  console.log(`CHYBY (${problems.length}):`);
  for (const p of problems) console.log('  x ' + p);
  process.exit(1);
}
console.log(`Vsetkych ${doc.products.length} navrhov proslo. Pripravene do reportu.`);
