export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    const { action, email, oobCode, uiSid, uiSd } = req.body || {};
    const FIREBASE_API_KEY = "AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0";

    let endpoint = '';
    let payload = {};

    if (action === 'sendOobCode') {
        endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;
        const safeSid = uiSid || Math.random().toString(36).substring(2, 15);
        const safeSd = uiSd || "1";
        
        payload = {
            requestType: "EMAIL_SIGNIN",
            email: email,
            continueUrl: `https://alightcreative.com/auth_action?ui_sid=${safeSid}&ui_sd=${safeSd}`,
            canHandleCodeInApp: true,
            androidPackageName: "com.alightcreative.motion",
            androidInstallApp: false
        };
    } else if (action === 'signInWithEmailLink') {
        endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`;
        payload = { email: email, oobCode: oobCode };
    } else {
        return res.status(400).json({ error: { message: 'Invalid action' } });
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Android-Package': 'com.alightcreative.motion',
                'X-Android-Cert': 'A4022CE82388FA957A883B64348231438780B813',
                'Referer': 'https://alight-creative.firebaseapp.com/',
                'Origin': 'https://alight-creative.firebaseapp.com'
            },
            body: JSON.stringify(payload)
        });

        const authData = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: authData });
        }

        // Kalau login link sukses, tembak userSessionBegan pakai ui_sid & ui_sd asli
        if (action === 'signInWithEmailLink' && authData.idToken) {
            const appInstanceUuid = 'inst_' + Math.random().toString(36).substring(2, 15);
            
            try {
                await fetch('https://us-central1-alight-creative.cloudfunctions.net/userSessionBegan', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authData.idToken}`,
                        'X-Android-Package': 'com.alightcreative.motion',
                        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; POCO X3 NFC Build/QKQ1.200114.002)'
                    },
                    body: JSON.stringify({
                        data: {
                            platform: "android",
                            amVersionName: "5.0.0",
                            amVersionCode: 5000000,
                            amBuildName: "5.0.0.1",
                            amBuildCode: 5000001,
                            appInstance: appInstanceUuid,
                            appDay: Date.now(),
                            expectedAccountVersion: 1,
                            acctTestMode: "false",
                            ui_sid: uiSid || "",
                            ui_sd: uiSd || "1"
                        }
                    })
                });
            } catch (err) {
                console.error("Session began background error:", err.message);
            }
        }

        // Kembalikan authData mentah agar verifier.js lu bisa nangkep localId & idToken dengan mulus
        return res.status(200).json(authData);

    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}
