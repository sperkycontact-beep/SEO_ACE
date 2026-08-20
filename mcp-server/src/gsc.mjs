/**
 * Google Search Console access for the local MCP server.
 *
 * OAuth installed-app flow: we spin a one-shot loopback listener, open the
 * consent screen in the user's browser, swap the code for a refresh token and
 * cache it under ~/.seo-ace/. Nothing leaves the machine except the calls to
 * Google itself.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';

const DIR = resolve(homedir(), '.seo-ace');
const TOKEN_PATH = resolve(DIR, 'gsc-token.json');
const CLIENT_PATH = resolve(DIR, 'gsc-client.json');
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function readJson(p) {
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
function writeJson(p, v) {
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(v, null, 2), { mode: 0o600 });
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

export function clientConfig() {
  const c = readJson(CLIENT_PATH);
  if (!c?.client_id) {
    throw new Error(
      `Chýba OAuth klient. Vytvorte ${CLIENT_PATH} s obsahom {"client_id":"...","client_secret":"..."}. ` +
        `Klienta typu "Desktop app" získate v Google Cloud Console → APIs & Services → Credentials, ` +
        `a v projekte zapnite "Google Search Console API".`
    );
  }
  return c;
}

/** Interactive consent. Returns once the refresh token is stored. */
export async function authorize({ port = 47820 } = {}) {
  const { client_id, client_secret } = clientConfig();
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });

  const code = await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const got = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>SEO ACE</title>` +
          `<body style="font:16px system-ui;padding:3rem;max-width:32rem;margin:auto">` +
          (err || !got
            ? `<h1>Prihlásenie zlyhalo</h1><p>${err ?? 'chýba kód'}</p>`
            : `<h1>Hotovo</h1><p>Search Console je pripojená. Toto okno môžete zavrieť.</p>`) +
          `</body>`
      );
      server.close();
      if (err || !got) return rejectPromise(new Error(err ?? 'OAuth: chýba code'));
      if (gotState !== state) return rejectPromise(new Error('OAuth: nesúhlasí state'));
      resolvePromise(got);
    });
    server.listen(port, '127.0.0.1', () => {
      if (!openBrowser(String(authUrl)))
        process.stderr.write(`Otvorte v prehliadači:\n${authUrl}\n`);
    });
    setTimeout(() => {
      server.close();
      rejectPromise(new Error('OAuth: časový limit 5 minút vypršal'));
    }, 300000).unref();
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error(`Token exchange zlyhal: ${JSON.stringify(tok)}`);
  writeJson(TOKEN_PATH, { ...tok, obtained_at: Date.now() });
  return { ok: true, scope: tok.scope, tokenPath: TOKEN_PATH };
}

async function accessToken() {
  const tok = readJson(TOKEN_PATH);
  if (!tok?.refresh_token)
    throw new Error('Nie ste prihlásený do Search Console. Spustite nástroj gsc_login.');
  const fresh = tok.access_token && Date.now() - tok.obtained_at < (tok.expires_in - 120) * 1000;
  if (fresh) return tok.access_token;

  const { client_id, client_secret } = clientConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const next = await res.json();
  if (!res.ok) throw new Error(`Obnova tokenu zlyhala: ${JSON.stringify(next)}`);
  writeJson(TOKEN_PATH, { ...tok, ...next, obtained_at: Date.now() });
  return next.access_token;
}

async function api(path, body) {
  const token = await accessToken();
  const res = await fetch(`https://searchconsole.googleapis.com/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GSC API ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

export const isAuthorized = () => !!readJson(TOKEN_PATH)?.refresh_token;

export function listSites() {
  return api('webmasters/v3/sites');
}

/** Search Analytics: the query-level truth about what a page actually ranks for. */
export function searchAnalytics({
  siteUrl,
  startDate,
  endDate,
  dimensions = ['query'],
  page,
  rowLimit = 250,
  searchType = 'web',
}) {
  const filters = page
    ? [{ filters: [{ dimension: 'page', operator: 'equals', expression: page }] }]
    : undefined;
  return api(`webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    startDate,
    endDate,
    dimensions,
    rowLimit,
    type: searchType,
    ...(filters ? { dimensionFilterGroups: filters } : {}),
  });
}

/** URL Inspection: is this URL actually indexed, and with which canonical? */
export function inspectUrl({ siteUrl, inspectionUrl, languageCode = 'sk-SK' }) {
  return api('v1/urlInspection/index:inspect', { siteUrl, inspectionUrl, languageCode });
}

export function submitSitemap({ siteUrl, feedpath }) {
  return accessToken().then((token) =>
    fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        siteUrl
      )}/sitemaps/${encodeURIComponent(feedpath)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => ({ ok: r.ok, status: r.status }))
  );
}

export { TOKEN_PATH, CLIENT_PATH };
