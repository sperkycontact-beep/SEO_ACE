/**
 * PrestaShop product page parser — zero dependencies.
 * Extracts everything the SEO pass needs from raw HTML.
 */

const decodeEntities = (s = '') =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

const stripTags = (s = '') =>
  decodeEntities(
    s
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : null;
};

function metaContent(html, key, kind = 'name') {
  const re = new RegExp(`<meta[^>]+${kind}\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re);
  return tag ? attr(tag[0], 'content') : null;
}

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      /* PrestaShop themes sometimes emit invalid JSON-LD — that is itself a finding */
      out.push({ __invalid: true, raw: m[1].slice(0, 300) });
    }
  }
  return out;
}

function findType(blocks, type) {
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const t = b['@type'];
    if (t === type || (Array.isArray(t) && t.includes(type))) return b;
    if (Array.isArray(b['@graph'])) {
      const hit = findType(b['@graph'], type);
      if (hit) return hit;
    }
  }
  return null;
}

function images(html, baseUrl) {
  const seen = new Map();
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = attr(tag, 'data-full-size-image-url') || attr(tag, 'data-src') || attr(tag, 'src');
    if (!src || src.startsWith('data:')) continue;
    let abs;
    try {
      abs = new URL(src, baseUrl).href;
    } catch {
      continue;
    }
    // product photos on PrestaShop live under /<digits>-<type>/... or /img/p/
    if (!/\/img\/p\/|-home_default|-large_default|-cart_default|-medium_default/.test(abs)) continue;
    const key = abs.replace(/-(home|large|cart|medium|small)_default/, '');
    if (seen.has(key)) continue;
    seen.set(key, {
      url: abs,
      alt: attr(tag, 'alt') ?? '',
      title: attr(tag, 'title') ?? null,
      hasAlt: !!(attr(tag, 'alt') || '').trim(),
      fileName: abs.split('/').pop(),
    });
  }
  return [...seen.values()];
}

function headings(html) {
  const grab = (n) => {
    const out = [];
    const re = new RegExp(`<h${n}\\b[^>]*>([\\s\\S]*?)<\\/h${n}>`, 'gi');
    let m;
    while ((m = re.exec(html))) {
      const t = stripTags(m[1]);
      if (t) out.push(t);
    }
    return out;
  };
  return { h1: grab(1), h2: grab(2), h3: grab(3) };
}

function breadcrumb(blocks) {
  const bc = findType(blocks, 'BreadcrumbList');
  if (!bc || !Array.isArray(bc.itemListElement)) return [];
  return bc.itemListElement
    .map((i) => ({ name: i.name ?? i.item?.name ?? null, url: i.item?.['@id'] ?? i.item ?? null }))
    .filter((i) => i.name);
}

function internalLinks(html, baseUrl) {
  const host = new URL(baseUrl).host.replace(/^www\./, '');
  const counts = new Map();
  const re = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[2] ?? m[3] ?? '');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.host.replace(/^www\./, '') !== host) continue;
    const anchor = stripTags(m[4]);
    if (!anchor) continue;
    const key = abs.pathname;
    const rec = counts.get(key) || { path: key, anchors: new Set(), count: 0 };
    rec.anchors.add(anchor);
    rec.count += 1;
    counts.set(key, rec);
  }
  return [...counts.values()]
    .map((r) => ({ path: r.path, count: r.count, anchors: [...r.anchors].slice(0, 4) }))
    .sort((a, b) => b.count - a.count);
}

/** Text of the PrestaShop description blocks, kept separate from chrome. */
function descriptions(html) {
  const pick = (re) => {
    const m = html.match(re);
    return m ? stripTags(m[1]) : null;
  };
  const short =
    pick(/<div[^>]+id=["']product-description-short[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    metaContent(html, 'og:description', 'property');
  const long =
    pick(/<div[^>]+class=["'][^"']*product-description[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
    pick(/<div[^>]+id=["']description["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  return { short, long };
}

function features(html) {
  const out = [];
  const block = html.match(/<section[^>]+class=["'][^"']*product-features[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  const src = block ? block[1] : html;
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = re.exec(src))) {
    const k = stripTags(m[1]).replace(/:$/, '');
    const v = stripTags(m[2]);
    if (k && v) out.push({ name: k, value: v });
  }
  return out;
}

export function parseProduct(html, url) {
  const blocks = jsonLdBlocks(html);
  const product = findType(blocks, 'Product');
  const offer = product?.offers
    ? Array.isArray(product.offers)
      ? product.offers[0]
      : product.offers
    : null;
  const h = headings(html);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
  const desc = descriptions(html);
  const canonical = (() => {
    const t = html.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i);
    return t ? attr(t[0], 'href') : null;
  })();
  const robots = metaContent(html, 'robots');

  return {
    url,
    fetchedAt: new Date().toISOString(),
    productId: (url.match(/\/(\d+)-/) || [, null])[1],
    slug: (url.match(/\/\d+-([^/]+?)\.html/) || [, null])[1],
    current: {
      title: stripTags(title),
      titleLength: stripTags(title).length,
      metaDescription: metaContent(html, 'description'),
      metaDescriptionLength: (metaContent(html, 'description') || '').length,
      canonical,
      robots,
      h1: h.h1,
      h1Count: h.h1.length,
      h2: h.h2.slice(0, 15),
      h3: h.h3.slice(0, 15),
      shortDescription: desc.short,
      longDescription: desc.long,
      longDescriptionWords: desc.long ? desc.long.split(/\s+/).filter(Boolean).length : 0,
      og: {
        title: metaContent(html, 'og:title', 'property'),
        description: metaContent(html, 'og:description', 'property'),
        image: metaContent(html, 'og:image', 'property'),
        type: metaContent(html, 'og:type', 'property'),
      },
      images: images(html, url),
      imagesMissingAlt: images(html, url).filter((i) => !i.hasAlt).length,
      features: features(html),
      breadcrumb: breadcrumb(blocks),
      internalLinks: internalLinks(html, url).slice(0, 40),
      jsonLd: {
        typesPresent: blocks
          .map((b) => (Array.isArray(b?.['@type']) ? b['@type'].join('|') : b?.['@type']))
          .filter(Boolean),
        hasProduct: !!product,
        hasBreadcrumb: !!findType(blocks, 'BreadcrumbList'),
        invalidBlocks: blocks.filter((b) => b?.__invalid).length,
        product: product
          ? {
              name: product.name ?? null,
              sku: product.sku ?? product.mpn ?? null,
              brand: product.brand?.name ?? product.brand ?? null,
              description: product.description ?? null,
              image: product.image ?? null,
              price: offer?.price ?? null,
              priceCurrency: offer?.priceCurrency ?? null,
              availability: offer?.availability ?? null,
              aggregateRating: product.aggregateRating ?? null,
              hasWeight: !!product.weight,
              weight: product.weight?.value ?? product.weight ?? null,
            }
          : null,
      },
    },
    diagnostics: buildDiagnostics({ title: stripTags(title), html, h, desc, blocks, product, url }),
  };
}

function buildDiagnostics({ title, html, h, desc, product, url }) {
  const d = [];
  const md = metaContent(html, 'description');
  if (!title) d.push({ level: 'error', code: 'title_missing', msg: 'Stránka nemá <title>.' });
  else if (title.length > 60)
    d.push({ level: 'warn', code: 'title_too_long', msg: `Title má ${title.length} znakov, Google odreže nad ~60.` });
  else if (title.length < 30)
    d.push({ level: 'warn', code: 'title_too_short', msg: `Title má len ${title.length} znakov — nevyužitý priestor.` });
  if (!md) d.push({ level: 'error', code: 'meta_desc_missing', msg: 'Chýba meta description — Google si vyberie text sám.' });
  else if (md.length > 160)
    d.push({ level: 'warn', code: 'meta_desc_too_long', msg: `Meta description má ${md.length} znakov.` });
  else if (md.length < 100)
    d.push({ level: 'warn', code: 'meta_desc_too_short', msg: `Meta description má len ${md.length} znakov.` });
  if (h.h1.length === 0) d.push({ level: 'error', code: 'h1_missing', msg: 'Stránka nemá H1.' });
  if (h.h1.length > 1)
    d.push({ level: 'warn', code: 'h1_multiple', msg: `Stránka má ${h.h1.length} H1 nadpisov, má byť jeden.` });
  const words = desc.long ? desc.long.split(/\s+/).filter(Boolean).length : 0;
  if (words < 120)
    d.push({ level: 'warn', code: 'thin_content', msg: `Popis produktu má ${words} slov — tenký obsah.` });
  if (!product) d.push({ level: 'error', code: 'jsonld_product_missing', msg: 'Chýba JSON-LD Product schema — žiadne rich snippets.' });
  else {
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (!offer?.price) d.push({ level: 'warn', code: 'jsonld_no_price', msg: 'JSON-LD Product bez ceny.' });
    if (!offer?.availability) d.push({ level: 'warn', code: 'jsonld_no_availability', msg: 'JSON-LD Product bez availability.' });
  }
  const imgs = images(html, url);
  const noAlt = imgs.filter((i) => !i.hasAlt).length;
  if (noAlt) d.push({ level: 'warn', code: 'img_alt_missing', msg: `${noAlt} z ${imgs.length} obrázkov bez alt textu.` });
  return d;
}

export { stripTags, metaContent, jsonLdBlocks };
