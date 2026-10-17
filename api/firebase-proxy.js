export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    // Tangkap data lengkap termasuk uiSid dan uiSd dari frontend
    const { action, email, oobCode, uiSid, uiSd } = req.body;
    const FIREBASE_API_KEY = "AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0";

    let endpoint = '';
    let payload = {};

    if (action === 'sendOobCode') {
        endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;
        payload = {
            requestType: "EMAIL_SIGNIN",
            email: email,
            continueUrl: "https://alightcreative.com"
        };
    } else if (action === 'signInWithEmailLink') {
        endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`;
        payload = {
            email: email,
            oobCode: oobCode
        };
    } else {
        return res.status(400).json({ error: { message: 'Invalid action' } });
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Referer': 'https://alight-creative.firebaseapp.com/',
                'Origin': 'https://alight-creative.firebaseapp.com'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        // Simulasi/eksekusi aktivasi lisensi jika uiSid tersedia dari magic link
        let activationResult = null;
        if (uiSid && action === 'signInWithEmailLink') {
            activationResult = {
                status: "ACTIVE",
                orderId: "neo-" + Math.random().toString(16).substring(2, 14),
                uiSid: uiSid,
                uiSd: uiSd || "0",
                duration: "1 Tahun"
            };
        }

        return res.status(200).json({
            ...data,
            activation: activationResult
        });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}
