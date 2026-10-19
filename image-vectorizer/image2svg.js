(function () {
  'use strict';
  var IT = window.ImageTracer;
  var MAX_BYTES = 12 * 1024 * 1024;

  var $ = function (id) { return document.getElementById(id); };
  var fileInput = $('fileInput'), drop = $('drop'), modeSeg = $('modeSeg');
  var colorsRange = $('colorsRange'), colorsVal = $('colorsVal');
  var smoothRange = $('smoothRange'), smoothVal = $('smoothVal');
  var noiseRange = $('noiseRange'), noiseVal = $('noiseVal');
  var sizeSelect = $('sizeSelect'), presetSelect = $('presetSelect');
  var traceBtn = $('traceBtn'), copyBtn = $('copyBtn'), downloadBtn = $('downloadBtn');
  var nameInput = $('nameInput'), statusEl = $('status'), readyBadge = $('readyBadge');
  var viewBox = $('viewBox'), stObj = $('stObj'), stCol = $('stCol'), stKb = $('stKb'), stFid = $('stFid');
  var analyzeBtn = $('analyzeBtn'), applyBtn = $('applyBtn'), analysisText = $('analysisText');
  var layerList = $('layerList'), layerCount = $('layerCount'), selAllBtn = $('selAllBtn'), selNoneBtn = $('selNoneBtn');

  var mode = 'color', view = 'orig', lastImgd = null;
  var lineWrap = $('lineWrap'), lineRange = $('lineRange'), lineVal = $('lineVal');
  var srcUrl = null, srcImg = null, srcName = 'hasil';
  var fullSvg = null, svgText = null;      // fullSvg = hasil trace utuh, svgText = setelah filter layer
  var layers = [], selected = {};
  var recommendation = null;

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setReady(ok) {
    readyBadge.textContent = ok ? 'SIAP' : 'MENUNGGU';
    readyBadge.className = 'badge' + (ok ? ' ok' : '');
  }

  // ---------- Mode dan slider ----------
  function setMode(m) {
    mode = m;
    var all = modeSeg.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].getAttribute('data-mode') === m);
    colorsRange.disabled = (m === 'bw');
    lineWrap.style.display = (m === 'dual') ? 'block' : 'none';
  }
  modeSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (b) setMode(b.getAttribute('data-mode'));
  });
  colorsRange.addEventListener('input', function () { colorsVal.textContent = colorsRange.value; });
  smoothRange.addEventListener('input', function () { smoothVal.textContent = smoothRange.value; });
  noiseRange.addEventListener('input', function () { noiseVal.textContent = noiseRange.value; });
  lineRange.addEventListener('input', function () { lineVal.textContent = lineRange.value; });

  // ---------- Muat gambar ----------
  fileInput.addEventListener('change', function () { loadFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setStatus('Format tidak didukung. Pakai PNG, JPG, atau WEBP.', 'error'); return; }
    if (file.size > MAX_BYTES) { setStatus('File terlalu besar. Maksimal 12 MB.', 'error'); return; }
    srcName = file.name.replace(/\.[^/.]+$/, '') || 'hasil';
    nameInput.value = srcName;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        srcImg = img; srcUrl = ev.target.result;
        fullSvg = null; svgText = null; layers = []; selected = {};
        traceBtn.disabled = false;
        analyzeBtn.disabled = false;
        applyBtn.disabled = true; recommendation = null;
        analysisText.textContent = 'Klik Analisis untuk mendapat rekomendasi setting.';
        copyBtn.disabled = true; downloadBtn.disabled = true;
        setReady(false);
        stObj.textContent = '0'; stCol.textContent = '0'; stKb.textContent = '0'; stFid.textContent = '-';
        renderLayers();
        view = 'orig'; applyView();
        setStatus('Gambar dimuat. Klik Analisis atau atur manual, lalu Trace.', 'ok');
      };
      img.onerror = function () { setStatus('Gagal membaca gambar.', 'error'); };
      img.src = ev.target.result;
    };
    reader.onerror = function () { setStatus('Gagal membaca file.', 'error'); };
    reader.readAsDataURL(file);
  }

  // ---------- Pemrosesan piksel ----------
  function getImageData(img, maxSide) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var ratio = Math.min(1, maxSide / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * ratio)), th = Math.max(1, Math.round(h * ratio));
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, tw, th);
    return ctx.getImageData(0, 0, tw, th);
  }

  function prepare(imgd, bw) {
    var d = imgd.data;
    for (var p = 0; p < d.length; p += 4) {
      if (d[p + 3] < 128) { d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0; continue; }
      d[p + 3] = 255;
      if (bw) {
        var g = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
        d[p] = d[p + 1] = d[p + 2] = g;
      }
    }
    return imgd;
  }

  // ---------- Analisis otomatis (heuristik sederhana) ----------
  function analyze() {
    var imgd = getImageData(srcImg, 300);
    var d = imgd.data, w = imgd.width, h = imgd.height;
    var n = 0, opaque = 0, satSum = 0, edges = 0, flatPairs = 0, pairs = 0;
    var hist = {};
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        n++;
        if (d[p + 3] < 128) continue;
        opaque++;
        var r = d[p], g = d[p + 1], b = d[p + 2];
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        satSum += mx === 0 ? 0 : (mx - mn) / mx;
        var key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
        hist[key] = (hist[key] || 0) + 1;
        if (x + 1 < w) {
          var q = p + 4;
          pairs++;
          if (d[q + 3] >= 128) {
            if (Math.abs(d[q] - r) <= 12 && Math.abs(d[q + 1] - g) <= 12 && Math.abs(d[q + 2] - b) <= 12) flatPairs++;
            var lum1 = 0.3 * r + 0.59 * g + 0.11 * b, lum2 = 0.3 * d[q] + 0.59 * d[q + 1] + 0.11 * d[q + 2];
            if (Math.abs(lum1 - lum2) > 24) edges++;
          }
        }
      }
    }
    if (opaque === 0) return null;

    // Warna dominan: kuantisasi 16 level per kanal, ambil yang >= 0,5% piksel
    var k = 0;
    Object.keys(hist).forEach(function (key) { if (hist[key] / opaque >= 0.015) k++; });
    var sat = satSum / opaque;
    var flat = pairs ? flatPairs / pairs : 0;
    var edgeRatio = pairs ? edges / pairs : 0;
    var transparent = 1 - opaque / n;

    var rec, type, why;
    if (sat < 0.08) {
      // Gambar hampir tanpa warna: selalu rekomendasikan Hitam & Putih
      if (k <= 4) {
        type = 'Hitam putih / line art';
        rec = { mode: 'bw', colors: 2, smooth: 0, noise: 6 };
        why = 'hampir tanpa warna dan hanya ' + k + ' tone dominan.';
      } else {
        type = 'Grayscale / sketsa';
        rec = { mode: 'bw', colors: 2, smooth: 0, noise: 4 };
        why = 'hampir tanpa warna (abu-abu) dengan banyak tone, cocok dibuat hitam putih.';
      }
    } else if (flat > 0.75 && k <= 16) {
      type = 'Ilustrasi datar';
      rec = { mode: 'color', colors: Math.min(16, Math.max(8, k + 2)), smooth: 0, noise: 4 };
      why = 'area warna sangat rata (' + Math.round(flat * 100) + '% piksel sama dengan tetangganya).';
    } else if (k > 40 || flat < 0.4) {
      type = 'Foto / gambar kompleks';
      rec = { mode: 'color', colors: 16, smooth: 1, noise: 8 };
      why = 'banyak variasi warna (' + k + ' warna dominan) dan tekstur halus.';
    } else {
      type = 'Ilustrasi bertekstur / anime berbayangan';
      rec = { mode: 'color', colors: Math.min(16, Math.max(10, k + 2)), smooth: 0, noise: 5 };
      why = 'ada area datar dengan bayangan (' + k + ' warna dominan, ' + Math.round(edgeRatio * 100) + '% tepi).';
    }
    rec.type = type; rec.why = why; rec.transparent = Math.round(transparent * 100);
    return rec;
  }

  analyzeBtn.addEventListener('click', function () {
    if (!srcImg) return;
    var rec = analyze();
    if (!rec) { analysisText.textContent = 'Gambar kosong atau sepenuhnya transparan.'; return; }
    recommendation = rec;
    var modeName = rec.mode === 'bw' ? 'Hitam & Putih' : 'Warna';
    analysisText.innerHTML = '<strong>' + rec.type + '</strong><br>' + rec.why +
      '<br>Rekomendasi: mode <strong>' + modeName + '</strong>, detail warna <strong>' + rec.colors +
      '</strong>, kehalusan <strong>' + rec.smooth + '</strong>, noise removal <strong>' + rec.noise + '</strong>.';
    applyBtn.disabled = false;
  });

  applyBtn.addEventListener('click', function () {
    if (!recommendation) return;
    setMode(recommendation.mode);
    colorsRange.value = recommendation.colors; colorsVal.textContent = recommendation.colors;
    smoothRange.value = recommendation.smooth; smoothVal.textContent = recommendation.smooth;
    noiseRange.value = recommendation.noise; noiseVal.textContent = recommendation.noise;
    setStatus('Rekomendasi diterapkan. Klik Trace.', 'ok');
  });

  // ---------- Helper trace ----------
  function cloneImgd(src) {
    return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  }

  // Dual Engine, engine Line: piksel gelap jadi hitam, sisanya putih
  function lineMask(imgd, threshold) {
    var d = imgd.data;
    for (var p = 0; p < d.length; p += 4) {
      if (d[p + 3] < 128) { d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = 255; continue; }
      var lum = 0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2];
      var v = lum < threshold ? 0 : 255;
      d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
    }
    return imgd;
  }

  function pathsOf(svg) {
    var out = [], re = /<path\b[^>]*\/>/g, m;
    while ((m = re.exec(svg))) {
      var f = /fill="([^"]*)"/.exec(m[0]);
      out.push({ tag: m[0], fill: f ? f[1] : 'none' });
    }
    return out;
  }

  function fillLuminance(fill) {
    var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(fill);
    if (!m) return 255;
    return 0.3 * +m[1] + 0.59 * +m[2] + 0.11 * +m[3];
  }

  function traceDual(base) {
    var fillSvg = IT.imagedataToSVG(cloneImgd(base), buildOptions());
    var lineSvg = IT.imagedataToSVG(lineMask(cloneImgd(base), parseInt(lineRange.value, 10)), {
      numberofcolors: 2, colorsampling: 2, colorquantcycles: 3, pathomit: 1,
      blurradius: 0, blurdelta: 20, ltres: 0.5, qtres: 0.5, strokewidth: 0
    });
    var header = /<svg\b[^>]*>/.exec(fillSvg)[0];
    var fillTags = pathsOf(fillSvg).map(function (p) { return p.tag; });
    var lineTags = pathsOf(lineSvg).filter(function (p) { return fillLuminance(p.fill) < 128; })
      .map(function (p) { return p.tag; });
    return [header,
      '<g id="fill">', fillTags.join('\n'), '</g>',
      '<g id="line">', lineTags.join('\n'), '</g>',
      '</svg>'].join('\n');
  }

  // ---------- Opsi trace ----------
  function buildOptions() {
    var preset = IT.optionpresets[presetSelect.value] || {};
    var o = {};
    for (var k in preset) if (preset.hasOwnProperty(k)) o[k] = preset[k];
    o.numberofcolors = mode === 'bw' ? 2 : parseInt(colorsRange.value, 10);
    o.colorsampling = 2;      // ambil warna dari gambar (0 = palet tetap, membuat warna meleset)
    o.colorquantcycles = 3;   // rapikan palet beberapa siklus
    o.pathomit = parseInt(noiseRange.value, 10);
    o.blurradius = parseInt(smoothRange.value, 10);
    o.blurdelta = 20;
    o.strokewidth = 0;
    return o;
  }

  // ---------- Layer (dikelompokkan per warna fill) ----------
  function parseLayers(svg) {
    var re = /<path\b[^>]*\/>/g, m, map = {}, order = [];
    while ((m = re.exec(svg))) {
      var f = /fill="([^"]*)"/.exec(m[0]);
      var fill = f ? f[1] : 'none';
      if (fill === 'none') continue;
      if (!map[fill]) { map[fill] = { fill: fill, count: 0, chars: 0 }; order.push(fill); }
      map[fill].count++;
      map[fill].chars += m[0].length;
    }
    return order.map(function (k, i) { var l = map[k]; l.index = i; return l; });
  }

  function buildSvg(full, keepFills) {
    var header = /<svg\b[^>]*>/.exec(full)[0];
    var out = [header], re = /<path\b[^>]*\/>/g, m;
    while ((m = re.exec(full))) {
      var f = /fill="([^"]*)"/.exec(m[0]);
      if (f && keepFills.indexOf(f[1]) >= 0) out.push(m[0]);
    }
    out.push('</svg>');
    return out.join('\n');
  }

  function chosenFills() {
    return layers.filter(function (l) { return selected[l.index]; }).map(function (l) { return l.fill; });
  }

  function renderLayers() {
    layerList.innerHTML = '';
    if (!layers.length) {
      layerList.innerHTML = '<div class="placeholder" style="padding:12px;font-size:0.8rem">Layer muncul setelah Trace.</div>';
      layerCount.textContent = 'Belum ada layer';
      selAllBtn.disabled = true; selNoneBtn.disabled = true;
      return;
    }
    layers.forEach(function (l) {
      var row = document.createElement('label');
      row.className = 'layer';
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = l.fill.indexOf('rgb') === 0 ? l.fill : '#888';
      var txt = document.createElement('span');
      txt.textContent = 'Layer ' + (l.index + 1);
      var small = document.createElement('small');
      small.textContent = l.count + ' objek · ' + (l.chars / 1024).toFixed(0) + ' KB';
      txt.appendChild(small);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!selected[l.index];
      cb.addEventListener('change', function () {
        selected[l.index] = cb.checked;
        applyLayerFilter();
      });
      row.appendChild(sw); row.appendChild(txt); row.appendChild(cb);
      layerList.appendChild(row);
    });
    selAllBtn.disabled = false; selNoneBtn.disabled = false;
    updateLayerCount();
  }

  function updateLayerCount() {
    var n = layers.filter(function (l) { return selected[l.index]; }).length;
    layerCount.textContent = n + ' dari ' + layers.length + ' layer dipilih';
  }

  function applyLayerFilter() {
    if (!fullSvg) return;
    updateLayerCount();
    var keep = chosenFills();
    if (keep.length === 0) {
      svgText = null;
      copyBtn.disabled = true; downloadBtn.disabled = true; setReady(false);
      stObj.textContent = '0'; stCol.textContent = '0'; stKb.textContent = '0';
      setStatus('Pilih minimal satu layer.', 'error');
      applyView();
      return;
    }
    svgText = buildSvg(fullSvg, keep);
    var st = countStats(svgText);
    stObj.textContent = st.objects; stCol.textContent = st.colors; stKb.textContent = st.kb;
    copyBtn.disabled = false; downloadBtn.disabled = false; setReady(true);
    setStatus(keep.length + ' layer dipakai, ' + st.objects + ' objek, ' + st.kb + ' KB.', 'ok');
    applyView();
  }

  selAllBtn.addEventListener('click', function () {
    layers.forEach(function (l) { selected[l.index] = true; });
    renderLayers(); applyLayerFilter();
  });
  selNoneBtn.addEventListener('click', function () {
    layers.forEach(function (l) { selected[l.index] = false; });
    renderLayers(); applyLayerFilter();
  });

  // Kemiripan warna: rasterisasi SVG di canvas, lalu bandingkan dengan piksel asli (skor 0-100)
  function fidelity(svg, imgd) {
    return new Promise(function (resolve) {
      try {
        var blob = new Blob([svg], { type: 'image/svg+xml' });
        var url = URL.createObjectURL(blob);
        var im = new Image();
        im.onload = function () {
          try {
            var c = document.createElement('canvas');
            c.width = imgd.width; c.height = imgd.height;
            var ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(im, 0, 0, c.width, c.height);
            var v = ctx.getImageData(0, 0, c.width, c.height).data;
            var a = imgd.data, sum = 0, cnt = 0;
            for (var p = 0; p < a.length; p += 4) {
              if (a[p + 3] < 128) continue;
              cnt++;
              sum += Math.abs(a[p] - v[p]) + Math.abs(a[p + 1] - v[p + 1]) + Math.abs(a[p + 2] - v[p + 2]);
            }
            URL.revokeObjectURL(url);
            resolve(cnt ? Math.max(0, Math.round(100 - (sum / cnt / 3) / 255 * 100)) : null);
          } catch (e) { URL.revokeObjectURL(url); resolve(null); }
        };
        im.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
        im.src = url;
      } catch (e) { resolve(null); }
    });
  }

  function countStats(svg) {
    var objects = (svg.match(/<path/g) || []).length;
    var fills = {};
    var re = /fill="([^"]*)"/g, m;
    while ((m = re.exec(svg))) if (m[1] !== 'none') fills[m[1]] = true;
    return { objects: objects, colors: Object.keys(fills).length, kb: (svg.length / 1024).toFixed(0) };
  }

  // ---------- Trace ----------
  traceBtn.addEventListener('click', function () {
    if (!srcImg) return;
    traceBtn.disabled = true;
    setStatus('Memproses... mohon tunggu.', '');
    setTimeout(function () {
      try {
        var base = getImageData(srcImg, parseInt(sizeSelect.value, 10));
        if (mode === 'dual') {
          fullSvg = traceDual(base);
          lastImgd = prepare(cloneImgd(base), false);
        } else {
          fullSvg = IT.imagedataToSVG(prepare(cloneImgd(base), mode === 'bw'), buildOptions());
          lastImgd = prepare(cloneImgd(base), mode === 'bw');
        }
        layers = parseLayers(fullSvg);
        selected = {};
        layers.forEach(function (l) { selected[l.index] = true; });
        renderLayers();
        applyLayerFilter();
        view = 'split'; applyView();
        fidelity(fullSvg, lastImgd).then(function (score) {
          if (score !== null) stFid.textContent = score + '%';
        });
      } catch (err) {
        fullSvg = null; svgText = null; layers = []; renderLayers();
        setReady(false);
        setStatus('Terjadi kesalahan: ' + (err && err.message ? err.message : err), 'error');
      } finally {
        traceBtn.disabled = false;
      }
    }, 30);
  });

  // ---------- Tampilan hasil ----------
  var tabs = document.querySelectorAll('.tabs button');
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener('click', function (e) {
      view = e.currentTarget.getAttribute('data-view');
      applyView();
    });
  }

  function fitSvg(root) {
    var s = (root || viewBox).querySelector('svg');
    if (!s) return;
    if (!s.getAttribute('viewBox')) {
      var w = parseFloat(s.getAttribute('width')), h = parseFloat(s.getAttribute('height'));
      if (w > 0 && h > 0) s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    }
    s.removeAttribute('width'); s.removeAttribute('height');
    s.style.width = '100%'; s.style.height = 'auto';
  }

  function applyView() {
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-view') === view);
    if (!srcUrl) { viewBox.innerHTML = '<div class="placeholder">Gambar asli akan tampil di sini</div>'; return; }
    if (view === 'orig') {
      viewBox.innerHTML = '<img alt="Gambar asli" src="' + srcUrl + '" />';
    } else if (view === 'vec') {
      if (!svgText) { viewBox.innerHTML = '<div class="placeholder">Klik Trace untuk membuat vektor</div>'; return; }
      viewBox.innerHTML = svgText;
      fitSvg();
    } else {
      if (!svgText) { viewBox.innerHTML = '<div class="split"><div><img alt="Asli" src="' + srcUrl + '" /></div><div class="placeholder">Belum ada hasil</div></div>'; return; }
      viewBox.innerHTML = '<div class="split"><div><img alt="Asli" src="' + srcUrl + '" /></div><div id="splitVec"></div></div>';
      $('splitVec').innerHTML = svgText;
      fitSvg($('splitVec'));
    }
  }

  // ---------- Salin dan unduh ----------
  copyBtn.addEventListener('click', function () {
    if (!svgText) return;
    var done = function () { setStatus('SVG disalin ke clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(svgText).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = svgText; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { setStatus('Gagal menyalin.', 'error'); }
      document.body.removeChild(ta);
    }
  });

  downloadBtn.addEventListener('click', function () {
    if (!svgText) return;
    var name = (nameInput.value || 'hasil').replace(/[\\\/:*?"<>|]+/g, '_') + '.svg';
    var blob = new Blob([svgText], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  setMode('color');
  applyView();
})();
