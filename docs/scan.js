'use strict';
// Camera: barcodes lezen en voedingswaardetabellen via OCR.
const Scan = (() => {
  const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const loaded = {};

  function loadScript(src) {
    return loaded[src] ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { delete loaded[src]; reject(new Error('Kon een onderdeel niet laden. Heb je internet?')); };
      document.head.append(s);
    });
  }

  // GTIN-controlecijfer (EAN-8, EAN-13, UPC-A); voorkomt verkeerd gelezen codes.
  function validCode(code) {
    if (!/^\d+$/.test(code)) return code.length >= 6;
    if (![8, 12, 13, 14].includes(code.length)) return code.length >= 6;
    const d = code.split('').map(Number);
    const check = d.pop();
    let sum = 0;
    d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === check;
  }

  async function makeDetector(video) {
    const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const formats = want.filter(f => supported.includes(f));
        if (formats.length) {
          const det = new BarcodeDetector({ formats });
          return async () => (await det.detect(video))[0]?.rawValue;
        }
      } catch { /* val terug op ZXing */ }
    }
    await loadScript(ZXING);
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return async () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w) return null;
      const cw = Math.round(w * 0.85), ch = Math.round(h * 0.5);
      canvas.width = cw; canvas.height = ch;
      ctx.drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
      try {
        const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
        return reader.decode(bmp).getText();
      } catch { return null; }
    };
  }

  // Start de camera in `video` en roept onCode(code) aan bij de eerste geldige barcode.
  async function barcode(video, onCode) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video.srcObject = stream;
    await video.play();
    const track = stream.getVideoTracks()[0];
    // Autofocus waar de camera dat kan.
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { }
    let alive = true;
    const stop = () => {
      alive = false;
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    };
    const detect = await makeDetector(video);
    (async () => {
      while (alive) {
        try {
          const code = await detect();
          if (alive && code && validCode(code)) { stop(); onCode(code); return; }
        } catch { }
        await new Promise(r => setTimeout(r, 120));
      }
    })();
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    return {
      stop,
      hasTorch: !!caps.torch,
      torch: on => track.applyConstraints({ advanced: [{ torch: on }] }),
    };
  }

  // Foto verkleinen, grijs maken en contrast oprekken: dat leest Tesseract beter.
  async function prepImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
      px[i] = g; hist[g]++;
    }
    const n = w * h;
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Leest de tekst van een etiketfoto. onProgress(fractie 0..1 of null, statustekst).
  async function label(file, onProgress = () => { }) {
    onProgress(null, 'Foto voorbereiden');
    const canvas = await prepImage(file);
    onProgress(null, 'Tekstherkenning laden');
    await loadScript(TESSERACT);
    const worker = await Tesseract.createWorker(['nld', 'eng'], 1, {
      logger: m => {
        if (m.status === 'recognizing text') onProgress(m.progress, 'Tekst lezen');
        else if (m.status && m.status.includes('loading')) onProgress(null, 'Taalbestanden laden (alleen de eerste keer)');
      },
    });
    try {
      const { data } = await worker.recognize(canvas);
      return { text: data.text, values: parseLabel(data.text) };
    } finally {
      worker.terminate();
    }
  }

  function toNum(s) {
    return parseFloat(s.replace(',', '.'));
  }

  // Eerste getal na het trefwoord, met de ruwe tekst erbij voor de correctiestap.
  function firstToken(rest) {
    const m = rest.match(/(\d+(?:[.,]\d+)?)(\s*(?:g|gr|gram)\b)?/i);
    return m ? { raw: m[1], g: !!m[2] } : undefined;
  }

  // Wat er bedoeld kan zijn bij de bekende OCR-fouten: "g" gelezen als "9" ("12,5g" -> "12,59")
  // en een gemiste komma ("2,1" -> "21"). Elke correctie kost punten; de goedkoopste die klopt wint.
  function candidates(t) {
    const out = [];
    const decimals = (t.raw.split(/[.,]/)[1] || '').length;
    const strip = !t.g && t.raw.length > 1 && t.raw.endsWith('9');
    const base = [{ v: toNum(t.raw), cost: strip && decimals >= 2 ? 1 : 0 }];
    if (strip) {
      const s = t.raw.slice(0, -1).replace(/[.,]$/, '');
      if (s) base.push({ v: toNum(s), cost: decimals >= 2 ? 0 : 1 });
    }
    for (const c of base) {
      out.push(c);
      if (Number.isInteger(c.v) && c.v >= 10) {
        out.push({ v: c.v / 10, cost: c.cost + 1 });
        if (c.v >= 100) out.push({ v: c.v / 100, cost: c.cost + 2.5 });
      }
    }
    return out.sort((a, b) => a.cost - b.cost);
  }

  // Kies per waarde de meest waarschijnlijke lezing: koolhydraten, eiwit en vet moeten
  // ongeveer op de kcal uitkomen, en samen niet boven de 100 g per 100 g.
  function correct(tokens, kcal) {
    const main = ['carbs', 'fat', 'protein', 'fiber'].filter(k => tokens[k]);
    const cand = Object.fromEntries(main.map(k => [k, candidates(tokens[k])]));
    let best = null;
    const pick = {};
    (function walk(i, cost) {
      if (i === main.length) {
        const v = k => pick[k]?.v || 0;
        let score = cost;
        if (v('carbs') + v('fat') + v('protein') + v('fiber') > 102) score += 100;
        if (kcal) score += 20 * Math.abs(kcal - (4 * v('carbs') + 4 * v('protein') + 9 * v('fat') + 2 * v('fiber'))) / kcal;
        if (!best || score < best.score) best = { score, pick: { ...pick } };
        return;
      }
      for (const c of cand[main[i]]) { pick[main[i]] = c; walk(i + 1, cost + c.cost); }
    })(0, 0);
    const out = {};
    for (const k of main) out[k] = best.pick[k].v;
    const limited = (k, max) => {
      if (!tokens[k]) return;
      const c = candidates(tokens[k]);
      out[k] = (c.find(x => x.v <= max + 0.05) || c[0]).v;
    };
    limited('sat', out.fat ?? 100);
    limited('sugar', out.carbs ?? 100);
    limited('salt', 30);
    return out;
  }

  // Zet OCR-tekst om in voedingswaarden per 100 g (eerste kolom op het etiket).
  function parseLabel(text) {
    const out = {};
    const flat = text.replace(/\s+/g, ' ');
    let m = flat.match(/(\d{1,4}(?:[.,]\d+)?)\s*k\s?ca[l1I]/i);
    if (m) out.kcal = Math.round(toNum(m[1]));
    else {
      m = flat.match(/(\d{2,5}(?:[.,]\d+)?)\s*k\s?J/i);
      if (m) out.kcal = Math.round(toNum(m[1]) / 4.184);
    }
    const rules = [
      ['sat', /(?<!on)verzadig|saturate/i, /onverzadig|unsaturate/i],
      ['sugar', /suiker|sugar/i],
      ['fat', /\bvet(ten)?\b|\bfat\b|vetten|lipid/i, /verzadig|saturate|zuren|acids/i],
      ['carbs', /koolhydr|carbohydr/i],
      ['fiber', /vezel|voedingsvezel|fib(re|er)/i],
      ['protein', /eiwit|protein/i],
      ['salt', /\bzout\b|\bsalt\b/i],
    ];
    const tokens = {};
    for (const line of text.split(/\n/)) {
      for (const [key, re, not] of rules) {
        if (tokens[key]) continue;
        const hit = line.match(re);
        if (!hit || (not && not.test(line))) continue;
        const t = firstToken(line.slice(hit.index + hit[0].length));
        if (t && toNum(t.raw) < 10000) { tokens[key] = t; break; }
      }
    }
    return Object.assign(out, correct(tokens, out.kcal));
  }

  return { barcode, label, parseLabel, validCode };
})();
