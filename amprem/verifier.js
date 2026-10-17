const FIREBASE_API_KEY = "AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0"; 

// Fungsi pintar buat nge-extract oobCode dari link panjang
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

// Fungsi utama sesuai standar Claude: menerima value & mengembalikan { ok, message }
async function verify(value) {
    value = value.trim();
    if (!value) {
        return { ok: false, message: "Input tidak boleh kosong, cuy!" };
    }

    const oobCode = extractOobCode(value);

    // KONDISI 1: Jika yang di-paste adalah Magic Link
    if (oobCode) {
        const savedEmail = localStorage.getItem('am_target_email') || "";
        
        try {
            const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: savedEmail, oobCode: oobCode })
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
    // KONDISI 2: Jika yang diketik adalah Email
    else if (value.includes('@')) {
        localStorage.setItem('am_target_email', value);

        try {
            const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestType: "EMAIL_SIGNIN",
                    email: value,
                    continueUrl: "https://alightcreative.com"
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
    // KONDISI 3: Format ngawur
    else {
        return { ok: false, message: "[ERROR] Format tidak dikenal. Masukkan email valid atau paste magic link secara utuh." };
    }
}

// Penghubung UI otomatis ke DOM
document.addEventListener('DOMContentLoaded', () => {
    const inputEl = document.getElementById('input');
    const verifyBtn = document.getElementById('verifyBtn');
    const resultEl = document.getElementById('result');

    verifyBtn.addEventListener('click', async () => {
        const val = inputEl.value;
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Memproses...';
        resultEl.textContent = '[LOADING] Menghubungkan ke server Firebase...';
        resultEl.className = 'bg-black/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 min-h-[90px] max-h-40 overflow-y-auto whitespace-pre-wrap';

        const res = await verify(val);

        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Proses Verifikasi';

        // Menyesuaikan warna border & text berdasarkan status ok/false dari fungsi verify()
        if (res.ok) {
            resultEl.className = 'bg-black/80 border border-emerald-500/40 rounded-lg p-3 text-xs font-mono text-emerald-400 min-h-[90px] max-h-40 overflow-y-auto whitespace-pre-wrap';
        } else {
            resultEl.className = 'bg-black/80 border border-rose-500/40 rounded-lg p-3 text-xs font-mono text-rose-400 min-h-[90px] max-h-40 overflow-y-auto whitespace-pre-wrap';
        }
        resultEl.textContent = res.message;
    });
});
