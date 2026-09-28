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

  // Onthouden per telefoon: welke camera en welke zoom het best werkten.
  const CAM_KEY = 'calorietracker.camera';
  const ZOOM_KEY = 'calorietracker.zoom';
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { } },
  };

  function openStream(deviceId) {
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = { ideal: 'environment' };
    return navigator.mediaDevices.getUserMedia({ audio: false, video });
  }

  // Achtercamera's. Namen zijn pas zichtbaar nadat je toestemming gaf.
  async function backCameras() {
    const all = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const back = all.filter(d => /back|rear|achter|environment/i.test(d.label));
    return back.length ? back : all;
  }

  // Start de camera in `video` en roept onCode(code) aan bij de eerste geldige barcode.
  // Telefoons met meerdere lenzen geven de browser vaak de groothoeklens, die van dichtbij niet
  // scherp stelt. Daarom: hoofdcamera kiezen, een beetje inzoomen zodat je verder weg kunt houden,
  // en tikken om opnieuw scherp te stellen.
  async function barcode(video, onCode) {
    const saved = store.get(CAM_KEY);
    let stream;
    try { stream = await openStream(saved); } catch { stream = await openStream(null); }
    let cams = [];
    try { cams = await backCameras(); } catch { }
    const currentId = () => stream.getVideoTracks()[0].getSettings().deviceId;
    // Eerste keer: op Android heet de hoofdcamera meestal "camera2 0, facing back".
    if (!saved && cams.length > 1) {
      const main = cams.find(c => /\b0\b/.test(c.label)) || cams[0];
      if (main.deviceId && main.deviceId !== currentId()) {
        stream.getTracks().forEach(t => t.stop());
        try { stream = await openStream(main.deviceId); } catch { stream = await openStream(null); }
      }
    }
    let track, caps;
    let zoom = parseFloat(store.get(ZOOM_KEY)) || 2;
    const tune = async () => {
      track = stream.getVideoTracks()[0];
      caps = track.getCapabilities ? track.getCapabilities() : {};
      const adv = [];
      if (caps.focusMode?.includes('continuous')) adv.push({ focusMode: 'continuous' });
      if (caps.zoom) adv.push({ zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom)) });
      for (const c of adv) { try { await track.applyConstraints({ advanced: [c] }); } catch { } }
    };
    const attach = async () => {
      video.srcObject = stream;
      await video.play();
      await tune();
    };
    await attach();

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
        await new Promise(r => setTimeout(r, 100));
      }
    })();

    const ctl = {
      stop,
      get hasTorch() { return !!caps.torch; },
      torch: on => track.applyConstraints({ advanced: [{ torch: on }] }),
      cameraCount: cams.length,
      // Zoomstappen die deze camera aankan, bijvoorbeeld [1, 2, 3].
      get zoomSteps() { return caps.zoom ? [1, 2, 3].filter(z => z >= caps.zoom.min && z <= caps.zoom.max) : []; },
      get zoom() { return caps.zoom ? Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom)) : 1; },
      async setZoom(z) {
        zoom = z;
        store.set(ZOOM_KEY, String(z));
        try { await track.applyConstraints({ advanced: [{ zoom: z }] }); } catch { }
      },
      // Opnieuw scherpstellen: kort naar 'single-shot' en dan weer continu.
      async focus() {
        try {
          if (caps.focusMode?.includes('single-shot')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
            setTimeout(() => { if (alive && caps.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { }); }, 1200);
          } else if (caps.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'manual' }] }).catch(() => { });
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch { }
      },
      // Volgende achtercamera proberen; de keuze wordt onthouden.
      async switchCamera() {
        if (cams.length < 2) return;
        const i = cams.findIndex(c => c.deviceId === currentId());
        const next = cams[(i + 1) % cams.length];
        stream.getTracks().forEach(t => t.stop());
        stream = await openStream(next.deviceId);
        store.set(CAM_KEY, next.deviceId);
        await attach();
        return (i + 1) % cams.length + 1;
      },
    };
    if (!saved) store.set(CAM_KEY, currentId() || '');
    return ctl;
  }

  // Foto (of het uitgesneden stuk) naar een formaat waarop Tesseract goed leest: kleine uitsneden
  // worden vergroot, grote foto's verkleind. `crop` is {x, y, w, h} als fractie van de foto (0..1).
  // mode 'gray': grijs met opgerekt contrast. mode 'bw': zwart-wit met een drempel per buurt,
  // zodat schaduw en schittering niet de hele foto zwart of wit maken.
  function prepImage(bmp, crop, mode) {
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = c.x * bmp.width, sy = c.y * bmp.height, sw = c.w * bmp.width, sh = c.h * bmp.height;
    const scale = Math.min(3, 2200 / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;

    let out;
    if (mode === 'bw') {
      // Bradley-drempel: een pixel is inkt als hij 15% donkerder is dan het gemiddelde om hem heen.
      const sum = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
          row += gray[y * w + x];
          sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
        }
      }
      const r = Math.max(8, Math.round(Math.max(w, h) / 40));
      out = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
          const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
          const mean = s / ((x1 - x0) * (y1 - y0));
          out[y * w + x] = gray[y * w + x] < mean * 0.85 ? 0 : 255;
        }
      }
    } else {
      const hist = new Uint32Array(256);
      for (const g of gray) hist[g]++;
      const n = w * h;
      let lo = 0, hi = 255, acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
      acc = 0;
      for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
      const range = Math.max(1, hi - lo);
      out = gray.map(g => ((g - lo) * 255) / range);
    }
    for (let i = 0, j = 0; i < px.length; i += 4, j++) px[i] = px[i + 1] = px[i + 2] = out[j];
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Leest de tekst van een etiketfoto. onProgress(fractie 0..1 of null, statustekst).
  // Eerst zwart-wit als één tekstblok; vindt dat te weinig, dan nog een keer in grijs.
  async function label(file, onProgress = () => { }, crop = null) {
    onProgress(null, 'Foto voorbereiden');
    const bmp = await createImageBitmap(file);
    onProgress(null, 'Tekstherkenning laden');
    await loadScript(TESSERACT);
    let pass = 1;
    const worker = await Tesseract.createWorker(['nld', 'eng'], 1, {
      logger: m => {
        if (m.status === 'recognizing text') onProgress(m.progress, pass === 1 ? 'Tekst lezen' : 'Nog een keer lezen, op een andere manier');
        else if (m.status && m.status.includes('loading')) onProgress(null, 'Taalbestanden laden (alleen de eerste keer)');
      },
    });
    try {
      const attempts = [['gray', '6'], ['bw', '6'], ['gray', '4']];
      let best = null;
      for (const [mode, psm] of attempts) {
        await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
        const { data } = await worker.recognize(prepImage(bmp, crop, mode));
        const values = parseLabel(data.text);
        const q = quality(values);
        if (!best || q > best.q) best = { text: data.text, values, q };
        if (q >= 7.5) break; // vrijwel alles gevonden en de kcal klopt: klaar
        pass++;
      }
      return { text: best.text, values: best.values };
    } finally {
      worker.terminate();
    }
  }

  // Hoe geloofwaardig een uitkomst is: aantal gevonden waarden, min strafpunten als
  // koolhydraten, eiwit en vet niet op de kcal uitkomen.
  function quality(v) {
    let q = Object.keys(v).length;
    if (v.kcal && v.carbs !== undefined && v.fat !== undefined && v.protein !== undefined) {
      const est = 4 * v.carbs + 4 * v.protein + 9 * v.fat + 2 * (v.fiber || 0);
      q -= Math.min(4, 10 * Math.abs(v.kcal - est) / v.kcal);
    } else q -= 2;
    return q;
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
  // Behalve zout staan waarden bijna altijd met één decimaal op het etiket; een tweede decimaal
  // zonder "g" erachter is dan meestal een verkeerd gelezen "g" ("1,9g" -> "1,94").
  function candidates(t, key) {
    const out = [];
    // "048" is bijna altijd "0,48" met een gemiste komma.
    const raw = /^0\d+$/.test(t.raw) ? '0,' + t.raw.slice(1) : t.raw;
    const decimals = (raw.split(/[.,]/)[1] || '').length;
    const strip = !t.g && raw.length > 1 && (raw.endsWith('9') || (key !== 'salt' && decimals >= 2));
    const base = [{ v: toNum(raw), cost: strip && decimals >= 2 ? 1 : 0 }];
    if (strip) {
      const s = raw.slice(0, -1).replace(/[.,]$/, '');
      if (s) base.push({ v: toNum(s), cost: decimals >= 2 ? 0 : 1 });
    }
    for (const c of base) {
      out.push(c);
      if (Number.isInteger(c.v) && c.v >= 10) {
        out.push({ v: c.v / 10, cost: c.cost + 1.2 });
        if (c.v >= 100) out.push({ v: c.v / 100, cost: c.cost + 2.5 });
      }
    }
    return out.sort((a, b) => a.cost - b.cost);
  }

  // Kies per waarde de meest waarschijnlijke lezing: koolhydraten, eiwit en vet moeten
  // ongeveer op de kcal uitkomen, en samen niet boven de 100 g per 100 g.
  function correct(tokens, kcal) {
    const main = ['carbs', 'fat', 'protein', 'fiber'].filter(k => tokens[k]);
    const cand = Object.fromEntries(main.map(k => [k, candidates(tokens[k], k)]));
    let best = null;
    const pick = {};
    (function walk(i, cost) {
      if (i === main.length) {
        const v = k => pick[k]?.v || 0;
        let score = cost;
        if (v('carbs') + v('fat') + v('protein') + v('fiber') > 102) score += 100;
        if (kcal) {
          const est = 4 * v('carbs') + 4 * v('protein') + 9 * v('fat') + 2 * v('fiber');
          // Alle drie de macro's gelezen: moet kloppen. Eén kwijt: de rest mag alleen minder zijn.
          const complete = ['carbs', 'fat', 'protein'].every(k => tokens[k]);
          const off = complete ? Math.abs(kcal - est) : Math.max(0, est - kcal * 1.05);
          score += 20 * off / kcal;
        }
        if (!best || score < best.score) best = { score, pick: { ...pick } };
        return;
      }
      for (const c of cand[main[i]]) { pick[main[i]] = c; walk(i + 1, cost + c.cost); }
    })(0, 0);
    const out = {};
    for (const k of main) out[k] = best.pick[k].v;
    const limited = (k, max) => {
      if (!tokens[k]) return;
      const c = candidates(tokens[k], k);
      out[k] = (c.find(x => x.v <= max + 0.05) || c[0]).v;
    };
    // Vet niet gelezen? Schat het uit de kcal, zodat "verzadigd" toch getoetst kan worden.
    let fatMax = out.fat;
    if (fatMax === undefined && kcal && out.carbs !== undefined && out.protein !== undefined) {
      fatMax = Math.max(1, (kcal - 4 * out.carbs - 4 * out.protein - 2 * (out.fiber || 0)) / 9 * 1.2);
    }
    limited('sat', fatMax ?? 100);
    limited('sugar', out.carbs ?? 100);
    limited('salt', 30);
    return out;
  }

  // Zet OCR-tekst om in voedingswaarden per 100 g (eerste kolom op het etiket).
  function parseLabel(text) {
    const out = {};
    const flat = text.replace(/\s+/g, ' ');
    let m = flat.match(/(\d{1,4}(?:[.,]\d+)?)\s*k\s?[ce]a[l1Ii]/i); // ook "keal", "kcai"
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
    // Begin bij de tabel, zodat "suiker" of "zout" in de ingrediëntenlijst niet meetelt.
    let lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const startAt = lines.findIndex(l => /voedingswaarde|nutrition|energie|energy|\bk\s?J\b|kcal/i.test(l));
    if (startAt > 0) lines = lines.slice(startAt);
    const anyKeyword = l => rules.some(([, re]) => re.test(l));
    const tokens = {};
    lines.forEach((line, i) => {
      for (const [key, re, not] of rules) {
        if (tokens[key]) continue;
        const hit = line.match(re);
        if (!hit || (not && not.test(line))) continue;
        let t = firstToken(line.slice(hit.index + hit[0].length));
        // Staat het getal een regel lager (scheve foto), pak dan die regel.
        const next = lines[i + 1];
        if (!t && next && !anyKeyword(next)) t = firstToken(next);
        if (t && toNum(t.raw) < 10000) { tokens[key] = t; break; }
      }
    });
    return Object.assign(out, correct(tokens, out.kcal));
  }

  return { barcode, label, parseLabel, validCode };
})();
