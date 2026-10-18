document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('targetUrl');
  const inspectBtn = document.getElementById('inspectBtn');
  const resultOutput = document.getElementById('resultOutput');
  const copyJsonBtn = document.getElementById('copyJsonBtn');

  let rawData = null;

  if (!inspectBtn) return;

  inspectBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const targetUrl = urlInput ? urlInput.value.trim() : '';
    if (!targetUrl) {
      alert('Masukkan URL target terlebih dahulu!');
      return;
    }

    // Indikator Loading
    inspectBtn.disabled = true;
    inspectBtn.innerText = 'Memindai...';
    if (resultOutput) resultOutput.textContent = '[SYSTEM] Mengirim permintaan inspeksi ke /api/inspect...';

    try {
      const response = await fetch(`/api/inspect?url=${encodeURIComponent(targetUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || `HTTP Error ${response.status}`);
      }

      rawData = data;

      // Render Hasil ke UI
      if (resultOutput) {
        let output = `[URL FINAL] ${data.url}\n`;
        output += `[STATUS CODE] ${data.status}\n\n`;

        if (data.extractedSecrets) {
          output += `=== EXTRACTED SECRETS & KEYS ===\n`;
          output += `• Firebase Keys  : ${data.extractedSecrets.firebaseKeys?.length ? data.extractedSecrets.firebaseKeys.join(', ') : 'Tidak ada'}\n`;
          output += `• JWT Tokens     : ${data.extractedSecrets.jwtTokens?.length ? data.extractedSecrets.jwtTokens.length + ' ditemukan' : 'Tidak ada'}\n`;
          output += `• Magic Link Pkg : ${data.extractedSecrets.magicLinkParams ? JSON.stringify(data.extractedSecrets.magicLinkParams) : 'Tidak ada'}\n`;
          output += `• Endpoints      : ${data.extractedSecrets.apiEndpoints?.length ? '\n  - ' + data.extractedSecrets.apiEndpoints.join('\n  - ') : 'Tidak ada'}\n\n`;
        }

        output += `=== SUMMARY & FORMS ===\n`;
        output += `• External Hosts : ${data.resources?.externalHosts?.join(', ') || 'N/A'}\n`;
        output += `• Forms Found    : ${data.forms?.length || 0}\n`;

        resultOutput.textContent = output;
      }
    } catch (err) {
      console.error('[INSPECTOR ERROR]', err);
      if (resultOutput) {
        resultOutput.textContent = `[ERROR SYSTEM]\nGagal mengeksekusi inspeksi.\nAlasan: ${err.message}`;
      }
    } finally {
      inspectBtn.disabled = false;
      inspectBtn.innerText = 'Inspeksi & Ekstrak Data';
    }
  });

  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', () => {
      if (!rawData) {
        alert('Belum ada data untuk disalin.');
        return;
      }
      navigator.clipboard.writeText(JSON.stringify(rawData, null, 2))
        .then(() => alert('JSON Hasil Inspeksi berhasil disalin!'))
        .catch(() => alert('Gagal menyalin JSON.'));
    });
  }
});
