(async function () {
  // ---- Manifest: inline (manifest.data.js, deferito prima di questo script) = niente fetch bloccante.
  // Il fetch resta solo come fallback se l'inline manca; 'no-cache' rivalida via ETag (304) invece di
  // riscaricare sempre (il vecchio 'no-store' costava 1 RTT pieno a OGNI visita prima del primo paint).
  let manifest = window.LM_MANIFEST || window.TALENTO_MANIFEST || window.AMELIE_MANIFEST || null;
  if (!manifest) {
    try {
      const r = await fetch('manifest.json', { cache: 'no-cache' });
      if (r.ok) manifest = await r.json();
    } catch (e) { /* nessun manifest disponibile */ }
  }
  if (!manifest || !manifest.scene || !Array.isArray(manifest.groups)) { console.error('Configuratore: manifest mancante o non in formato groups[]'); return; }
  // un gruppo senza opzioni non deve uccidere l'intero configuratore: lo scarto con un warn
  manifest.groups = manifest.groups.filter(g => {
    const ok = g && Array.isArray(g.options) && g.options.length > 0;
    if (!ok) console.warn('Configuratore: gruppo senza opzioni scartato:', g && g.id);
    return ok;
  });
  const slug = s => String(s || 'configurazione').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const groups = manifest.groups;                 // [{id,label,z,options:[{id,kind,label,layer,swatch}]}]
  const W = manifest.scene.width, H = manifest.scene.height;

  // ---- Tipi di finitura (sotto-categorie dentro ogni gruppo) ----
  const KIND_LABEL = { wood: 'Legno', marble: 'Marmo', lac: 'Laccato lucido', leather: 'Pelle' };
  let KIND_ORDER = ['wood', 'marble', 'lac', 'leather'];
  if (manifest.kinds) {   // override/estendi dal manifest: kinds = { kindId: {label, order} }
    Object.entries(manifest.kinds).forEach(([k, v]) => { KIND_LABEL[k] = (v && v.label) || v || KIND_LABEL[k] || k; });
    const ord = Object.entries(manifest.kinds).filter(([, v]) => v && v.order != null)
      .sort((a, b) => a[1].order - b[1].order).map(([k]) => k);
    if (ord.length) KIND_ORDER = ord.concat(KIND_ORDER.filter(k => !ord.includes(k)));
  }
  const kindsOf = g => {                 // tutti i kind presenti, ordinati per KIND_ORDER (+ extra in coda)
    const present = [...new Set(g.options.map(o => o.kind))];
    return KIND_ORDER.filter(k => present.includes(k)).concat(present.filter(k => !KIND_ORDER.includes(k)));
  };
  const itemsOfKind = (g, k) => g.options.filter(o => o.kind === k);
  const optById = (g, id) => g.options.find(o => o.id === id);
  const groupById = id => groups.find(g => g.id === id);

  // ---- Paginazione carosello (2 righe x 4 = 8 per pagina) ----
  const PAGE_SIZE = 8;
  const pageCount = n => Math.max(1, Math.ceil(n / PAGE_SIZE));
  const pageOf = (items, id) => { const i = items.findIndex(x => x.id === id); return i < 0 ? 0 : Math.floor(i / PAGE_SIZE); };

  // ---- Stato per gruppo: { sel, tab(kind), page } — default = prima opzione ----
  const state = {};
  groups.forEach(g => {
    const def = g.options.find(o => o.id === g.default) || g.options.find(o => o.default) || g.options[0];
    state[g.id] = { sel: def.id, tab: def.kind, page: pageOf(itemsOfKind(g, def.kind), def.id) };
  });

  // cache-buster (bump se si ri-renderizzano i layer; override per-prodotto via manifest.layers_v)
  const LV = '?v=' + (manifest.layers_v || '20260606a');

  // ---- Layer canvas / compositing (crossfade pixel-perfect) ----
  // gruppi multi-canvas: una scelta dipinge piu' canvas (es. Amelie shell -> shell_A + shell_B)
  const targetsOf = g => (Array.isArray(g.targets) && g.targets.length) ? g.targets : [g.id];
  const layers = {};
  // ordine di pittura del composite (download/lightbox) = ordine DOM dei canvas: e' per definizione
  // cio' che l'utente vede a schermo (i canvas sono sibling assoluti senza z-index). Ordinare per z
  // del manifest divergeva dal DOM sui pari-z (Talento big_a/big_b) -> export diverso dalla vista live.
  const PAINT_ORDER = [];
  document.querySelectorAll('.lm-configurator__layer').forEach(cv => {
    const key = cv.getAttribute('data-layer');
    PAINT_ORDER.push(key);
    cv.width = W; cv.height = H;
    layers[key] = { canvas: cv, ctx: cv.getContext('2d', { alpha: true }), currentImg: null, currentSrc: null, raf: null, seq: 0 };
  });
  if (Object.keys(layers).length === 0) return;

  const spinner = document.getElementById('lmStageSpinner');
  const inflight = new Set();
  function setSpinner() { if (spinner) spinner.classList.toggle('is-visible', inflight.size > 0); }

  // ---- Loader: coda a concorrenza limitata + cache + de-dup + decode ----
  const MAX_CONCURRENT = 4, MAX_CACHE = 64;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  function touch(src) { const v = cache.get(src); if (v !== undefined) { cache.delete(src); cache.set(src, v); } }
  function evict() {
    if (cache.size <= MAX_CACHE) return;
    const keep = new Set(Object.values(urls()));
    for (const k of [...cache.keys()]) {
      if (cache.size <= MAX_CACHE) break;
      if (!keep.has(k)) cache.delete(k);
    }
  }
  function rawLoad(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      // decode() è solo un'ottimizzazione: su una tab in background può restare "pending"
      // all'infinito → NON la attendo (bloccherebbe il loader). La lancio best-effort.
      img.onload = () => { if (img.decode) { try { img.decode().catch(() => {}); } catch (e) {} } resolve(img); };
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
    const u = { base: manifest.scene.base + LV };
    groups.forEach(g => {
      const o = optById(g, state[g.id].sel);
      targetsOf(g).forEach(t => { u[t] = ((o.layers && o.layers[t]) || o.layer) + LV; });
    });
    return u;
  }

  // Offset di disegno: i WebP sono ritagliati al bounding box del gruppo (manifest .bbox = [x,y,w,h]).
  // Se il bbox manca (es. PNG full-frame di fallback / Amelie) disegno a piena cornice -> retro-compatibile.
  const BBOX = { base: null };
  groups.forEach(g => { const bb = Array.isArray(g.bbox) ? g.bbox : null; targetsOf(g).forEach(t => { BBOX[t] = bb; }); });
  function drawLayer(ctx, img, key) {
    const b = BBOX[key];
    if (b) ctx.drawImage(img, b[0], b[1]);      // dimensione nativa (ritaglio) all'offset del gruppo
    else ctx.drawImage(img, 0, 0, W, H);        // full-frame (base, o fallback)
  }

  async function setLayer(key, newSrc, fetchSrc) {
    const L = layers[key]; if (!L) return;
    if (L.currentSrc === newSrc) return;
    const seq = ++L.seq;     // con selezioni rapide, solo la richiesta piu' recente puo' spegnere lo spinner
    inflight.add(key); setSpinner();
    let newImg;
    try { newImg = await loadAndDecode(fetchSrc || newSrc, true); }
    catch (e) {
      if (seq === L.seq) { inflight.delete(key); setSpinner(); }
      // fallimento transitorio (rete instabile, CDN con 404 in cache subito dopo un deploy):
      // ritento con backoff invece di lasciare lo stage vuoto in silenzio. NB: il retry usa un
      // cache-buster proprio (&r=N) perche' il browser tiene in cache negativa il fallimento
      // dello STESSO URL per tutta la vita del documento (il retry identico fallirebbe subito).
      L.retries = (L.retries || 0) + 1;
      const RETRY_MS = [1500, 6000, 20000];          // ~27s di copertura: blip di rete / edge appena deployato
      if (L.retries <= RETRY_MS.length) {
        const bust = newSrc + (newSrc.includes('?') ? '&' : '?') + 'r=' + L.retries;
        setTimeout(() => { if (urls()[key] === newSrc && L.currentSrc !== newSrc) setLayer(key, newSrc, bust); }, RETRY_MS[L.retries - 1]);
      } else {
        console.error('Configuratore: layer non caricato dopo i retry:', newSrc);
      }
      return;
    }
    L.retries = 0;
    if (urls()[key] !== newSrc) { if (seq === L.seq) { inflight.delete(key); setSpinner(); } return; }
    if (L.raf) cancelAnimationFrame(L.raf);
    const oldImg = L.currentImg;
    L.currentSrc = newSrc;
    // Disegno immediato (niente crossfade) se: primo layer, reduced-motion,
    // oppure tab in background (rAF è in pausa → l'animazione non avanzerebbe).
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!oldImg || document.hidden || reduceMotion) {
      L.ctx.clearRect(0, 0, W, H); drawLayer(L.ctx, newImg, key);
      L.currentImg = newImg; inflight.delete(key); setSpinner(); return;
    }
    const DUR = 450, start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DUR), eased = easeInOutCubic(t);
      L.ctx.clearRect(0, 0, W, H);
      drawLayer(L.ctx, oldImg, key);
      L.ctx.globalAlpha = eased; drawLayer(L.ctx, newImg, key); L.ctx.globalAlpha = 1;
      if (t < 1) L.raf = requestAnimationFrame(step);
      else { L.raf = null; L.currentImg = newImg; inflight.delete(key); setSpinner(); }
    };
    L.raf = requestAnimationFrame(step);
  }
  function applyGroupLayer(gid) { const u = urls(); const g = groupById(gid); targetsOf(g).forEach(t => setLayer(t, u[t])); }
  function applyAllLayers() { const u = urls(); Object.keys(layers).forEach(k => setLayer(k, u[k])); }

  // precarico TUTTI i target dell'opzione (multi-canvas Amelie: layers={A,B}; senza, i file _B
  // arriverebbero a cache fredda e i due canvas sfumerebbero fuori sincrono mostrando finiture miste)
  function preloadOne(it) {
    const srcs = it.layers ? Object.values(it.layers) : [it.layer];
    srcs.forEach(s => loadAndDecode(s + LV).catch(() => {}));
  }
  function preloadItems(items) { if (!saveData) items.forEach(preloadOne); }
  function idlePreload() {
    if (saveData) return;
    const run = () => groups.forEach(g => preloadItems(itemsOfKind(g, state[g.id].tab)));
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 800);
  }

  // ---- DOM refs ----
  const els = {
    selection: document.getElementById('lmSelection'),
    downloadBtn: document.getElementById('lmDownloadBtn'),
    expandBtn: document.getElementById('lmExpandBtn'),
    lightbox: document.getElementById('lmLightbox'),
    lightboxCanvas: document.getElementById('lmLightboxCanvas'),
    lightboxClose: document.getElementById('lmLightboxClose'),
    lightboxCaption: document.getElementById('lmLightboxCaption'),
  };

  function makeTab(label, count, isActive, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lm-configurator__tab' + (isActive ? ' is-active' : '');
    b.setAttribute('role', 'tab');                                     // il container ha role=tablist
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    b.innerHTML = `${label}<span class="count">${count}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }
  function makeSwatch(item, isActive, onClick, onHover) {
    const el = document.createElement('button');
    el.className = 'lm-configurator__swatch' + (isActive ? ' is-active' : '');
    el.title = item.label; el.type = 'button';
    el.dataset.oid = item.id;
    el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    el.addEventListener('click', onClick);
    if (onHover) el.addEventListener('pointerenter', onHover, { passive: true, once: true });
    const img = document.createElement('img');
    // niente loading=lazy: le pagine 2+ del carosello sono clippate (overflow:hidden) -> il lazy le
    // rimanderebbe causando flash grigi al cambio pagina; fetchPriority low per non competere coi layer
    img.src = item.swatch; img.alt = item.label; img.decoding = 'async'; img.draggable = false;
    img.fetchPriority = 'low';
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

    // drag-to-scroll.
    // IMPORTANTE: la pointer-capture parte SOLO quando il movimento supera la soglia (vero drag).
    // Se la si chiama nel pointerdown, su mouse desktop il browser ridireziona il `click` al viewport
    // e lo swatch non viene mai selezionato (su touch invece funziona). Vedi docs/PIPELINE.md "Gotcha".
    const DRAG_THRESHOLD = 6;
    let down = false, moved = false, captured = false, pid = null, startX = 0, basePx = 0, vpW = 0;
    vp.addEventListener('pointerdown', (e) => {
      if (pages <= 1) return;
      down = true; moved = false; captured = false; pid = e.pointerId;
      startX = e.clientX; vpW = vp.clientWidth || 1; basePx = -cur * vpW;
      // NB: niente setPointerCapture / transition / is-grabbing qui: un click puro non deve essere "drag".
    });
    vp.addEventListener('pointermove', (e) => {
      if (!down) return;
      // pointerup perso fuori dal viewport (rilascio sotto soglia altrove): senza questo guard il
      // successivo hover senza bottoni premuti partirebbe come "drag fantasma" con startX stantio
      if (e.buttons === 0) { down = false; return; }
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true;                                  // ora e' un drag: catturo il pointer SOLO adesso
        track.style.transition = 'none'; vp.classList.add('is-grabbing');
        try { vp.setPointerCapture(pid); captured = true; } catch (_) {}
      }
      if (!moved) return;                              // sotto soglia: lascio intatto l'eventuale click
      let pos = basePx + dx;
      const min = -(pages - 1) * vpW, max = 0;
      if (pos > max) pos = max + (pos - max) * 0.3;
      if (pos < min) pos = min + (pos - min) * 0.3;
      track.style.transform = `translateX(${pos}px)`;
    });
    const end = (e) => {
      if (!down) return;
      down = false; vp.classList.remove('is-grabbing');
      if (captured) { try { vp.releasePointerCapture(pid); } catch (_) {} captured = false; }
      if (!moved) return;                              // click puro: non muovo la pagina, lascio agire onSelect
      const dx = (typeof e.clientX === 'number' ? e.clientX : startX) - startX;
      const th = Math.min(60, vpW * 0.18);
      let np = cur;
      if (dx <= -th) np = cur + 1; else if (dx >= th) np = cur - 1;
      goTo(np, true);
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    // sopprimo il click solo dopo un vero drag (cosi' il drag non seleziona per sbaglio).
    // `moved` va resettato dopo l'uso: altrimenti i click sintetici da tastiera (Enter/Space su uno
    // swatch, nessun pointerdown che lo azzeri) resterebbero bloccati per sempre dopo il primo drag.
    vp.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    track.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // ---- Render di un gruppo (tab tipo-finitura + carosello + nome selezionato) ----
  function renderGroup(g, enter) {
    const st = state[g.id];
    const kinds = kindsOf(g);
    const tabsEl = document.querySelector(`.lm-configurator__tabs[data-group="${g.id}"]`);
    const swEl = document.querySelector(`.lm-carousel[data-group="${g.id}"]`);
    const nameEl = document.querySelector(`.lm-configurator__selname[data-group="${g.id}"]`);

    if (tabsEl) {
      tabsEl.innerHTML = '';
      if (kinds.length > 1) {
        kinds.forEach(k => {
          const items = itemsOfKind(g, k);
          tabsEl.appendChild(makeTab(KIND_LABEL[k], items.length, k === st.tab, () => {
            if (st.tab === k) return;
            st.tab = k;
            const cur = optById(g, st.sel);
            st.page = (cur && cur.kind === k) ? pageOf(items, st.sel) : 0;
            renderGroup(g, true); preloadItems(items);
          }));
        });
      }
    }

    const updateName = () => {
      if (!nameEl) return;
      const cur = optById(g, st.sel);
      nameEl.innerHTML = cur ? `${KIND_LABEL[cur.kind]} · <strong>${cur.label}</strong>` : '—';
    };

    const items = itemsOfKind(g, st.tab);
    buildCarousel(swEl, items, st.sel, st.page,
      (it) => {
        if (st.sel === it.id) return;
        st.sel = it.id;
        // selezione aggiornata IN PLACE: il rebuild completo (renderGroup) distruggeva/ricreava tutto
        // il DOM del gruppo a ogni click (focus perso, churn di N <img>, flicker su dispositivi lenti)
        swEl.querySelectorAll('.lm-configurator__swatch').forEach(b => {
          const on = b.dataset.oid === it.id;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        updateName();
        applyGroupLayer(g.id); updateMeta();
      },
      (p)  => { st.page = p; },
      (it) => preloadOne(it), enter);

    updateName();
  }

  // ---- Riepilogo selezione sotto lo stage ----
  function updateMeta() {
    if (!els.selection) return;
    els.selection.innerHTML = '';
    groups.forEach(g => {
      const cur = optById(g, state[g.id].sel);
      const span = document.createElement('span');
      span.className = 'lm-configurator__sel';
      span.innerHTML = `<span class="label">${g.label}</span><b>${cur ? cur.label : '—'}</b>`;
      els.selection.appendChild(span);
    });
  }
  function captionText() {
    return groups.map(g => {
      const cur = optById(g, state[g.id].sel);
      return `${g.label}: ${cur ? cur.label : '—'}`;
    }).join('  ·  ');
  }

  // ---- Composite di tutti i layer (risoluzione nativa) ----
  function paintComposite(targetCtx) {
    PAINT_ORDER.forEach(k => layers[k] && targetCtx.drawImage(layers[k].canvas, 0, 0, W, H));
  }

  if (els.downloadBtn) els.downloadBtn.addEventListener('click', () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    paintComposite(cv.getContext('2d'));
    // toBlob: encode PNG off-main-thread (toDataURL sincrono congelava la UI ~mezzo secondo a 2560px)
    try {
      cv.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = slug(manifest.product) + '-configurazione.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    } catch (e) {
      // canvas tainted (apertura da file://): il download non e' possibile, lo dico chiaramente
      console.error('Download non disponibile da file:// (canvas tainted). Servire la pagina via http.', e);
    }
  });

  // ---- Lightbox a schermo intero ----
  if (els.expandBtn && els.lightbox && els.lightboxCanvas) {
    const lb = els.lightbox;
    const lbCtx = els.lightboxCanvas.getContext('2d');
    let lastFocus = null;
    const open = () => {
      els.lightboxCanvas.width = W; els.lightboxCanvas.height = H;
      lbCtx.clearRect(0, 0, W, H);
      paintComposite(lbCtx);
      if (els.lightboxCaption) els.lightboxCaption.textContent = captionText();
      lastFocus = document.activeElement;
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('lm-noscroll');
      document.body.classList.add('lm-noscroll');
      if (els.lightboxClose) els.lightboxClose.focus();
    };
    const close = () => {
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('lm-noscroll');
      document.body.classList.remove('lm-noscroll');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    els.expandBtn.addEventListener('click', open);
    if (els.lightboxClose) els.lightboxClose.addEventListener('click', close);
    lb.addEventListener('click', (e) => {
      if (e.target.closest('.lm-lightbox__canvas') || e.target.closest('.lm-lightbox__close')) return;
      close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lb.classList.contains('is-open')) close(); });
    // focus trap: aria-modal non intrappola il focus da solo; con Tab uscirebbe dietro l'overlay
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && lb.classList.contains('is-open')) { e.preventDefault(); if (els.lightboxClose) els.lightboxClose.focus(); }
    });
  }

  // ---- Accordion: attivo quando i componenti sono > 2 (prima sezione aperta, singolo aperto) ----
  function setupAccordion() {
    if (groups.length <= 2) return;
    const panel = document.querySelector('.lm-configurator__panel');
    if (!panel) return;
    const sections = [...panel.querySelectorAll('.lm-configurator__section')];
    if (sections.length <= 2) return;
    panel.classList.add('lm-configurator__panel--accordion');
    // l'altezza e il fade sono gestiti dalla CSS (grid-template-rows 0fr/1fr + opacity sull'is-open):
    // qui ci limitiamo a togglare la classe (singolo aperto).
    const setOpen = (sec) => sections.forEach(s => {
      const on = s === sec;
      s.classList.toggle('is-open', on);
      const t = s.querySelector('.lm-configurator__panel-title');
      if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    sections.forEach(sec => {
      const title = sec.querySelector('.lm-configurator__panel-title');
      if (!title) return;
      // avvolgo il corpo collassabile (tabs + carosello; kicker/selname sono nascosti)
      const body = document.createElement('div'); body.className = 'lm-configurator__acc-body';
      const inner = document.createElement('div'); inner.className = 'lm-configurator__acc-inner';
      let n = title.nextSibling;
      while (n) { const next = n.nextSibling; inner.appendChild(n); n = next; }
      body.appendChild(inner); sec.appendChild(body);
      title.setAttribute('role', 'button'); title.setAttribute('tabindex', '0');
      title.addEventListener('click', () => setOpen(sec));
      title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(sec); } });
    });
    setOpen(sections[0]);   // prima sezione aperta
  }

  groups.forEach(g => renderGroup(g));
  setupAccordion();
  updateMeta();
  applyAllLayers();
  idlePreload();
})();
