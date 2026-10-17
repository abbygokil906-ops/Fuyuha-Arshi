export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

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

        // Eksekusi nembak endpoint asli Alight Creative jika login sukses & ada uiSid
        let licenseResult = null;
        if (action === 'signInWithEmailLink' && data.idToken) {
            try {
                const licenseRes = await fetch('https://us-central1-alight-creative.cloudfunctions.net/getAccountStatusAndLicenses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${data.idToken}`,
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
                    },
                    body: JSON.stringify({
                        ui_sid: uiSid || '',
                        ui_sd: uiSd || ''
                    })
                });
                
                if (licenseRes.ok) {
                    licenseResult = await licenseRes.json();
                } else {
                    licenseResult = { status_code: licenseRes.status, message: await licenseRes.text() };
                }
            } catch (err) {
                licenseResult = { error: err.message };
            }
        }

        return res.status(200).json({
            ...data,
            license: licenseResult
        });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}
