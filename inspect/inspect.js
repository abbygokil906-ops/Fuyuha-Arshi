document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('targetUrl');
    const inspectBtn = document.getElementById('inspectBtn');
    const resultOutput = document.getElementById('resultOutput');
    const copyJsonBtn = document.getElementById('copyJsonBtn');

    let rawApiResponse = null;

    function renderFormattedResult(data) {
        rawApiResponse = data;
        let output = `[URL FINAL] ${data.url}\n`;
        output += `[STATUS] ${data.status} | [TITLE] ${data.title || 'N/A'}\n\n`;

        // Tampilkan Secrets / Token yang berhasil disedot
        if (data.extractedSecrets) {
            output += `=== EXTRACTED SECRETS & TOKENS ===\n`;
            output += `• Firebase Keys  : ${data.extractedSecrets.firebaseKeys.length ? data.extractedSecrets.firebaseKeys.join(', ') : 'Tidak ada'}\n`;
            output += `• JWT Tokens     : ${data.extractedSecrets.jwtTokens.length ? data.extractedSecrets.jwtTokens.length + ' ditemukan' : 'Tidak ada'}\n`;
            output += `• Magic Link Pkg : ${data.extractedSecrets.magicLinkParams ? JSON.stringify(data.extractedSecrets.magicLinkParams) : 'Tidak ada'}\n`;
            output += `• API Endpoints  : \n  - ${data.extractedSecrets.apiEndpoints.join('\n  - ') || 'Tidak ada'}\n\n`;
        }

        // Tampilkan Forms & External Hosts
        output += `=== RESOURCES & FORMS ===\n`;
        output += `• External Hosts : ${data.resources.externalHosts.join(', ') || 'N/A'}\n`;
        output += `• Forms Action   : \n  - ${data.forms.map(f => `[${f.method}]${f.action}`).join('\n  - ') || 'Tidak ada'}\n`;

        resultOutput.textContent = output;
    }

    inspectBtn.addEventListener('click', async () => {
        const targetUrl = urlInput.value.trim();
        if (!targetUrl) {
            resultOutput.textContent = 'Error: Masukkan URL tujuan dulu, cuy!';
            return;
        }

        inspectBtn.disabled = true;
        inspectBtn.textContent = 'Memindai & Mengekstrak...';
        resultOutput.textContent = '[API] Mengirim request aman ke backend Vercel...';

        try {
            const response = await fetch(`/api/inspect?url=${encodeURIComponent(targetUrl)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Gagal memproses URL');
            }

            renderFormattedResult(data);
        } catch (err) {
            resultOutput.textContent = `[ERROR] ${err.message}`;
        } finally {
            inspectBtn.disabled = false;
            inspectBtn.textContent = 'Inspeksi & Ekstrak Data';
        }
    });

    copyJsonBtn.addEventListener('click', async () => {
        if (!rawApiResponse) return;

        try {
            await navigator.clipboard.writeText(JSON.stringify(rawApiResponse, null, 2));
            const originalText = copyJsonBtn.textContent;
            copyJsonBtn.textContent = 'Copied JSON!';
            copyJsonBtn.classList.add('text-sky-400');
            setTimeout(() => {
                copyJsonBtn.textContent = originalText;
                copyJsonBtn.classList.remove('text-sky-400');
            }, 2000);
        } catch (err) {
            alert('Gagal menyalin JSON.');
        }
    });
});
