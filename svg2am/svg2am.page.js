document.addEventListener('DOMContentLoaded', function () {
  var MAX_BYTES = 2 * 1024 * 1024;
  var PREVIEW_LINES = 60;

  var $ = function (id) { return document.getElementById(id); };
  var input = $('svgInput'), drop = $('drop'), titleInput = $('titleInput'), nameInput = $('nameInput');
  var patchToggle = $('patchToggle'), thresholdInput = $('thresholdInput'), thinInput = $('thinInput');
  var convertBtn = $('convertBtn'), copyBtn = $('copyBtn'), downloadBtn = $('downloadBtn');
  var statusEl = $('status'), readyBadge = $('readyBadge'), previewBox = $('previewBox');
  var xmlPreview = $('xmlPreview'), xmlNote = $('xmlNote');
  var stShapes = $('stShapes'), stColors = $('stColors'), stRemoved = $('stRemoved');
  var layerList = $('layerList'), layerCount = $('layerCount'), selAllBtn = $('selAllBtn'), selNoneBtn = $('selNoneBtn');

  var svgText = null, xmlText = null, currentTab = 'svg';
  var layers = [], selected = {};

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setReady(ready) {
    readyBadge.textContent = ready ? 'SIAP' : 'MENUNGGU';
    readyBadge.className = 'badge' + (ready ? ' ok' : '');
  }

  // ---------- Pratinjau ----------
  function showSvgPreview() {
    if (!svgText) { previewBox.innerHTML = '<div class="placeholder">Pilih SVG untuk memulai</div>'; return; }
    previewBox.innerHTML = svgText;
    var s = previewBox.querySelector('svg');
    if (s) {
      if (!s.getAttribute('viewBox')) {
        var w = parseFloat(s.getAttribute('width')), h = parseFloat(s.getAttribute('height'));
        if (w > 0 && h > 0) s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      }
      s.removeAttribute('width'); s.removeAttribute('height'); s.style.width = '100%'; s.style.height = 'auto';
    }
  }

  function showXmlPreview() {
    if (!xmlText) {
      previewBox.style.display = 'flex';
      xmlPreview.style.display = 'none';
      xmlNote.textContent = '';
      previewBox.innerHTML = '<div class="placeholder">Belum ada XML. Klik Convert dulu.</div>';
      return;
    }
    var lines = xmlText.split('\n');
    previewBox.style.display = 'none';
    xmlPreview.style.display = 'block';
    xmlPreview.textContent = lines.slice(0, PREVIEW_LINES).join('\n') + (lines.length > PREVIEW_LINES ? '\n... (dipotong)' : '');
    xmlNote.textContent = 'Preview dipotong agar ringan. Salin dan Download memakai XML lengkap (' +
      (xmlText.length / 1024).toFixed(0) + ' KB).';
  }

  function applyTab() {
    var tabs = document.querySelectorAll('.tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === currentTab);
    if (currentTab === 'svg') {
      previewBox.style.display = 'flex';
      xmlPreview.style.display = 'none';
      xmlNote.textContent = '';
      showSvgPreview();
    } else {
      showXmlPreview();
    }
  }

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { currentTab = b.getAttribute('data-tab'); applyTab(); });
  });

  // ---------- Layer ----------
  function swatchColor(hex) {
    // format #AARRGGBB -> rgba
    var a = parseInt(hex.slice(1, 3), 16) / 255;
    var r = parseInt(hex.slice(3, 5), 16), g = parseInt(hex.slice(5, 7), 16), b = parseInt(hex.slice(7, 9), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  }

  function chosenIndices() {
    var out = [];
    layers.forEach(function (l) { if (selected[l.index]) out.push(l.index); });
    return out;
  }

  function renderLayers() {
    layerList.innerHTML = '';
    if (!layers.length) {
      layerList.innerHTML = '<div class="layers-empty">Tidak ada layer.</div>';
      layerCount.textContent = 'Belum ada layer';
      selAllBtn.disabled = true; selNoneBtn.disabled = true;
      return;
    }
    layers.forEach(function (l) {
      var row = document.createElement('label');
      row.className = 'layer';
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = swatchColor(l.color);
      var txt = document.createElement('span');
      txt.textContent = 'Layer ' + (l.index + 1);
      var small = document.createElement('small');
      small.textContent = l.subpaths + ' subpath · ~' + Math.round(l.area / 1000) + 'k px²';
      txt.appendChild(small);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!selected[l.index];
      cb.addEventListener('change', function () {
        selected[l.index] = cb.checked;
        updateLayerCount();
        regenerate();
      });
      row.appendChild(sw);
      row.appendChild(txt);
      row.appendChild(document.createElement('span'));
      row.appendChild(cb);
      layerList.appendChild(row);
    });
    selAllBtn.disabled = false; selNoneBtn.disabled = false;
    updateLayerCount();
  }

  function updateLayerCount() {
    layerCount.textContent = chosenIndices().length + ' dari ' + layers.length + ' layer dipilih';
  }

  function setAll(on) {
    layers.forEach(function (l) { selected[l.index] = on; });
    renderLayers();
    regenerate();
  }
  selAllBtn.addEventListener('click', function () { setAll(true); });
  selNoneBtn.addEventListener('click', function () { setAll(false); });

  // ---------- Konversi ----------
  function buildOptions(include) {
    var thr = parseFloat(thresholdInput.value);
    var thin = parseFloat(thinInput.value);
    var o = {
      title: titleInput.value || 'SVG Import',
      patchCleanup: patchToggle.checked,
      patchThreshold: isNaN(thr) ? 0.0002 : thr,
      protectThin: isNaN(thin) ? 2 : thin
    };
    if (include) o.include = include;
    return o;
  }

  function runConvert(include) {
    return window.Svg2Am.convertSvgToAm(svgText, buildOptions(include));
  }

  function refreshStats() {
    var st = window.Svg2Am.getLastStats() || {};
    stShapes.textContent = st.shapes || 0;
    stColors.textContent = st.colors || 0;
    stRemoved.textContent = patchToggle.checked ? (st.removed || 0) : 0;
  }

  // Ambil daftar layer dari konversi penuh
  function loadLayers() {
    runConvert(undefined);
    layers = window.Svg2Am.getLastLayers() || [];
    selected = {};
    layers.forEach(function (l) { selected[l.index] = true; });
    renderLayers();
  }

  // Konversi ulang setelah layer atau pengaturan berubah (hanya kalau sudah pernah dikonversi)
  function regenerate() {
    if (!svgText || !xmlText) return;
    var chosen = chosenIndices();
    if (chosen.length === 0) {
      xmlText = null;
      copyBtn.disabled = true; downloadBtn.disabled = true;
      setReady(false);
      setStatus('Pilih minimal satu layer.', 'error');
      applyTab();
      return;
    }
    try {
      xmlText = runConvert(chosen);
      refreshStats();
      copyBtn.disabled = false; downloadBtn.disabled = false;
      setReady(true);
      setStatus('XML diperbarui (' + chosen.length + ' layer, ' + (xmlText.length / 1024).toFixed(0) + ' KB).', 'ok');
      applyTab();
    } catch (err) {
      setStatus('Konversi gagal: ' + err.message, 'error');
    }
  }

  // ---------- Muat file ----------
  function loadFile(file) {
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type.indexOf('svg') < 0) {
      setStatus('Hanya file SVG yang didukung.', 'error'); return;
    }
    if (file.size > MAX_BYTES) {
      setStatus('File terlalu besar. Maksimal 2 MB.', 'error'); return;
    }
    var base = file.name.replace(/\.[^/.]+$/, '');
    nameInput.value = base;
    titleInput.value = base;

    var reader = new FileReader();
    reader.onload = function () {
      svgText = reader.result;
      xmlText = null;
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      convertBtn.disabled = false;
      setReady(false);
      stShapes.textContent = '0'; stColors.textContent = '0'; stRemoved.textContent = '0';
      currentTab = 'svg';
      applyTab();
      try {
        loadLayers();
        setStatus('SVG dimuat. Pilih layer, lalu klik Convert.', 'ok');
      } catch (err) {
        layers = []; renderLayers();
        setStatus('Gagal membaca SVG: ' + err.message, 'error');
      }
    };
    reader.onerror = function () { setStatus('Gagal membaca file.', 'error'); };
    reader.readAsText(file);
  }

  input.addEventListener('change', function () { loadFile(input.files[0]); });

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

  // Pengaturan pembersihan juga memicu konversi ulang
  [patchToggle, thresholdInput, thinInput, titleInput].forEach(function (el) {
    el.addEventListener('change', function () { if (xmlText) regenerate(); });
  });

  convertBtn.addEventListener('click', function () {
    if (!svgText) return;
    convertBtn.disabled = true;
    setStatus('Memproses...', '');
    setTimeout(function () {
      try {
        var chosen = chosenIndices();
        if (chosen.length === 0) throw new Error('Pilih minimal satu layer.');
        xmlText = runConvert(chosen);
        refreshStats();
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
        setReady(true);
        setStatus('Selesai. XML siap diunduh (' + (xmlText.length / 1024).toFixed(0) + ' KB).', 'ok');
        currentTab = 'xml';
        applyTab();
      } catch (err) {
        xmlText = null;
        setReady(false);
        setStatus('Konversi gagal: ' + err.message, 'error');
      } finally {
        convertBtn.disabled = false;
      }
    }, 30);
  });

  copyBtn.addEventListener('click', function () {
    if (!xmlText) return;
    var done = function () { setStatus('XML disalin ke clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(xmlText).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = xmlText; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { setStatus('Gagal menyalin.', 'error'); }
      document.body.removeChild(ta);
    }
  });

  downloadBtn.addEventListener('click', function () {
    if (!xmlText) return;
    var name = (nameInput.value || 'scene').replace(/[\\\/:*?"<>|]+/g, '_') + '.xml';
    var blob = new Blob([xmlText], { type: 'text/xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  applyTab();
});
