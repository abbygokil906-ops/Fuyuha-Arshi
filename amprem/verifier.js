function extractOobCode(rawUrl) {
    try {
        const urlObj = new URL(rawUrl);
        let targetUrl = rawUrl;
        if (urlObj.searchParams.has('link')) {
            targetUrl = decodeURIComponent(urlObj.searchParams.get('link'));
        }
        const finalUrlObj = new URL(targetUrl);
        return finalUrlObj.searchParams.get('oobCode');
    } catch (e) {
        const match = rawUrl.match(/oobCode=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }
}

async function verify(value) {
    value = value.trim();
    if (!value) {
        return { ok: false, message: "Input tidak boleh kosong, cuy!" };
    }

    const oobCode = extractOobCode(value);

    // KONDISI 1: Magic Link
    if (oobCode) {
        const savedEmail = localStorage.getItem('am_target_email') || "";
        
        try {
            const response = await fetch('/api/firebase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'signInWithEmailLink', 
                    email: savedEmail, 
                    oobCode: oobCode 
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const errDetail = data.error ? JSON.stringify(data.error) : response.statusText;
                return { ok: false, message: `[FIREBASE ERROR] ${errDetail}` };
            }

            return { 
                ok: true, 
                message: `[SUCCESS] Sesi Berhasil Diambil!\nUID: ${data.localId}\nToken: ${data.idToken.substring(0, 25)}...` 
            };
        } catch (err) {
            return { ok: false, message: `[NETWORK ERROR] ${err.message}` };
        }
    } 
    // KONDISI 2: Email
    else if (value.includes('@')) {
        localStorage.setItem('am_target_email', value);

        try {
            const response = await fetch('/api/firebase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'sendOobCode', 
                    email: value 
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const errDetail = data.error ? JSON.stringify(data.error) : response.statusText;
                return { ok: false, message: `[FIREBASE ERROR] ${errDetail}` };
            }

            return { 
                ok: true, 
                message: `[SUCCESS] Magic link berhasil dikirim ke ${value}!\nSilakan cek inbox/spam email, lalu paste link-nya ke sini.` 
            };
        } catch (err) {
            return { ok: false, message: `[NETWORK ERROR] ${err.message}` };
        }
    } 
    // KONDISI 3: Format Tidak Dikenal
    else {
        return { ok: false, message: "[ERROR] Format tidak dikenal. Masukkan email valid atau paste magic link secara utuh." };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const inputEl = document.getElementById('input');
    const verifyBtn = document.getElementById('verifyBtn');
    const resultEl = document.getElementById('result');
    const copyLogBtn = document.getElementById('copyLogBtn');

    if (!inputEl || !verifyBtn || !resultEl) return;

    verifyBtn.addEventListener('click', async () => {
        const val = inputEl.value;
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Memproses...';
        resultEl.textContent = '[LOADING] Menghubungkan ke server Firebase...';
        resultEl.className = 'bg-black/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 min-h-[90px] max-h-40 overflow-y-auto whitespace-pre-wrap select-all';

        const res = await verify(val);

        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Proses Verifikasi';

        if (res.ok) {
            resultEl.className = 'bg-black/80 border border-emerald-500/40 rounded-lg p-3 text-xs font-mono text-emerald-400 min-h-[90px] max-h-40 overflow-y-auto whitespace-pre-wrap select-all';
        } else {
            resultEl.className = 'bg-black/80 border border-rose-500/40 rounded-lg p-3 text-xs font-mono text-rose-400 min-h-[90px] max-h-40 overflow-y-auto whitespace-pre-wrap select-all';
        }
        resultEl.textContent = res.message;
    });

    if (copyLogBtn) {
        copyLogBtn.addEventListener('click', async () => {
            const textToCopy = resultEl.textContent;
            if (!textToCopy) return;

            try {
                await navigator.clipboard.writeText(textToCopy);
                const originalText = copyLogBtn.textContent;
                copyLogBtn.textContent = 'Copied!';
                copyLogBtn.classList.add('text-emerald-400');
                
                setTimeout(() => {
                    copyLogBtn.textContent = originalText;
                    copyLogBtn.classList.remove('text-emerald-400');
                }, 2000);
            } catch (err) {
                alert('Gagal menyalin log.');
            }
        });
    }
});
