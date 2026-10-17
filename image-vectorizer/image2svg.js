  (function () {
    var fileInput = document.getElementById('fileInput');
    var dropZone = document.getElementById('dropZone');
    var presetSelect = document.getElementById('presetSelect');
    var colorsRange = document.getElementById('colorsRange');
    var colorsValue = document.getElementById('colorsValue');
    var sizeSelect = document.getElementById('sizeSelect');
    var traceBtn = document.getElementById('traceBtn');
    var downloadBtn = document.getElementById('downloadBtn');
    var originalBox = document.getElementById('originalBox');
    var resultBox = document.getElementById('resultBox');
    var resultCaption = document.getElementById('resultCaption');
    var statusEl = document.getElementById('status');

    var currentImage = null;   // HTMLImageElement
    var currentName = 'hasil';
    var lastSvg = null;

    function setStatus(msg, isError) {
      statusEl.textContent = msg || '';
      statusEl.className = 'status' + (isError ? ' error' : '');
    }

    colorsRange.addEventListener('input', function () {
      colorsValue.textContent = colorsRange.value;
    });

    dropZone.addEventListener('click', function () { fileInput.click(); });

    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent)';
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.style.borderColor = '';
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.style.borderColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        loadFile(fileInput.files[0]);
      }
    });

    function loadFile(file) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        setStatus('Format tidak didukung. Gunakan PNG, JPG, atau WEBP.', true);
        return;
      }
      currentName = file.name.replace(/\.[^.]+$/, '') || 'hasil';
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          currentImage = img;
          originalBox.innerHTML = '';
          var preview = document.createElement('img');
          preview.src = img.src;
          preview.alt = 'Gambar asli';
          originalBox.appendChild(preview);
          traceBtn.disabled = false;
          downloadBtn.disabled = true;
          lastSvg = null;
          resultBox.innerHTML = '<div class="placeholder">Klik "Ubah ke SVG"</div>';
          resultCaption.textContent = 'Hasil';
          setStatus('Gambar dimuat. Atur opsi lalu klik "Ubah ke SVG".');
        };
        img.onerror = function () {
          setStatus('Gagal membaca gambar.', true);
        };
        img.src = ev.target.result;
      };
      reader.onerror = function () { setStatus('Gagal membaca file.', true); };
      reader.readAsDataURL(file);
    }

    // Scale the image down so the longest side is at most maxSide
    function getImageData(img, maxSide) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var ratio = Math.min(1, maxSide / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * ratio));
      var th = Math.max(1, Math.round(h * ratio));
      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, tw, th);
      return ctx.getImageData(0, 0, tw, th);
    }

    traceBtn.addEventListener('click', function () {
      if (!currentImage) return;
      traceBtn.disabled = true;
      downloadBtn.disabled = true;
      setStatus('Memproses... mohon tunggu.');

      // Give the browser a chance to repaint the status before heavy work
      setTimeout(function () {
        try {
          if (!window.ImageTracer || !window.ImageTracer.optionpresets) {
            throw new Error('Library imagetracer.js tidak termuat. Pastikan file imagetracer.js berada di folder yang sama dengan index.html.');
          }
          var maxSide = parseInt(sizeSelect.value, 10);
          var imgd = getImageData(currentImage, maxSide);
          // Buang semi-transparansi: setiap piksel jadi sepenuhnya transparan atau opak.
          for (var px = 0; px < imgd.data.length; px += 4) {
            if (imgd.data[px + 3] < 128) {
              imgd.data[px] = 0; imgd.data[px + 1] = 0; imgd.data[px + 2] = 0; imgd.data[px + 3] = 0;
            } else {
              imgd.data[px + 3] = 255;
            }
          }

          // Build options from the chosen preset plus our color count.
          // Copy the preset so the library's shared preset object is not mutated.
          var preset = window.ImageTracer.optionpresets[presetSelect.value] || {};
          var options = {};
          for (var k in preset) {
            if (preset.hasOwnProperty(k)) options[k] = preset[k];
          }
          options.numberofcolors = parseInt(colorsRange.value, 10);
          // Sampling warna deterministik, pathomit lebih besar, tanpa stroke
          options.colorsampling = 0;
          options.pathomit = 20;
          options.strokewidth = 0;

          var svg = window.ImageTracer.imagedataToSVG(imgd, options);
          lastSvg = svg;

          resultBox.innerHTML = svg;
          var svgEl = resultBox.querySelector('svg');
          if (svgEl) {
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.height = 'auto';
          }
          resultCaption.textContent = 'Hasil (' + imgd.width + 'x' + imgd.height + ' px)';
          downloadBtn.disabled = false;
          setStatus('Selesai. Ukuran SVG: ' + (svg.length / 1024).toFixed(1) + ' KB');
        } catch (err) {
          console.error(err);
          setStatus('Terjadi kesalahan: ' + (err && err.message ? err.message : err), true);
        } finally {
          traceBtn.disabled = false;
        }
      }, 30);
    });

    downloadBtn.addEventListener('click', function () {
      if (!lastSvg) return;
      var blob = new Blob([lastSvg], { type: 'image/svg+xml' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = currentName + '.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  })();
