# SEO ACE

Denná SEO orchestrácia pre [sperky-eshop.sk](https://www.sperky-eshop.sk) —
5 produktov denne z kategórie **Zlaté náušnice**, s podkladom z Google Search
Console a Ahrefs.

## Ako to funguje

Každý deň sa vyberie 5 produktov s najvyššou premrhanou príležitosťou
(`impresie × rozdiel medzi očakávaným a reálnym CTR`), načíta sa ich aktuálny
stav z e-shopu, doplnia sa reálne vyhľadávacie dopyty zo Search Console a
vygeneruje sa kompletné SEO: meta title, meta description, H1, krátky a dlhý
popis, alt texty, JSON-LD a interné odkazy.

Nič sa nepublikuje automaticky. Každá dávka ide na schválenie.

## Štruktúra

```
config/seo-ace.config.json     centrálna konfigurácia — kategória, tón, rozsah, doručenie
docs/SEO_PLAYBOOK.md           pravidlá pre písanie (kontrakt, nie inšpirácia)
docs/ARCHITECTURE.md           prečo je to postavené takto
docs/KONZOLA.md                ovládacia konzola a front URL
docs/ROUTINE_SETUP.md          denný cron a jeho obmedzenie
scripts/lib/parse-product.mjs  parser PrestaShop stránok, bez závislostí
scripts/lib/ctr-benchmark.mjs  CTR krivka z vlastných GSC dát + izotonické vyhladenie
scripts/lib/classify.mjs       rýdzosť, tvar, motív a slovenský názov zo slugu
scripts/select-batch.mjs       výber dennej dávky
scripts/crawl-batch.mjs        crawl dávky
scripts/process-queue.mjs      spracovanie frontu URL z konzoly
scripts/build-registry.mjs     evidencia produktov a log udalostí
scripts/validate-seo.mjs       vynucuje playbook na návrhoch
scripts/build-console.mjs      generuje ovládaciu konzolu
scripts/build-report.mjs       generuje markdown report
mcp-server/                    lokálny MCP server — 11 nástrojov, crawl + GSC OAuth
data/registry.json             evidencia produktov (záznam pravdy)
data/log.jsonl                 log udalostí
data/url-queue.json            front URL na spracovanie
data/queue.json                fronta dávok a história
data/products/<dátum>/         crawlnuté rozbory stránok
reports/console.html           ovládacia konzola
.github/workflows/             denný crawl, front a evidencia
```

## Ovládacia konzola

Jedna trvalá adresa: **https://claude.ai/code/artifact/fe0e63ef-b770-4156-8e5f-c2bf53a34ebe**

Päť záložiek — Dávka, Evidencia (69 produktov), Log, Front URL, Nastavenia.
Podrobne v [docs/KONZOLA.md](docs/KONZOLA.md).

Front URL funguje na zavolanie: vložíš adresu v konzole, napíšeš „spracuj front"
a pipeline ju načíta, urobí diagnostiku a doplní dopyty zo Search Console.

## Prvé spustenie

### 1. Lokálny MCP server

```bash
# macOS / Linux
bash mcp-server/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File mcp-server\install.ps1
```

Inštalátor overí Node 20+, spustí selftest (9 testov) a zaregistruje server
v Claude Code.

### 2. Search Console

1. V [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   vytvor OAuth klienta typu **Desktop app** a v projekte zapni
   **Google Search Console API**.
2. Vlož `client_id` a `client_secret` do `~/.seo-ace/gsc-client.json`
   (na Windows `%USERPROFILE%\.seo-ace\gsc-client.json`).
3. V Claude Code spusti nástroj `gsc_login` — otvorí prehliadač, prihlásiš sa,
   token sa uloží lokálne s právami `600`.

Token neopustí tvoj počítač.

### 3. Overenie

```bash
node mcp-server/selftest.mjs      # protokol MCP servera, 11 testov
node scripts/select-batch.mjs     # výber dávky z GSC snapshotu
node scripts/build-registry.mjs   # evidencia a log
node scripts/validate-seo.mjs     # návrhy proti playbooku
node scripts/process-queue.mjs    # front URL (potrebuje prístup na web)
```

## Denný beh

Spúšťač je Claude Routine v cloude (nie GitHub `schedule` — ten beží iba na
default branchi). Routine dispatchne workflow, počká na crawl, prečíta dáta a
napíše SEO.

Ručne kedykoľvek:

```bash
node scripts/select-batch.mjs && node scripts/crawl-batch.mjs
```

Alebo z Claude Code cez lokálny MCP: `crawl_batch`.

## Stav dátových zdrojov

| Zdroj | Stav | Poznámka |
|---|---|---|
| Ahrefs GSC endpointy | funkčné | 0 API units, hlavný zdroj dopytov |
| Ahrefs platené endpointy | **vyčerpané do 29. 8. 2026** | 401 648 / 400 000 units |
| Ahrefs Site Audit | crawl z 1. 8. 2026 | health score 2/100, 9 792 URL s chybami |
| GSC priamo (OAuth) | po `gsc_login` | query dáta + URL Inspection |
| Crawl e-shopu | GitHub Actions + lokálny MCP | Claude cloud má doménu blokovanú |
