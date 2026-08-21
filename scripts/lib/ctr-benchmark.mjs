/**
 * CTR benchmark for sperky-eshop.sk.
 *
 * Source: Ahrefs gsc-ctr-by-position for project 9364794, 2026-05-20..2026-08-18.
 * The raw curve is non-monotonic because high positions have very few keywords
 * (position 16 shows 11.8% off 5 keywords). We keep only buckets with enough
 * keywords to mean anything, then enforce a non-increasing curve so a page can
 * never be told it should out-CTR a better-ranked page.
 */

const OBSERVED = [
  // [position, ctr%, keywordCount]
  [1, 27.73, 34], [2, 13.22, 83], [3, 5.80, 109], [4, 7.45, 107], [5, 5.33, 115],
  [6, 4.42, 116], [7, 3.20, 91], [8, 4.17, 76], [9, 2.34, 76], [10, 3.37, 65],
  [11, 2.39, 39], [12, 3.02, 17], [13, 3.36, 21], [14, 1.60, 9], [15, 0.79, 3],
];

const MIN_KEYWORDS = 20;

/** Industry fallback for positions the site has too little data for. */
const FALLBACK = { 16: 1.3, 17: 1.2, 18: 1.1, 19: 1.0, 20: 0.9 };
const TAIL = 0.5; // position 21+

function buildCurve() {
  const curve = new Map();
  for (const [pos, ctr, n] of OBSERVED) {
    if (n >= MIN_KEYWORDS) curve.set(pos, ctr);
  }
  // Fill gaps by linear interpolation between known anchors.
  const known = [...curve.keys()].sort((a, b) => a - b);
  for (let p = known[0]; p <= known[known.length - 1]; p++) {
    if (curve.has(p)) continue;
    const lo = known.filter((k) => k < p).pop();
    const hi = known.find((k) => k > p);
    const t = (p - lo) / (hi - lo);
    curve.set(p, curve.get(lo) + t * (curve.get(hi) - curve.get(lo)));
  }
  for (const [p, v] of Object.entries(FALLBACK)) curve.set(+p, v);

  // Isotonic pass: enforce non-increasing CTR as position worsens.
  const positions = [...curve.keys()].sort((a, b) => a - b);
  let ceiling = Infinity;
  for (const p of positions) {
    const v = Math.min(curve.get(p), ceiling);
    curve.set(p, v);
    ceiling = v;
  }
  return curve;
}

const CURVE = buildCurve();

/** Expected CTR (%) at a fractional average position. */
export function expectedCtr(position) {
  if (!(position > 0)) return 0;
  if (position >= 21) return TAIL;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  const a = CURVE.get(lo) ?? TAIL;
  const b = CURVE.get(hi) ?? TAIL;
  if (lo === hi) return a;
  return a + (position - lo) * (b - a);
}

/**
 * Opportunity score: how many clicks per period the page is leaving on the
 * table given where it already ranks. This is the number that decides the
 * daily batch — it deliberately favours pages Google already shows.
 */
export function opportunity({ impressions, ctr, position }) {
  const expected = expectedCtr(position);
  const gapPp = Math.max(0, expected - (ctr ?? 0));
  const missedClicks = (impressions * gapPp) / 100;
  return {
    expectedCtrPercent: +expected.toFixed(2),
    actualCtrPercent: +(ctr ?? 0).toFixed(2),
    ctrGapPp: +gapPp.toFixed(2),
    missedClicks: +missedClicks.toFixed(1),
    score: +missedClicks.toFixed(1),
  };
}

export { CURVE as ctrCurve };
