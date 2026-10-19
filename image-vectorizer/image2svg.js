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
  var edits = {};   // edit per layer: fill asli -> { hex: '#rrggbb', alpha: 0..1 }
  var resetEditBtn = $('resetEditBtn');
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

  // ---------- Palet warna: k-means di ruang warna CIE Lab ----------
  // Lab = jarak warna mendekati persepsi mata manusia (RGB berjarak tidak seimbang).
  function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linearToSrgb(c) {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  function rgbToLab(r, g, b) {
    var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    var X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    var Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    var Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    var fx = X > 0.008856 ? Math.cbrt(X) : 7.787 * X + 16 / 116;
    var fy = Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116;
    var fz = Z > 0.008856 ? Math.cbrt(Z) : 7.787 * Z + 16 / 116;
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function labToRgb(L, a, b) {
    var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    function inv(t) { return t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787; }
    var X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
    return {
      r: linearToSrgb(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
      g: linearToSrgb(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
      b: linearToSrgb(0.0557 * X - 0.2040 * Y + 1.0570 * Z)
    };
  }
  function labDist(p, q) {
    var dL = p[0] - q[0], da = p[1] - q[1], db = p[2] - q[2];
    return dL * dL + da * da + db * db;
  }

  // Palet k warna. Piksel tepi (anti-aliasing) dilewati supaya warna campuran di batas
  // tidak ikut menjadi warna sendiri. Warna yang hampir sama (ΔE < 4) digabung.
  function kmeansPalette(imgd, k) {
    var d = imgd.data, w = imgd.width, h = imgd.height, pts = [];
    var step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
    function lum(q) { return 0.3 * d[q] + 0.59 * d[q + 1] + 0.11 * d[q + 2]; }
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var p = (y * w + x) * 4;
        if (d[p + 3] < 128) continue;
        if (x + 1 < w && d[p + 7] >= 128 && Math.abs(lum(p) - lum(p + 4)) > 18) continue;
        if (y + 1 < h && d[p + w * 4 + 3] >= 128 && Math.abs(lum(p) - lum(p + w * 4)) > 18) continue;
        pts.push(rgbToLab(d[p], d[p + 1], d[p + 2]));
      }
    }
    if (pts.length === 0) {
      for (var q = 0; q < d.length; q += 4 * step) {
        if (d[q + 3] >= 128) pts.push(rgbToLab(d[q], d[q + 1], d[q + 2]));
      }
    }
    if (pts.length === 0) return [];

    var kk = Math.max(1, Math.min(k, pts.length));
    // k-means++ init, deterministik: mulai dari piksel pertama, lalu titik terjauh
    var cent = [pts[0].slice()];
    var dist = pts.map(function (c) { return labDist(c, cent[0]); });
    while (cent.length < kk) {
      var best = 0;
      for (var i = 1; i < dist.length; i++) if (dist[i] > dist[best]) best = i;
      cent.push(pts[best].slice());
      for (var j = 0; j < pts.length; j++) dist[j] = Math.min(dist[j], labDist(pts[j], cent[cent.length - 1]));
    }

    var counts = [];
    for (var it = 0; it < 12; it++) {
      counts = cent.map(function () { return 0; });
      var sums = cent.map(function () { return [0, 0, 0]; });
      for (var a = 0; a < pts.length; a++) {
        var bi = 0, bd = Infinity;
        for (var c = 0; c < cent.length; c++) {
          var dd = labDist(pts[a], cent[c]);
          if (dd < bd) { bd = dd; bi = c; }
        }
        counts[bi]++;
        sums[bi][0] += pts[a][0]; sums[bi][1] += pts[a][1]; sums[bi][2] += pts[a][2];
      }
      for (var q2 = 0; q2 < cent.length; q2++) {
        if (counts[q2] > 0) cent[q2] = [sums[q2][0] / counts[q2], sums[q2][1] / counts[q2], sums[q2][2] / counts[q2]];
      }
    }

    // Gabung warna yang hampir sama (ΔE < 4)
    var out = [];
    cent.forEach(function (lab, idx) {
      if (counts[idx] === 0) return;
      for (var m = 0; m < out.length; m++) {
        if (labDist(lab, out[m].lab) < 16) { out[m].count += counts[idx]; return; }
      }
      var rgb = labToRgb(lab[0], lab[1], lab[2]);
      out.push({ r: rgb.r, g: rgb.g, b: rgb.b, lab: lab, count: counts[idx] });
    });
    return out.sort(function (x, y) { return y.count - x.count; });
  }

  // Buang komponen mask (4 arah) yang luasnya di bawah minSize piksel
  function removeSmall(m, w, h, minSize) {
    var n = w * h, seen = new Uint8Array(n), buf = new Int32Array(n);
    for (var s = 0; s < n; s++) {
      if (seen[s] || m[s * 4] !== 0) continue;
      var head = 0, cnt = 0;
      buf[cnt++] = s; seen[s] = 1;
      while (head < cnt) {
        var cur = buf[head++], x = cur % w, y = (cur - x) / w;
        var nb = [];
        if (x > 0) nb.push(cur - 1);
        if (x < w - 1) nb.push(cur + 1);
        if (y > 0) nb.push(cur - w);
        if (y < h - 1) nb.push(cur + w);
        for (var k = 0; k < nb.length; k++) {
          var v = nb[k];
          if (!seen[v] && m[v * 4] === 0) { seen[v] = 1; buf[cnt++] = v; }
        }
      }
      if (cnt < minSize) {
        for (var z = 0; z < cnt; z++) { var q = buf[z] * 4; m[q] = m[q + 1] = m[q + 2] = 255; }
      }
    }
  }

  // Mode filter 3x3: piksel diganti label terbanyak di sekitarnya (menghapus bintik)
  function modeFilter(idx, w, h) {
    var out = new Int16Array(idx.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var j = y * w + x, cur = idx[j];
        if (cur < 0) { out[j] = -1; continue; }
        var counts = {};
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            var v = idx[yy * w + xx];
            if (v < 0) continue;
            counts[v] = (counts[v] || 0) + 1;
          }
        }
        var selfN = counts[cur] || 0, best = cur, bestN = selfN;
        for (var key in counts) {
          if (counts[key] > bestN) { bestN = counts[key]; best = +key; }
        }
        out[j] = best;
      }
    }
    return out;
  }

  // Piksel j termasuk label ci, atau bertetangga 4 arah dengan label ci
  function inLabel(idx, w, h, j, ci) {
    if (idx[j] === ci) return true;
    var x = j % w, y = (j - x) / w;
    if (x > 0 && idx[j - 1] === ci) return true;
    if (x < w - 1 && idx[j + 1] === ci) return true;
    if (y > 0 && idx[j - w] === ci) return true;
    if (y < h - 1 && idx[j + w] === ci) return true;
    return false;
  }

  // Trace per warna: tiap warna palet jadi mask hitam putih, ditrace, lalu diberi warna aslinya
  function traceByColor(base) {
    var k = parseInt(colorsRange.value, 10);
    var palette = kmeansPalette(base, k);
    if (!palette.length) throw new Error('Gambar tidak punya piksel yang terlihat.');
    var d = base.data, n = base.width * base.height;
    var palLab = palette.map(function (c) { return c.lab; });
    // Tetapkan setiap piksel opaque ke palet terdekat (jarak Lab)
    var idx = new Int16Array(n).fill(-1);
    for (var p = 0, i = 0; i < n; i++, p += 4) {
      if (d[p + 3] < 128) continue;
      var lab = rgbToLab(d[p], d[p + 1], d[p + 2]);
      var bi = 0, bd = Infinity;
      for (var c = 0; c < palLab.length; c++) {
        var dd = labDist(lab, palLab[c]);
        if (dd < bd) { bd = dd; bi = c; }
      }
      idx[i] = bi;
    }
    // Hilangkan bintik: setiap piksel mengikuti label mayoritas di sekitarnya (3x3)
    idx = modeFilter(idx, base.width, base.height);
    var W = base.width, H = base.height;
    var noise = parseInt(noiseRange.value, 10), smooth = parseInt(smoothRange.value, 10);
    var minSize = 4 + noise;   // area minimum (piksel) sebuah bagian agar tidak dibuang
    var out = [];
    palette.forEach(function (col, ci) {
      var mask = { width: base.width, height: base.height, data: new Uint8ClampedArray(n * 4) };
      var m = mask.data, any = false;
      for (var j = 0; j < n; j++) {
        var q = j * 4;
        // Mask diperlebar 1 piksel ke tetangga, supaya tidak ada celah putih antar layer
        if (inLabel(idx, W, H, j, ci)) { m[q] = m[q + 1] = m[q + 2] = 0; any = true; }
        else { m[q] = m[q + 1] = m[q + 2] = 255; }
        m[q + 3] = 255;
      }
      removeSmall(m, W, H, minSize);
      any = false;
      for (var t = 0; t < n; t++) { if (m[t * 4] === 0) { any = true; break; } }
      if (!any) return;
      var svg = IT.imagedataToSVG(mask, {
        numberofcolors: 2, colorsampling: 0, colorquantcycles: 1,
        pathomit: noise, blurradius: smooth, blurdelta: 20,
        ltres: 1, qtres: 1, strokewidth: 0
      });
      var fill = 'rgb(' + col.r + ',' + col.g + ',' + col.b + ')';
      pathsOf(svg).forEach(function (pp) {
        if (fillLuminance(pp.fill) < 128) {
          out.push(pp.tag.replace(/fill="[^"]*"/, 'fill="' + fill + '"'));
        }
      });
    });
    return out;
  }

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
    var fillTags = traceByColor(cloneImgd(base));
    var lineSvg = IT.imagedataToSVG(lineMask(cloneImgd(base), parseInt(lineRange.value, 10)), {
      numberofcolors: 2, colorsampling: 2, colorquantcycles: 3, pathomit: 1,
      blurradius: 0, blurdelta: 20, ltres: 0.5, qtres: 0.5, strokewidth: 0
    });
    var header = '<svg width="' + base.width + '" height="' + base.height + '" version="1.1" xmlns="http://www.w3.org/2000/svg">';
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
      var tag = m[0];
      var f = /fill="([^"]*)"/.exec(tag);
      if (!f || keepFills.indexOf(f[1]) < 0) continue;
      var e = edits[f[1]];
      if (e) {
        tag = tag.replace(/fill="[^"]*"/, 'fill="' + e.hex + '"');
        tag = tag.replace(/\s*fill-opacity="[^"]*"/, '');
        tag = tag.replace(/\/>$/, ' fill-opacity="' + e.alpha.toFixed(2) + '" />');
      }
      out.push(tag);
    }
    out.push('</svg>');
    return out.join('\n');
  }

  function rgbToHex(fill) {
    var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(fill);
    if (!m) return '#888888';
    return '#' + [m[1], m[2], m[3]].map(function (v) {
      var h = (+v).toString(16); return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  function currentHex(l) { return edits[l.fill] ? edits[l.fill].hex : rgbToHex(l.fill); }
  function currentAlpha(l) { return edits[l.fill] ? edits[l.fill].alpha : 1; }

  function chosenFills() {
    return layers.filter(function (l) { return selected[l.index]; }).map(function (l) { return l.fill; });
  }

  function renderLayers() {
    layerList.innerHTML = '';
    if (!layers.length) {
      layerList.innerHTML = '<div class="placeholder" style="padding:12px;font-size:0.8rem">Layer muncul setelah Trace.</div>';
      layerCount.textContent = 'Belum ada layer';
      selAllBtn.disabled = true; selNoneBtn.disabled = true; resetEditBtn.disabled = true;
      return;
    }
    layers.forEach(function (l) {
      var wrap = document.createElement('div');

      var row = document.createElement('label');
      row.className = 'layer';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!selected[l.index];
      cb.addEventListener('change', function () { selected[l.index] = cb.checked; applyLayerFilter(); });
      var txt = document.createElement('span');
      txt.textContent = 'Layer ' + (l.index + 1);
      var small = document.createElement('small');
      small.textContent = l.count + ' objek · ' + (l.chars / 1024).toFixed(0) + ' KB';
      txt.appendChild(small);
      var pick = document.createElement('input');
      pick.type = 'color';
      pick.value = currentHex(l);
      pick.addEventListener('input', function () { setEdit(l, pick.value, null); hexIn.value = pick.value; });
      row.appendChild(pick); row.appendChild(txt); row.appendChild(cb);
      wrap.appendChild(row);

      var ed = document.createElement('div');
      ed.className = 'layer-edit';
      var hexIn = document.createElement('input');
      hexIn.type = 'text';
      hexIn.value = currentHex(l);
      hexIn.maxLength = 7;
      hexIn.addEventListener('change', function () {
        var v = hexIn.value.trim();
        if (/^#?[0-9a-f]{6}$/i.test(v)) {
          if (v[0] !== '#') v = '#' + v;
          v = v.toLowerCase();
          setEdit(l, v, null); pick.value = v;
        } else {
          hexIn.value = currentHex(l);
        }
      });
      var op = document.createElement('input');
      op.type = 'range'; op.min = '0'; op.max = '100'; op.step = '1';
      op.value = Math.round(currentAlpha(l) * 100);
      var opVal = document.createElement('span');
      opVal.className = 'val';
      opVal.textContent = op.value + '%';
      op.addEventListener('input', function () {
        opVal.textContent = op.value + '%';
        setEdit(l, null, parseInt(op.value, 10) / 100);
      });
      ed.appendChild(document.createTextNode('Hex'));
      ed.appendChild(hexIn);
      ed.appendChild(document.createTextNode('Opasitas'));
      ed.appendChild(op);
      ed.appendChild(opVal);
      wrap.appendChild(ed);
      layerList.appendChild(wrap);
    });
    selAllBtn.disabled = false; selNoneBtn.disabled = false; resetEditBtn.disabled = false;
    updateLayerCount();
  }

  // Simpan edit warna/opasitas untuk satu layer, lalu perbarui SVG
  function setEdit(l, hex, alpha) {
    var cur = edits[l.fill] || { hex: currentHex(l), alpha: currentAlpha(l) };
    edits[l.fill] = { hex: hex || cur.hex, alpha: alpha === null ? cur.alpha : alpha };
    applyLayerFilter();
  }

  resetEditBtn.addEventListener('click', function () {
    edits = {};
    renderLayers();
    applyLayerFilter();
  });

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
        } else if (mode === 'color') {
          var tags = traceByColor(prepare(cloneImgd(base), false));
          fullSvg = ['<svg width="' + base.width + '" height="' + base.height + '" version="1.1" xmlns="http://www.w3.org/2000/svg">']
            .concat(tags).concat(['</svg>']).join('\n');
          lastImgd = prepare(cloneImgd(base), false);
        } else {
          fullSvg = IT.imagedataToSVG(prepare(cloneImgd(base), true), buildOptions());
          lastImgd = prepare(cloneImgd(base), true);
        }
        layers = parseLayers(fullSvg);
        edits = {};
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
