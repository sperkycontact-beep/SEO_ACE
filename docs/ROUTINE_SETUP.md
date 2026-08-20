# Denný cron — čo funguje a čo treba dokončiť

## Stav

Routine je vytvorená a beží:

| | |
|---|---|
| ID | `trig_01HSnCqkkDMwMFSNuC9r4JjM` |
| Názov | SEO ACE — denná dávka zlatých náušníc |
| Cron | `23 5 * * *` UTC (07:23 CEST / 06:23 CET) |
| Prvý beh | 21. 8. 2026, 05:23 UTC |
| Notifikácie | push na telefón po každom behu |
| Režim | nová session pri každom spustení |

## Problém, ktorý treba doriešiť

Pri vytváraní Routine vrátil server toto varovanie:

> this trigger stores no MCP connectors, so the sessions it fires will run without
> connector (`mcp__<server>__*`) tools

Znamená to, že denné sessions **nebudú mať Ahrefs, Slack ani GitHub nástroje**.
Routine vytvorená z tejto session nemôže konektory pripojiť — smie ich len zdediť,
a táto session ich nemá v prenosnej podobe.

### Čo denný beh zvládne aj tak

- prečíta repozitár a nastavenia z konzoly,
- vygeneruje SEO z poslednej commitnutej GSC snapshoty,
- commitne a pushne,
- publikuje konzolu ako Artifact.

### Čo bez konektorov nezvládne

- vytiahnuť **svieže** GSC dáta z Ahrefs,
- dispatchnúť GitHub Actions crawl,
- poslať súhrn do Slacku.

Aby denná dávka nebežala tichom na starých dátach, `scripts/select-batch.mjs`
skončí s chybou, keď je snapshot starší než `prioritisation.maxSnapshotAgeDays`
(predvolene 7 dní). Radšej hlasné zlyhanie než nepravdivý report.

## Oprava — jeden krok

Vytvor Routine znova v **claude.ai → Routines**, kde sa konektory pripájajú
priamo. Nastavenia:

- **Cron:** `23 5 * * *` (UTC)
- **Režim:** nová session pri každom spustení
- **Konektory:** Ahrefs, Slack, GitHub, Google Drive
- **Prompt:** obsah nižšie

Potom starú Routine vypni alebo zmaž (`trig_01HSnCqkkDMwMFSNuC9r4JjM`), aby
dávka nebežala dvakrát.

## Prompt pre Routine

```
Denná SEO dávka pre sperky-eshop.sk, kategória Zlaté náušnice. Pracuj
v repozitári sperkycontact-beep/SEO_ACE na branchi
claude/sperky-eshop-seo-workflow-sg70xu. Prečítaj si najprv README.md,
docs/ARCHITECTURE.md a docs/SEO_PLAYBOOK.md — playbook je kontrakt, nie
inšpirácia.

1. Skontroluj nastavenia z konzoly. Predchádzajúca dávka publikovala ovládaciu
   konzolu ako Artifact. Zisti jej URL cez Artifact s action: "list", prečítaj
   ju cez WebFetch a rešpektuj, čo v nej používateľ zmenil: počet produktov
   denne, kategóriu, prioritu výberu, tón, doručovacie kanály a stavy
   schválenia z predchádzajúcej dávky. Zamietnuté produkty nezaraďuj znova.

2. Vytiahni GSC dáta cez Ahrefs MCP, projekt 9364794, posledných 90 dní
   s trojdňovým odstupom. gsc-pages s filtrom
   {"field":"url","is":["substring","zlate-nausnice"]} do
   data/gsc/pages-latest.json. GSC endpointy nespotrebúvajú API units.

3. Over subscription-info-limits-and-usage. Ak sú units a v konfigurácii je
   paidEndpointsEnabled: true, obohať dávku o keywords-explorer-overview
   a serp-overview. Ak nie, pokračuj len z GSC a napíš to do reportu —
   nepredstieraj dáta, ktoré nemáš.

4. node scripts/select-batch.mjs

5. Crawl produktov: cloudová session má domény blokované egress proxy. Skús
   mcp__github__actions_run_trigger run_workflow na daily-crawl.yml, ref
   claude/sperky-eshop-seo-workflow-sg70xu. Ak vráti 404, workflow nie je na
   default branchi — napíš to ako blokujúce a pokračuj bez crawl dát. Po
   úspechu počkaj, git pull a prečítaj data/products/<dátum>/.

6. Napíš SEO podľa playbooku: meta title, H1, meta description, krátky a dlhý
   popis, alt texty pre každú fotku, JSON-LD Product a BreadcrumbList, 3–5
   interných odkazov. Podklad sú reálne dopyty z gsc-keywords s filtrom na
   konkrétnu URL, nie odhady. Nikdy netvrdi nič, čo nie je v crawlnutých
   dátach; čo chýba, daj do needsVerification. Nikdy nevymýšľaj
   aggregateRating. Ulož do data/proposals/<dátum>.json.

7. node scripts/validate-seo.mjs data/proposals/<dátum>.json musí prejsť.
   Ak neprejde, oprav návrhy — nie validátor.

8. node scripts/build-console.mjs <dátum> a node scripts/build-report.mjs <dátum>

9. Commitni a pushni. Publikuj konzolu cez Artifact s
   capabilities: {"artifact": {}} a favicon 💠. Pošli súhrn do Slack kanála
   C0BM727RRDJ (#seo-daily-sperky): rozsah dávky, tabuľka piatich produktov,
   dve až tri najdôležitejšie zistenia, odkaz na konzolu. Buď konkrétny.

Vždy platí: do e-shopu sa nezapisuje nič, každá dávka ide na schválenie.
Slovenčina s úplnou diakritikou, vykanie. Ak niečo blokuje prácu, dokonči
všetko ostatné a jasne napíš, čo si nedokončil a prečo.
```

## Druhá vec, ktorá blokuje denný crawl

`.github/workflows/daily-crawl.yml` sa nedá dispatchnúť, kým nie je na default
branchi (`claude/epic-curie-i4n6t2`) — GitHub API vracia 404 a `schedule` cron
na feature branchi nefiguruje vôbec. **Merge PR #1 to odblokuje.**

Do vtedy dáva crawl produktov lokálny MCP server: v Claude Code spusti nástroj
`crawl_batch`.
