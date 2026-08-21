# Architektúra SEO ACE

## Problém, ktorý architektúra rieši

Tri obmedzenia, ktoré boli zistené pri prieskume 20. 8. 2026 a určujú celý návrh:

| Obmedzenie | Dôsledok |
|---|---|
| Cloudová Claude session má `www.sperky-eshop.sk` blokovaný egress proxy (`EGRESS_BLOCKED`) | Claude nemôže crawlovať e-shop priamo. Crawl musí bežať niekde inde. |
| Ahrefs API units vyčerpané (401 648 / 400 000, reset 29. 8. 2026) | Platené endpointy padajú. GSC endpointy sú zdarma a fungujú. |
| GitHub `schedule` cron beží iba na default branchi | Denný spúšťač nemôže byť `schedule` vo workflowe na feature branchi. |

## Tok dát

```
┌─ Claude Routine (cloudový cron, 05:23 UTC) ──────────────────────┐
│  1. dispatchne GitHub Actions workflow                            │
│  2. počká na dokončenie                                           │
│  3. git pull → prečíta data/products/<dátum>/                     │
│  4. Ahrefs MCP: gsc-pages, gsc-keywords (0 units)                 │
│  5. napíše SEO podľa docs/SEO_PLAYBOOK.md                         │
│  6. commit + PR + Artifact + Slack + Drive                        │
└───────────────────────────────────────────────────────────────────┘
             │ dispatch                        ▲ commit
             ▼                                 │
┌─ GitHub Actions (má prístup na web) ─────────────────────────────┐
│  select-batch.mjs  → data/queue.json                              │
│  crawl-batch.mjs   → data/products/<dátum>/*.json                 │
└───────────────────────────────────────────────────────────────────┘
             │ HTTPS
             ▼
        sperky-eshop.sk

┌─ Lokálny MCP server (tvoje PC) ──────────────────────────────────┐
│  Nezávislá cesta pre prácu na požiadanie:                         │
│  crawl_product, crawl_category, crawl_batch                       │
│  gsc_login (OAuth), gsc_queries_for_page, gsc_inspect             │
│  Nikdy nezapisuje do e-shopu.                                     │
└───────────────────────────────────────────────────────────────────┘
```

## Prečo dva crawlery

`scripts/lib/parse-product.mjs` je jeden parser, ktorý používa aj GitHub Actions,
aj lokálny MCP server. Rozdiel je len v tom, kto ho spustí:

- **GitHub Actions** — automatika. Beží aj keď máš PC vypnuté.
- **Lokálny MCP** — na požiadanie. Má navyše Search Console pod tvojím účtom
  (URL Inspection, presné query dáta) a vidí veci, ktoré verejný crawl nezachytí.

Keby jeden z nich vypadol, druhý pokryje prácu. Preto sú oba.

## Rozhodnutia a ich dôvody

**Prečo nie priamy zápis do PrestaShopu.** Bolo vedomé rozhodnutie
(`delivery.autoPublishToShop: false`). Každá dávka ide na schválenie. Znamená to
ručný krok, ale žiadna generovaná veta sa nedostane pred zákazníka bez toho, aby
si ju niekto prečítal.

**Prečo CTR krivka zo vlastných dát.** Generické benchmarky pre pozíciu 1 hovoria
28 %; tento e-shop má 27,7 % — blízko. Ale na pozícii 3 má 5,8 % namiesto
očakávaných 11 %. Keby sme použili generickú krivku, skóre by nadhodnotilo každý
produkt v top 5. Krivka je preto z `gsc-ctr-by-position` a prechádza izotonickým
vyhladením, aby lepšie umiestnená stránka nikdy nedostala nižší benchmark než
horšie umiestnená (surové dáta to porušujú, lebo pozície 16–19 majú 4–5 keywordov).

**Prečo `data/` v gite.** Crawl výstupy sú verzované schválne — pri každej zmene
SEO je vidieť, aký bol stav pred ňou. Diff v gite je audit trail.

## Čo sa stane 29. 8. 2026

Keď sa Ahrefs units obnovia, prepni v `config/seo-ace.config.json`:

```json
"paidEndpointsEnabled": true
```

Vtedy sa do workflow pridá: `keywords-explorer-overview` (objem, obtiažnosť),
`serp-overview` (čo robí konkurencia), `site-audit-page-explorer` (on-page dáta
z Ahrefs crawlu bez vlastného requestu na e-shop).

## Známe limity

- **Site Audit health score je 2/100** pri 9 792 URL s chybami. Denná dávka 5
  produktov je liečba symptómov; systémové chyby (duplicitné meta na tisícoch
  URL, parametrické URL v indexe) treba riešiť šablónou v PrestaShope, nie
  produkt po produkte. Toto je oddelená úloha.
- **Parametrické URL sa indexujú** — v GSC dátach sú stránky ako
  `/77-zlate-nausnice?p=1&ob=2&ow=1&os=0&pp=5-1035` s reálnymi impresiami.
  Kanibalizujú kategóriu. Patrí to do `robots.txt` alebo canonical pravidiel.
- **`/mobile/` URL sú v indexe** (napr. `/mobile/4077-...html`) — samostatná
  mobilná vetva, ktorá by tam už nemala byť.
