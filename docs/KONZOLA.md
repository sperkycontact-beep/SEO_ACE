# Ovládacia konzola

Jedna trvalá adresa: **https://claude.ai/code/artifact/fe0e63ef-b770-4156-8e5f-c2bf53a34ebe**

Konzola je live dokument. Čo v nej prepneš, sa uloží do dokumentu a ja to načítam
pri ďalšom behu. Chip *„zmeny sa ukladajú"* v záložke Evidencia hovorí pravdu —
keď ukladanie nefunguje, napíše to namiesto toho.

## Päť záložiek

| Záložka | Čo tam je |
|---|---|
| **Dávka** | Dnešných 5 produktov s návrhmi, meračmi dĺžok, tlačidlami kopírovania a schvaľovaním |
| **Evidencia** | Celá kategória, 69 produktov. Filtre, hromadné akcie, CSV export |
| **Log** | Behy pipeline, zásahy, zmeny metrík, požiadavky z frontu |
| **Front URL** | Vložíš URL, pridá sa do frontu. Spracuje sa na zavolanie |
| **Nastavenia** | Počet produktov denne, kategória, priorita, tón, doručenie, meranie |

Prepínanie záložiek, filtre, hľadanie a označovanie riadkov sú **per-viewer** —
nikoho iného neovplyvnia. Stavy schválenia, dátumy nasadenia, poznámky, front
a nastavenia sú **spoločné** a čítam ich.

## Front URL — ako to funguje na zavolanie

1. V záložke **Front URL** vložíš adresu z `sperky-eshop.sk` a dáš *Pridať do frontu*.
   Prijímam produkt, kategóriu, blog aj statickú stránku — parser typ rozpozná sám.
   Cudzie domény konzola odmietne.
2. Riadok sa uloží so stavom **Čaká**.
3. Napíšeš mi **„spracuj front"**. Vtedy:
   - prečítam konzolu a vyzbieram čakajúce URL,
   - zapíšem ich do `data/url-queue.json`,
   - spustím `scripts/process-queue.mjs` tam, kde je web dostupný — v GitHub Actions
     (`queue_only: true`) alebo cez lokálny MCP nástroj `queue_process`,
   - výsledok je diagnostika: dĺžky title a meta description, počet H1, počet slov,
     obrázky bez alt textu, prítomnosť JSON-LD, kód produktu, cena a dostupnosť,
   - doplním dopyty zo Search Console pre tú URL.
4. Kompletné SEO nepíšem automaticky. Keď ho chceš, povieš „napíš SEO pre 40226"
   a napíšem ho podľa playbooku z už načítaných dát, bez ďalšieho requestu.

Fetch nerobí prehliadač — robí ho pipeline. Tvoje PC nemusí byť zapnuté.

## Evidencia

Riadok = jeden produkt s aktuálnym stavom. História je v záložke Log, oddelene.

**Filtre:** textové hľadanie v názve, kóde a URL; stav; len nenasadené; rýdzosť;
minimálne impresie; maximálne CTR.

**Hromadné akcie** nad označenými riadkami: schváliť, zamietnuť, vrátiť na čaká,
označiť ako nasadené, zaradiť do frontu, export do CSV.

**Stavy sú tri** — čaká, schválené, zamietnuté. Nasadenie nie je štvrtý stav, ale
samostatný stĺpec s dátumom. Dátum nasadenia spustí meranie výsledku.

**Čo čaká na crawl:** kód produktu (pole `reference` z PrestaShopu), on-page
diagnostika, cena, dostupnosť a hmotnosť. Do vtedy sú prázdne — nie vymyslené.

## CSV export

Bodkočiarka ako oddeľovač a UTF-8 s BOM, aby sa súbor v slovenskom Exceli otvoril
dvojklikom a diakritika zostala správna. Stĺpce: ID, kód, názov, rýdzosť, tvar,
motív, kameň, impresie, kliky, CTR, pozícia, premrhané kliky, stav, nasadené,
poznámka, URL.

## Meranie výsledku

Keď označíš riadky ako nasadené, uloží sa dátum. Po **14 a 28 dňoch** sa metriky
porovnajú so stavom pred zmenou a rozdiel sa zapíše do logu. Dva body stačia na
rozlíšenie skutočného efektu od šumu a 28 dní je dosť na to, aby Google zmenu
spracoval.

## Kde žijú dáta

Konzola je zobrazenie. Záznam pravdy je v gite:

| Súbor | Obsah |
|---|---|
| `data/registry.json` | evidencia, 69 produktov |
| `data/log.jsonl` | log udalostí, jeden JSON na riadok |
| `data/url-queue.json` | front URL |
| `data/proposals/<dátum>.json` | validované návrhy dávky |
| `data/gsc/pages-latest.json` | GSC snapshot |
| `data/products/<dátum>/` | crawlnuté rozbory stránok |

Každá zmena má commit a autora. Konzolu prepíše `node scripts/build-console.mjs`.
