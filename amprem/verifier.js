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

document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('emailInput');
    const sendBtn = document.getElementById('sendBtn');
    const linkInput = document.getElementById('linkInput');
    const verifyBtn = document.getElementById('verifyBtn');
    const resultEl = document.getElementById('result');
    const copyLogBtn = document.getElementById('copyLogBtn');

    function log(msg, isError = false) {
        resultEl.className = `bg-black/80 border rounded-lg p-3 text-xs font-mono min-h-[80px] max-h-36 overflow-y-auto whitespace-pre-wrap select-all ${isError ? 'border-rose-500/40 text-rose-400' : 'border-emerald-500/40 text-emerald-400'}`;
        resultEl.textContent = msg;
    }

    // Tombol Kirim Email
    sendBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
            log('Error: Masukkan email dulu, cuy!', true);
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Mengirim...';
        log('[API] Mengirim request sendOobCode...', false);

        try {
            const response = await fetch('/api/firebase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sendOobCode', email: email })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error ? JSON.stringify(data.error) : response.statusText);
            }

            localStorage.setItem('am_target_email', email);
            log(`[SUCCESS] Magic link berhasil dikirim ke ${email}! Silakan cek inbox/spam.`, false);
        } catch (err) {
            log(`[FIREBASE ERROR] ${err.message}`, true);
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Kirim Magic Link';
        }
    });

    // Tombol Verifikasi Link
    verifyBtn.addEventListener('click', async () => {
        const fullLink = linkInput.value.trim();
        if (!fullLink) {
            log('Error: Paste link dari email dulu di kotak nomor 2!', true);
            return;
        }

        const oobCode = extractOobCode(fullLink);
        if (!oobCode) {
            log('Error: Gagal nge-extract oobCode dari link tersebut.', true);
            return;
        }

        const savedEmail = localStorage.getItem('am_target_email') || "";

        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Memverifikasi...';
        log('[API] Menukar oobCode dengan token sesi...', false);

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
                throw new Error(data.error ? JSON.stringify(data.error) : response.statusText);
            }

            log(`[SUCCESS] Sesi Berhasil Diambil!\nUID: ${data.localId}\nToken: ${data.idToken.substring(0, 25)}...`, false);
            console.log("Full Auth Data:", data);
        } catch (err) {
            log(`[FIREBASE ERROR] ${err.message}`, true);
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verifikasi & Ambil Sesi';
        }
    });

    // Tombol Salin Log
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
