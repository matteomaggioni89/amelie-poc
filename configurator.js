(async function () {
  // ---- Manifest: prefer fresh fetch over http, fall back to inlined data ----
  let manifest = window.AMELIE_MANIFEST || null;
  try {
    if (location.protocol.startsWith('http')) {
      const r = await fetch('manifest.json', { cache: 'no-store' });
      if (r.ok) manifest = await r.json();
    }
  } catch (e) { /* keep inline */ }
  if (!manifest || !manifest.shell_groups) { console.error('Amelie: manifest mancante'); return; }

  // ---- Flatten groups for lookups / preloading ----
  const shellGroups   = manifest.shell_groups;
  const leatherGroups = manifest.leather_groups;
  const allWoods    = shellGroups.flatMap(g => g.items);
  const allLeathers = leatherGroups.flatMap(g => g.items);
  const groupOf = (groups, id) => (groups.find(g => g.items.some(it => it.id === id)) || groups[0]);

  // ---- Carousel pagination (2 rows x 4 = 8 swatch per page) ----
  const PAGE_SIZE = 8;
  const pageCount = n => Math.max(1, Math.ceil(n / PAGE_SIZE));
  const pageOf = (items, id) => { const i = items.findIndex(x => x.id === id); return i < 0 ? 0 : Math.floor(i / PAGE_SIZE); };

  const _dwg = groupOf(shellGroups, manifest.default.wood);
  const _dlg = groupOf(leatherGroups, manifest.default.leather);
  const state = {
    wood: manifest.default.wood,
    leather: manifest.default.leather,
    woodTab: _dwg.id,
    leatherTab: _dlg.id,
    woodPage: pageOf(_dwg.items, manifest.default.wood),
    leatherPage: pageOf(_dlg.items, manifest.default.leather),
  };

  // cache-buster so re-rendered layers always show on reload (bump when re-rendering)
  const LV = '?v=20260529h';

  // ---- Canvas layers / compositing engine (pixel-perfect crossfade) ----
  const LAYER_KEYS = ['base', 'shell_A', 'uphol_A', 'shell_B', 'uphol_B'];
  const W = manifest.scene.width, H = manifest.scene.height;
  const layers = {};
  LAYER_KEYS.forEach(key => {
    const canvas = document.querySelector(`.lm-configurator__layer[data-layer="${key}"]`);
    if (!canvas) return;
    canvas.width = W; canvas.height = H;
    layers[key] = { canvas, ctx: canvas.getContext('2d', { alpha: true }), currentImg: null, currentSrc: null, raf: null };
  });
  if (Object.keys(layers).length === 0) return;

  const spinner = document.getElementById('lmStageSpinner');
  const inflight = new Set();
  function setSpinner() {
    if (!spinner) return;
    spinner.classList.toggle('is-visible', inflight.size > 0);
  }

  // ---- Loader: concurrency-limited queue + capped image cache + de-dup ----
  const MAX_CONCURRENT = 4, MAX_CACHE = 48;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const cache = new Map();    // src -> HTMLImageElement (insertion order ~ recency)
  const pending = new Map();  // src -> in-flight Promise (de-dup)
  const queue = [];           // [{ src, resolve, reject }]
  let active = 0;
  function touch(src) { const v = cache.get(src); if (v !== undefined) { cache.delete(src); cache.set(src, v); } }
  function evict() {
    if (cache.size <= MAX_CACHE) return;
    const keep = new Set(Object.values(urls()));  // never drop the currently-visible layers
    for (const k of [...cache.keys()]) {
      if (cache.size <= MAX_CACHE) break;
      if (!keep.has(k)) cache.delete(k);
    }
  }
  function rawLoad(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = async () => { if (img.decode) { try { await img.decode(); } catch (e) {} } resolve(img); };
      img.onerror = () => reject(new Error('load failed: ' + src));
      img.src = src;
    });
  }
  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      const hit = cache.get(job.src);
      if (hit !== undefined) { touch(job.src); job.resolve(hit); continue; }
      active++;
      rawLoad(job.src)
        .then(img => { cache.set(job.src, img); evict(); job.resolve(img); }, err => job.reject(err))
        .finally(() => { active--; pump(); });
    }
  }
  function loadAndDecode(src, priority) {
    const hit = cache.get(src);
    if (hit !== undefined) { touch(src); return Promise.resolve(hit); }
    const inFlight = pending.get(src);
    if (inFlight) return inFlight;
    const tracked = new Promise((resolve, reject) => {
      queue[priority ? 'unshift' : 'push']({ src, resolve, reject });
      pump();
    }).then(img => { pending.delete(src); return img; }, err => { pending.delete(src); throw err; });
    pending.set(src, tracked);
    return tracked;
  }
  const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;

  function urls() {
    return {
      base:    manifest.scene.base_layer + LV,
      shell_A: `layers/shell_A__${state.wood}.png` + LV,
      uphol_A: `layers/uphol_A__${state.leather}.png` + LV,
      shell_B: `layers/shell_B__${state.wood}.png` + LV,
      uphol_B: `layers/uphol_B__${state.leather}.png` + LV,
    };
  }

  async function setLayer(key, newSrc) {
    const L = layers[key]; if (!L) return;
    if (L.currentSrc === newSrc) return;
    inflight.add(key); setSpinner();
    let newImg;
    try { newImg = await loadAndDecode(newSrc, true); }
    catch (e) { inflight.delete(key); setSpinner(); return; }
    if (urls()[key] !== newSrc) { inflight.delete(key); setSpinner(); return; }
    if (L.raf) cancelAnimationFrame(L.raf);
    const oldImg = L.currentImg;
    L.currentSrc = newSrc;
    if (!oldImg) {
      L.ctx.clearRect(0, 0, W, H); L.ctx.drawImage(newImg, 0, 0, W, H);
      L.currentImg = newImg; inflight.delete(key); setSpinner(); return;
    }
    const DUR = 450, start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DUR), eased = easeInOutCubic(t);
      L.ctx.clearRect(0, 0, W, H);
      L.ctx.drawImage(oldImg, 0, 0, W, H);
      L.ctx.globalAlpha = eased; L.ctx.drawImage(newImg, 0, 0, W, H); L.ctx.globalAlpha = 1;
      if (t < 1) L.raf = requestAnimationFrame(step);
      else { L.raf = null; L.currentImg = newImg; inflight.delete(key); setSpinner(); }
    };
    L.raf = requestAnimationFrame(step);
  }
  function applyAllLayers() { const u = urls(); LAYER_KEYS.forEach(k => setLayer(k, u[k])); }

  function preloadShell(id) { loadAndDecode(`layers/shell_A__${id}.png` + LV).catch(() => {}); loadAndDecode(`layers/shell_B__${id}.png` + LV).catch(() => {}); }
  function preloadLeather(id) { loadAndDecode(`layers/uphol_A__${id}.png` + LV).catch(() => {}); loadAndDecode(`layers/uphol_B__${id}.png` + LV).catch(() => {}); }
  function preloadGroup(items, kind) {
    if (saveData) return;
    const fn = kind === 'shell' ? preloadShell : preloadLeather;
    items.forEach(it => fn(it.id));
  }
  // Preload only the open categories (most likely next choices), on idle — not all 156 layers.
  function idlePreload() {
    if (saveData) return;
    const run = () => {
      preloadGroup((shellGroups.find(g => g.id === state.woodTab) || shellGroups[0]).items, 'shell');
      preloadGroup((leatherGroups.find(g => g.id === state.leatherTab) || leatherGroups[0]).items, 'leather');
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 800);
  }

  // ---- DOM refs ----
  const els = {
    tabsWood: document.getElementById('lmTabsWood'),
    tabsLeather: document.getElementById('lmTabsLeather'),
    swWood: document.getElementById('lmSwatchWood'),
    swLeather: document.getElementById('lmSwatchLeather'),
    hintWood: document.getElementById('lmHintWood'),
    hintLeather: document.getElementById('lmHintLeather'),
    downloadBtn: document.getElementById('lmDownloadBtn'),
  };

  function makeTab(group, isActive, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lm-configurator__tab' + (isActive ? ' is-active' : '');
    b.innerHTML = `${group.label}<span class="count">${group.items.length}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }
  function makeSwatch(item, isActive, onClick, onHover) {
    const el = document.createElement('button');
    el.className = 'lm-configurator__swatch' + (isActive ? ' is-active' : '');
    el.title = item.label; el.type = 'button';
    el.addEventListener('click', onClick);
    if (onHover) el.addEventListener('pointerenter', onHover, { passive: true, once: true });
    const img = document.createElement('img');
    img.src = item.swatch; img.alt = item.label; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
    el.appendChild(img);
    return el;
  }

  const CHEV_PREV = '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,2 3,10 9,18"/></svg>';
  const CHEV_NEXT = '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,2 9,10 3,18"/></svg>';

  function buildCarousel(root, items, selectedId, page, onSelect, onPage, onHover, enter) {
    const pages = pageCount(items.length);
    let cur = Math.min(Math.max(0, page), pages - 1);
    root.innerHTML = '';
    root.classList.toggle('is-entering', !!enter);

    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'lm-carousel__arrow lm-carousel__arrow--prev';
    prev.setAttribute('aria-label', 'Precedenti'); prev.innerHTML = CHEV_PREV;
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'lm-carousel__arrow lm-carousel__arrow--next';
    next.setAttribute('aria-label', 'Successivi'); next.innerHTML = CHEV_NEXT;

    const vp = document.createElement('div'); vp.className = 'lm-carousel__viewport';
    const track = document.createElement('div'); track.className = 'lm-carousel__track';
    for (let p = 0; p < pages; p++) {
      const pg = document.createElement('div'); pg.className = 'lm-carousel__page';
      items.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE).forEach(it =>
        pg.appendChild(makeSwatch(it, it.id === selectedId, () => onSelect(it), onHover && (() => onHover(it)))));
      track.appendChild(pg);
    }
    vp.appendChild(track);
    const stage = document.createElement('div'); stage.className = 'lm-carousel__stage';
    stage.appendChild(prev); stage.appendChild(vp); stage.appendChild(next);
    root.appendChild(stage);

    const dashEls = [];
    if (pages > 1) {
      const dots = document.createElement('div'); dots.className = 'lm-carousel__dots';
      for (let p = 0; p < pages; p++) {
        const d = document.createElement('button'); d.type = 'button';
        d.className = 'lm-carousel__dash';
        d.setAttribute('aria-label', 'Pagina ' + (p + 1));
        d.addEventListener('click', () => goTo(p, true));
        dots.appendChild(d); dashEls.push(d);
      }
      root.appendChild(dots);
    }

    function paint(animate) {
      track.style.transition = animate ? '' : 'none';
      track.style.transform = `translateX(${-cur * 100}%)`;
      prev.classList.toggle('is-hidden', cur === 0);
      next.classList.toggle('is-hidden', cur === pages - 1);
      dashEls.forEach((d, i) => d.classList.toggle('is-active', i === cur));
    }
    function goTo(p, animate) {
      p = Math.min(Math.max(0, p), pages - 1);
      if (p === cur) { paint(true); return; }
      cur = p; paint(animate); onPage(cur);
    }
    prev.addEventListener('click', () => goTo(cur - 1, true));
    next.addEventListener('click', () => goTo(cur + 1, true));
    paint(false);

    // ---- drag-to-scroll (pointer / touch) ----
    let down = false, moved = false, startX = 0, basePx = 0, vpW = 0;
    vp.addEventListener('pointerdown', (e) => {
      if (pages <= 1) return;
      down = true; moved = false; startX = e.clientX; vpW = vp.clientWidth || 1; basePx = -cur * vpW;
      track.style.transition = 'none'; vp.classList.add('is-grabbing');
      try { vp.setPointerCapture(e.pointerId); } catch (_) {}
    });
    vp.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) moved = true;
      let pos = basePx + dx;
      const min = -(pages - 1) * vpW, max = 0;
      if (pos > max) pos = max + (pos - max) * 0.3;
      if (pos < min) pos = min + (pos - min) * 0.3;
      track.style.transform = `translateX(${pos}px)`;
    });
    const end = (e) => {
      if (!down) return; down = false; vp.classList.remove('is-grabbing');
      const dx = (typeof e.clientX === 'number' ? e.clientX : startX) - startX;
      const th = Math.min(60, vpW * 0.18);
      let np = cur;
      if (dx <= -th) np = cur + 1; else if (dx >= th) np = cur - 1;
      goTo(np, true);
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    track.addEventListener('dragstart', (e) => e.preventDefault());
  }

  function renderShell(enter) {
    const activeGroup = shellGroups.find(g => g.id === state.woodTab) || shellGroups[0];
    els.tabsWood.innerHTML = '';
    shellGroups.forEach(g => els.tabsWood.appendChild(makeTab(g, g.id === state.woodTab, () => {
      if (state.woodTab === g.id) return;
      state.woodTab = g.id; state.woodPage = pageOf(g.items, state.wood); renderShell(true); preloadGroup(g.items, 'shell');
    })));
    buildCarousel(els.swWood, activeGroup.items, state.wood, state.woodPage,
      (it) => { if (state.wood === it.id) return; state.wood = it.id; renderShell(); applyAllLayers(); },
      (p)  => { state.woodPage = p; },
      (it) => preloadShell(it.id), enter);
    const cw = allWoods.find(w => w.id === state.wood);
    els.hintWood.textContent = cw ? cw.label : '—';
  }

  function renderLeather(enter) {
    const activeGroup = leatherGroups.find(g => g.id === state.leatherTab) || leatherGroups[0];
    els.tabsLeather.innerHTML = '';
    leatherGroups.forEach(g => els.tabsLeather.appendChild(makeTab(g, g.id === state.leatherTab, () => {
      if (state.leatherTab === g.id) return;
      state.leatherTab = g.id; state.leatherPage = pageOf(g.items, state.leather); renderLeather(true); preloadGroup(g.items, 'leather');
    })));
    buildCarousel(els.swLeather, activeGroup.items, state.leather, state.leatherPage,
      (it) => { if (state.leather === it.id) return; state.leather = it.id; renderLeather(); applyAllLayers(); },
      (p)  => { state.leatherPage = p; },
      (it) => preloadLeather(it.id), enter);
    const cl = allLeathers.find(l => l.id === state.leather);
    els.hintLeather.textContent = cl ? 'Pelle ' + cl.label : '—';
  }

  if (els.downloadBtn) els.downloadBtn.addEventListener('click', () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    LAYER_KEYS.forEach(k => layers[k] && ctx.drawImage(layers[k].canvas, 0, 0, W, H));
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'amelie-configurazione.png'; a.click();
  });

  renderShell();
  renderLeather();
  applyAllLayers();
  idlePreload();
})();
