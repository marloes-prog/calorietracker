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

- Bewust geen extra's: geen water, stappen of beweging. Alleen eten toevoegen.
- Design naar Yazio: lichte kaarten, grote kcal-ring, macrobalkjes, Nunito.
- Etiket scannen gebeurt met gratis OCR (Tesseract.js via jsDelivr), niet met een betaalde API.
- Dagdoel wordt berekend (Mifflin-St Jeor x activiteit + doel), met eigen doel als overschrijving.

## Bij een wijziging

1. Verhoog `VERSION` in `docs/sw.js`, anders blijft de telefoon de oude versie tonen tot de tweede keer openen.
2. Lokaal testen: `python -m http.server 8765` in `docs/`, dan http://localhost:8765.
3. Commit en push naar `main`; Pages staat binnen een minuut online.

## Geleerd

- Open Food Facts: de zoek-API (`/cgi/search.pl`) heeft een strenge limiet per minuut en geeft dan een 503
  zonder CORS-header. De app probeert daarom tot drie keer met pauze. `search.openfoodfacts.org` is sneller
  maar stuurt geen `Access-Control-Allow-Origin`, dus onbruikbaar vanuit de browser.
- Product op barcode (`/api/v2/product/<code>.json`) is ruimer begrensd; onbekend geeft 404 met JSON.
- OCR leest "g" vaak als "9" en mist komma's. `correct()` in `scan.js` kiest per waarde de lezing die
  klopt met de kcal en met verzadigd <= vet en suikers <= koolhydraten.
- Chrome op Android heeft `BarcodeDetector`; ZXing wordt alleen geladen als dat ontbreekt.
