(async function () {
  // Manifest inline (fallback per file://). Stesso schema del manifest.json sul disco.
  const INLINE_MANIFEST = {
    "scene": { "base_layer": "layers/base.png", "width": 1280, "height": 900 },
    "default": { "wood": "10_32", "leather": "nubuck_2138_cat_a" },
    "woods": [
      { "id": "10_32",                     "label": "Wengé 10.32",         "swatch": "swatches/wood_10_32.jpg" },
      { "id": "10_16",                     "label": "Rovere 10.16",        "swatch": "swatches/wood_10_16.jpg" },
      { "id": "11_05",                     "label": "Grigio 11.05",        "swatch": "swatches/wood_11_05.jpg" },
      { "id": "11_06",                     "label": "Chiaro 11.06",        "swatch": "swatches/wood_11_06.jpg" },
      { "id": "10_74",                     "label": "Noce 10.74",          "swatch": "swatches/wood_10_74.jpg" },
      { "id": "10_11_noce_fiammato_nuovo", "label": "Noce fiammato 10.11", "swatch": "swatches/wood_10_11_noce_fiammato_nuovo.jpg" },
      { "id": "18_51",                     "label": "Tinto 18.51",         "swatch": "swatches/wood_18_51.jpg" },
      { "id": "l22_231z",                  "label": "L22.231Z",            "swatch": "swatches/wood_l22_231z.jpg" }
    ],
    "leathers": [
      { "id": "nubuck_2138_cat_a",  "label": "Nubuck 2138 — Nero (Cat. A)",   "swatch": "swatches/leather_nubuck_2138_cat_a.jpg" },
      { "id": "nubuck_2100_cat_a",  "label": "Nubuck 2100 — Chiaro (Cat. A)", "swatch": "swatches/leather_nubuck_2100_cat_a.jpg" },
      { "id": "cloud_1015_cat_c",   "label": "Cloud 1015 (Cat. C)",            "swatch": "swatches/leather_cloud_1015_cat_c.jpg" },
      { "id": "cloud_4109_cat_c",   "label": "Cloud 4109 (Cat. C)",            "swatch": "swatches/leather_cloud_4109_cat_c.jpg" },
      { "id": "montana_1303_cat_b", "label": "Montana 1303 (Cat. B)",          "swatch": "swatches/leather_montana_1303_cat_b.jpg" },
      { "id": "savana_1001_cat_b",  "label": "Savana 1001 (Cat. B)",           "swatch": "swatches/leather_savana_1001_cat_b.jpg" },
      { "id": "savana_1005_cat_b",  "label": "Savana 1005 (Cat. B)",           "swatch": "swatches/leather_savana_1005_cat_b.jpg" },
      { "id": "cloud_779_cat_c",    "label": "Cloud 779 (Cat. C)",             "swatch": "swatches/leather_cloud_779_cat_c.jpg" }
    ]
  };

  let manifest = INLINE_MANIFEST;
  try {
    if (location.protocol.startsWith('http')) {
      const r = await fetch('manifest.json', { cache: 'no-store' });
      if (r.ok) {
        const m = await r.json();
        // sopravvive sia al vecchio schema (armchairs[]) sia al nuovo (default{})
        if (!m.default && Array.isArray(m.armchairs) && m.armchairs[0]) {
          m.default = { wood: m.armchairs[0].default_wood, leather: m.armchairs[0].default_leather };
        }
        manifest = m;
      }
    }
  } catch (e) { console.warn('fallback su manifest inline'); }

  // === STATE UNICO (la configurazione si applica a ENTRAMBE le poltrone) ===
  const state = { wood: manifest.default.wood, leather: manifest.default.leather };

  // === CANVAS LAYERS ===
  const LAYER_KEYS = ['base','shell_A','uphol_A','shell_B','uphol_B'];
  const W = manifest.scene.width, H = manifest.scene.height;
  const layers = {};
  LAYER_KEYS.forEach(key => {
    const canvas = document.querySelector(`canvas.layer[data-layer="${key}"]`);
    canvas.width = W; canvas.height = H;
    layers[key] = {
      canvas,
      ctx: canvas.getContext('2d', { alpha: true }),
      currentImg: null,
      currentSrc: null,
      raf: null,
    };
  });

  const spinner = document.getElementById('stageSpinner');
  const inflight = new Set();
  const cache = new Map(); // src → HTMLImageElement decoded

  function setSpinner() {
    if (inflight.size > 0) spinner.classList.add('is-visible');
    else spinner.classList.remove('is-visible');
  }

  function loadAndDecode(src) {
    if (cache.has(src)) return Promise.resolve(cache.get(src));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = async () => {
        if (img.decode) { try { await img.decode(); } catch (e) {} }
        cache.set(src, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error('load failed: ' + src));
      img.src = src;
    });
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
  }

  function urls() {
    return {
      base:    manifest.scene.base_layer,
      shell_A: `layers/shell_A__${state.wood}.png`,
      uphol_A: `layers/uphol_A__${state.leather}.png`,
      shell_B: `layers/shell_B__${state.wood}.png`,
      uphol_B: `layers/uphol_B__${state.leather}.png`,
    };
  }

  async function setLayer(key, newSrc) {
    const L = layers[key];
    if (L.currentSrc === newSrc) return;

    inflight.add(key); setSpinner();
    let newImg;
    try { newImg = await loadAndDecode(newSrc); }
    catch (e) {
      console.warn(e.message);
      inflight.delete(key); setSpinner();
      return;
    }
    if (urls()[key] !== newSrc) {
      inflight.delete(key); setSpinner();
      return;
    }
    if (L.raf) cancelAnimationFrame(L.raf);

    const oldImg = L.currentImg;
    L.currentSrc = newSrc;

    if (!oldImg) {
      L.ctx.clearRect(0, 0, W, H);
      L.ctx.drawImage(newImg, 0, 0, W, H);
      L.currentImg = newImg;
      inflight.delete(key); setSpinner();
      return;
    }

    const DUR = 450;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DUR);
      const eased = easeInOutCubic(t);
      L.ctx.clearRect(0, 0, W, H);
      L.ctx.drawImage(oldImg, 0, 0, W, H);
      L.ctx.globalAlpha = eased;
      L.ctx.drawImage(newImg, 0, 0, W, H);
      L.ctx.globalAlpha = 1;
      if (t < 1) {
        L.raf = requestAnimationFrame(step);
      } else {
        L.raf = null;
        L.currentImg = newImg;
        inflight.delete(key); setSpinner();
      }
    };
    L.raf = requestAnimationFrame(step);
  }

  function applyAllLayers() {
    const u = urls();
    LAYER_KEYS.forEach(k => setLayer(k, u[k]));
  }

  function speculativePreload() {
    const candidates = [];
    manifest.woods.forEach(w => {
      candidates.push(`layers/shell_A__${w.id}.png`);
      candidates.push(`layers/shell_B__${w.id}.png`);
    });
    manifest.leathers.forEach(l => {
      candidates.push(`layers/uphol_A__${l.id}.png`);
      candidates.push(`layers/uphol_B__${l.id}.png`);
    });
    let i = 0;
    function next() {
      while (i < candidates.length) {
        const src = candidates[i++];
        if (cache.has(src)) continue;
        loadAndDecode(src).catch(() => {}).finally(() => setTimeout(next, 20));
        return;
      }
    }
    if ('requestIdleCallback' in window) requestIdleCallback(next);
    else setTimeout(next, 800);
  }

  // === SWATCH RENDERING ===
  const swatchWoodEl = document.getElementById('swatchWood');
  const swatchLeatherEl = document.getElementById('swatchLeather');
  const hintWoodEl = document.getElementById('hintWood');
  const hintLeatherEl = document.getElementById('hintLeather');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');

  function renderSwatches() {
    swatchWoodEl.innerHTML = '';
    manifest.woods.forEach(w => {
      const el = makeSwatch(w, state.wood === w.id, () => {
        if (state.wood === w.id) return;
        state.wood = w.id;
        renderSwatches();
        applyAllLayers();
      });
      swatchWoodEl.appendChild(el);
    });
    const curW = manifest.woods.find(w => w.id === state.wood);
    hintWoodEl.textContent = curW ? curW.label : '—';

    swatchLeatherEl.innerHTML = '';
    manifest.leathers.forEach(l => {
      const el = makeSwatch(l, state.leather === l.id, () => {
        if (state.leather === l.id) return;
        state.leather = l.id;
        renderSwatches();
        applyAllLayers();
      });
      swatchLeatherEl.appendChild(el);
    });
    const curL = manifest.leathers.find(l => l.id === state.leather);
    hintLeatherEl.textContent = curL ? curL.label : '—';
  }

  function makeSwatch(item, isActive, onClick) {
    const el = document.createElement('button');
    el.className = 'swatch' + (isActive ? ' active' : '');
    el.title = item.label;
    el.type = 'button';
    el.addEventListener('click', onClick);
    const img = document.createElement('img');
    img.src = item.swatch;
    img.onerror = () => { img.onerror = null; img.src = item.source || ''; };
    img.alt = item.label;
    el.appendChild(img);
    return el;
  }

  downloadBtn.addEventListener('click', () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    LAYER_KEYS.forEach(k => { ctx.drawImage(layers[k].canvas, 0, 0, W, H); });
    const url = cv.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = 'amelie-configurazione.png'; a.click();
  });

  resetBtn.addEventListener('click', () => {
    state.wood = manifest.default.wood;
    state.leather = manifest.default.leather;
    renderSwatches();
    applyAllLayers();
  });

  document.querySelector('.stage-inner').style.aspectRatio = `${W} / ${H}`;
  renderSwatches();
  applyAllLayers();
  speculativePreload();
})();
