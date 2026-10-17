// Banner/overlay maintenance untuk halaman tools. Dipasang di setiap halaman tools.
// Catatan: ini hanya pemberitahuan di sisi browser. Tools ini statis, jadi tidak bisa dikunci sepenuhnya.
(function () {
  fetch('/api/maintenance', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) {
      if (!s || !s.enabled) return;
      var wrap = document.createElement('div');
      wrap.setAttribute('role', 'alert');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,17,21,0.96);color:#e6e8ee;' +
        'display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;' +
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center';
      var box = document.createElement('div');
      var h = document.createElement('h2');
      h.textContent = 'Sedang Maintenance';
      h.style.margin = '0 0 10px';
      var p = document.createElement('p');
      p.textContent = s.message || 'Sedang maintenance. Silakan coba lagi nanti.';
      p.style.color = '#8a909c';
      box.appendChild(h);
      box.appendChild(p);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
    })
    .catch(function () { /* jika gagal cek, biarkan halaman tetap berjalan */ });
})();
