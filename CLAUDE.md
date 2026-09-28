# Calorietracker

Persoonlijke calorietracker van Marloes, als PWA op haar Android-telefoon. Alleen voor haarzelf.

## Opzet

- Statische webapp in `docs/`, zonder buildstap: `index.html`, `app.css`, `app.js` (dagboek, schermen,
  opslag, doelen), `scan.js` (barcode en etiket-OCR), `sw.js` (offline), `manifest.webmanifest`.
- Draait op GitHub Pages: https://marloes-prog.github.io/calorietracker/ (repo `marloes-prog/calorietracker`,
  publiek; Pages vanuit `main` / `docs`).
- Alle eetgegevens staan in `localStorage` op de telefoon (`calorietracker.v1`). Geen server, geen account.
  Back-up gaat via Profiel > Back-up downloaden.

## Afspraken

- Bewust geen extra's: geen water, stappen of beweging. Alleen eten toevoegen. Garmin-koppeling en een
  regel "Beweging vandaag" zijn op 2026-09-28 besproken en afgewezen; beweging zit alleen in de activiteitsfactor.
- Design naar Yazio: lichte kaarten, grote kcal-ring, macrobalkjes, Nunito.
- Etiket scannen gebeurt met gratis OCR (Tesseract.js via jsDelivr), niet met een betaalde API.
- Dagdoel wordt berekend (Mifflin-St Jeor x activiteit + doel), met eigen doel als overschrijving.
- "Vaak bij [maaltijd]" en "Vaak samen met" worden afgeleid uit het dagboek zelf (minstens twee keer),
  niet apart bijgehouden. Zo werkt het meteen met oude gegevens.
- Maaltijden (`S.recipes`): één regel in het dagboek met de ingrediënten erin. Aanpassen geldt voor die ene
  keer; alleen met het vinkje gaat het ook in de opgeslagen maaltijd. Zo wilde Marloes het.
- Marloes kent voedingswaarden niet altijd per 100 g. Het productformulier vraagt daarom "per [hoeveelheid]
  [gram/ml/stuk]"; intern wordt omgerekend naar per 100 (`f.ref` onthoudt wat ze invulde). Eenheid "stuk"
  (gekookt ei = 70 kcal) bewaart waarden per 100 stuks, zodat alle sommen gelijk blijven.
- Bij elk product kan ze in het portiescherm zelf een eenheid toevoegen ("stuk (120 g)").
- Een bewaarde hoeveelheid (`food.last`, of een dagboekregel) wordt alleen hergebruikt als die nog past bij
  de eenheid van het product (`fits()`). Anders werd na omzetten van gram naar stuk "2 × snee (35 g)" 70 stuks
  (tijgerbrood 6300 kcal, 2026-09-28).
- Een product aanpassen werkt overal door (alle dagboekregels en opgeslagen maaltijden met die `foodId`).
  Marloes: "een bestaand product wil ik gewoon kunnen aanpassen". Bij gram naar stuk worden porties stuks
  (2 sneetjes = 2 stuks) en een hoeveelheid in gram 1 stuk. Dagboekregels van maaltijden blijven zoals ze waren.
- Updates: de app vraagt bij elke keer openen om een nieuwe service worker en herlaadt dan zelf. Versie staat
  onderaan in Profiel (`APP_VERSION` in app.js, gelijk houden met `VERSION` in sw.js).
- Het veld "Per" in het productformulier zegt waarvoor de waarden gelden, niet hoeveel ze eet. Marloes las
  het eerst als hoeveelheid; de zin eronder ("70 kcal per 1 stuk. Hoeveel je eet, kies je daarna.") is daarvoor.

## Bakje Geluk weekmenu's (gebouwd 2026-09-28)

