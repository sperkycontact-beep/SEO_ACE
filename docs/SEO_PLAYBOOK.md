# SEO Playbook — sperky-eshop.sk

Pravidlá, podľa ktorých sa píše každá denná dávka. Toto nie je inšpirácia, toto je
kontrakt: čo nesplní tieto pravidlá, nejde do reportu.

## 1. Východisko: dopyt, nie fantázia

Každý návrh vychádza z reálnych dopytov v Search Console pre **konkrétnu URL**,
nie z toho, čo si myslíme, že ľudia hľadajú. Zdroj v tomto poradí:

1. `gsc_queries_for_page` (lokálny MCP) alebo Ahrefs `gsc-keywords` s filtrom na URL.
2. Ahrefs `keywords-explorer` pre objem a obtiažnosť — **až po 29. 8. 2026**, kým sa
   neobnovia API units.
3. `serp-overview` pre to, čo robí konkurencia — takisto po resete units.

Ak pre URL nie sú dopyty, produkt do dávky nepatrí. Selektor ho vyradí sám
(`minImpressions: 50`).

## 2. Meta title (45–60 znakov)

Vzorec: `<Typ produktu> <rýdzosť> <rozlišovací znak> | <značka>`

- Primárny dopyt patrí do prvých 40 znakov — Google zvýrazňuje zhodu a mobilný
  SERP ostatné odreže.
- **Rýdzosť je nutná**, keď ju poznáme: `14k`, `585`, `9k`, `375`, `18k`, `750`.
  Ľudia ju do vyhľadávania píšu (`zlate nausnice 585`, `zlate nausnice kruhy 14k`)
  a v SERP funguje ako dôkaz pravosti.
- Bez cien, bez „NAJLEPŠIE", bez výkričníkov, bez `KÚPIŤ TU`.
- Duplicitu riešime rozlišovacím znakom: rozmer (`10 mm`), tvar (`kruhy`,
  `puzetky`), kameň (`zirkón`, `rubín`, `perleť`), farba zlata (`biele zlato`).

## 3. Meta description (130–155 znakov)

Musí obsahovať, v tomto poradí dôležitosti:

1. **Rozlišovací fakt** — rozmer, hmotnosť, typ zapínania, kameň.
2. **Dôvod kliknúť** — na čo sa nosí, komu sa daruje.
3. **Signál dôvery** — rýdzosť s puncom, výmena alebo balenie, ak je overené v dátach.

Zákazy: cena (mení sa a v SERP zastará), sľuby o doručení, ktoré nemáme z dát
produktu, a nezmyselné opakovanie kľúčového slova.

Description nie je ranking faktor — je to reklamný text. Pri CTR 0,45 % v kategórii
je toto najvýnosnejšia veta na celej stránke.

## 4. H1 (max 70 znakov)

- Presne jeden H1 na stránke.
- Ľudský názov produktu, nie kópia title. Bez značky — tú už nesie hlavička.
- H2 rozdeľujú popis na `Materiál a rýdzosť`, `Rozmery a zapínanie`,
  `Pre koho a na akú príležitosť`, `Starostlivosť`.

## 5. Krátky popis (25–45 slov)

Jedna veta o tom, čo to je, jedna o tom, komu to sadne. Zobrazuje sa v košíku
a vo výpise kategórie, takže musí fungovať aj sám, bez fotky.

## 6. Dlhý popis (200–400 slov)

Štruktúra, ktorá odpovedá na to, čo ľudia naozaj hľadajú:

| Sekcia | Čo tam patrí |
|---|---|
| Úvod (2–3 vety) | Čo to je, primárny dopyt prirodzene v prvej vete. |
| Materiál a rýdzosť | 585/14k = 58,5 % zlata, punc, farba zlata. |
| Rozmery a zapínanie | mm, hmotnosť, puzetka / francúzsky zámok / kĺbové. |
| Pre koho a kedy | Vek, príležitosť, typ outfitu. |
| Starostlivosť | Čistenie, čo zlatu škodí, kedy šperk odložiť. |

Pravidlá: žiadny odsek dlhší než 4 vety, žiadna veta dlhšia než 25 slov, kľúčové
slovo prirodzene 2–4× v celom texte. Keď sa dá vetu skrátiť bez straty informácie,
skráti sa.

## 7. Alt texty (max 125 znakov)

Vzorec: `<Typ> <rýdzosť> <rozlišovací znak> — <čo je na fotke>`

Príklad: `Zlaté náušnice 14k zatočené kruhy — detail povrchu z profilu`

- Každá fotka iný alt. Rovnaký alt na piatich fotkách je horší než žiadny.
- Nikdy nezačínať `obrázok` alebo `foto`.
- Šperky sú vizuálna kategória — Google Images je reálny zdroj návštev, nie bonus.

## 8. JSON-LD

`Product` musí mať: `name`, `image`, `description`, `sku`, `brand`, `offers`
(s `price`, `priceCurrency: "EUR"`, `availability`), `material`, a keď je známa,
`weight`.

`BreadcrumbList` musí kopírovať skutočnú navigáciu: `Domov → Zlato → Zlaté
náušnice → Produkt`.

**Nikdy** nevymýšľať `aggregateRating` ani `review`. Falošné hodnotenia sú
porušenie Google pravidiel pre štruktúrované dáta a vedú k manuálnej penalizácii.
Rating ide do schémy len vtedy, keď reálne existujú hodnotenia v e-shope.

## 9. Interné odkazy (3–5 na produkt)

- 1× nadradená kategória (`/77-zlate-nausnice`) s anchorom podľa dopytu.
- 1–2× najbližšia podkategória (`/94-zlate-nausnice-kruhy`, `/92-damske-zlate-nausnice`).
- 1–2× komplementárny produkt — v praxi náhrdelník alebo prívesok v rovnakej
  rýdzosti, na tvorbu setu.

Anchor text je popisný a rôzny. Päť odkazov s anchorom „tu" nemá žiadnu hodnotu.

## 10. Kontrola pred odoslaním

Návrh sa nedostane do reportu, kým neprejde všetkým:

- [ ] Title 45–60 znakov, primárny dopyt v prvých 40
- [ ] Description 130–155 znakov, bez ceny a bez sľubov o doručení
- [ ] Presne jeden H1, odlišný od title
- [ ] Dlhý popis 200–400 slov, štruktúrovaný podľa tabuľky
- [ ] Každá fotka má vlastný alt text
- [ ] JSON-LD validné, bez vymysleného ratingu
- [ ] 3–5 interných odkazov s popisnými anchormi
- [ ] Diakritika všade správna, vykanie dodržané
- [ ] Žiadne tvrdenie, ktoré nie je v crawlnutých dátach produktu