- Scherm "Weekmenu" (kalenderknop bovenin), geen aparte app: plannen, koken, loggen en boodschappen.
  Code in `docs/weekmenu.js` (vóór app.js geladen), haakjes in app.js: topbar, `menuTodayHtml` in `render()`,
  klikken op `data-eat`/`data-md`, dagboekregels met `e.menu`, en de inleeskaart in Profiel.
- Opslag: gerechten in `localStorage['calorietracker.bakjegeluk']` (buiten `S`, dus niet in de back-up);
  planning in `S.plan[dag][slot]`, afgevinkte boodschappen in `S.shop[maandag]`. Zes slots, waarvan beide
  tussendoortjes en het Bakje Geluk in het dagboek onder Tussendoortjes vallen.
- Het bestand maak je met `tools/maak_trackerbestand.py` in `../Bakje Geluk weekmenu's/`. Gerecht-id's zijn
  een hash van lijst en naam, zodat een planning blijft kloppen na opnieuw inlezen.
- De recepten zijn betaalde content en de repo is publiek. Ze komen dus **nooit** in de repo: de app leest
  eenmalig een bestand in (gemaakt in `../Bakje Geluk weekmenu's/`) en bewaart het alleen op de telefoon.
- Een gegeten gerecht wordt één dagboekregel met de kcal uit het weekmenu, zonder macro's.
- Boodschappen: diner x3 (2 volwassenen + 2 kinderen, kinderen tellen samen als 1). Overige eetmomenten x1.
- Elio blijft los van de weekmenu's.

## Bij een wijziging

1. Verhoog `VERSION` in `docs/sw.js` én `APP_VERSION` in `docs/app.js` (zelfde waarde).
2. Lokaal testen: `python -m http.server 8765` in `docs/`, dan http://localhost:8765.
3. Commit en push naar `main`; Pages staat binnen een minuut online.

## Geleerd

- Open Food Facts: de zoek-API (`/cgi/search.pl`) heeft een strenge limiet per minuut en geeft dan een 503
  zonder CORS-header. De app probeert daarom tot drie keer met pauze. `search.openfoodfacts.org` is sneller
  maar stuurt geen `Access-Control-Allow-Origin`, dus onbruikbaar vanuit de browser.
- Product op barcode (`/api/v2/product/<code>.json`) is ruimer begrensd; onbekend geeft 404 met JSON.
- OCR leest "g" vaak als "9" en mist komma's. `correct()` in `scan.js` kiest per waarde de lezing die
  klopt met de kcal en met verzadigd <= vet en suikers <= koolhydraten.
- Invoervelden altijd met `fmtIn()` vullen, niet met `fmtN()`: "2.000" (nl-NL) leest `num()` terug als 2.
- OCR-uitkomsten: ook "kcal" als "keal", "0,48g" als "048g", "1,9g" als "1,94". Alleen zout heeft normaal
  twee decimalen. Mist er een macro, dan mag de rest alleen onder de kcal blijven, niet erop uitkomen.
- `Scan.label` probeert tot drie leesmanieren (grijs/zwart-wit, psm 6/4) en kiest de uitkomst die het best
  met de kcal klopt. Testfoto's staan in `.tmp/` (`maakfoto.py`), test ze niet met één foto maar met meerdere.
- Marloes vond etiket-OCR slecht; uitsnijden en "tekst plakken uit Google Lens" zijn de vangnetten.
- Chrome op Android heeft `BarcodeDetector`; ZXing wordt alleen geladen als dat ontbreekt.
- Barcode slecht scherp: de browser kiest vaak de groothoeklens. De scanner kiest daarom de camera met "0" in
  de naam, zoomt standaard 2× in, stelt scherp bij tikken en onthoudt camera en zoom in `localStorage`.
  Niet te testen met de nepcamera van headless Chrome; alleen op de telefoon zelf.
- Headless Chrome voor tests: gebruik een profielmap op een lang pad (niet `MARLOE~1`), anders faalt
  CacheStorage en lijkt de service worker kapot. Gooi het profiel weg tussen runs, anders test je oude JS.
