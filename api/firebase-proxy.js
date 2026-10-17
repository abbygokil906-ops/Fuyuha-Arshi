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
        
        const sessionSid = uiSid || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const sessionSd = uiSd || "1";

        payload = {
            requestType: "EMAIL_SIGNIN",
            email: email,
            continueUrl: `https://alightcreative.com/auth_action?ui_sid=${sessionSid}&ui_sd=${sessionSd}`,
            canHandleCodeInApp: true,
            androidPackageName: "com.alightcreative.motion",
            androidInstallApp: false
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
                'X-Android-Package': 'com.alightcreative.motion',
                'X-Android-Cert': 'A4022CE82388FA957A883B64348231438780B813',
                'Referer': 'https://alight-creative.firebaseapp.com/',
                'Origin': 'https://alight-creative.firebaseapp.com'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        let sessionResult = null;
        let verifyResult = null;
        let licenseResult = null;

        if (action === 'signInWithEmailLink' && data.idToken) {
            const activeSid = uiSid || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const activeSd = uiSd || "1";
            const appInstanceUuid = 'inst_' + Math.random().toString(36).substring(2, 15);

            const commonHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.idToken}`,
                'X-Android-Package': 'com.alightcreative.motion',
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; POCO X3 NFC Build/QKQ1.200114.002)'
            };

            try {
                // TAHAP 1: userSessionBegan
                const sessionRes = await fetch('https://us-central1-alight-creative.cloudfunctions.net/userSessionBegan', {
                    method: 'POST',
                    headers: commonHeaders,
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
                            ui_sid: activeSid,
                            ui_sd: activeSd
                        }
                    })
                });
                if (sessionRes.ok) sessionResult = await sessionRes.json();

                // TAHAP 2: verifyPurchase (Suntik Resi Mock berdasarkan VerifyPurchaseRequest)
                const verifyRes = await fetch('https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase', {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        data: {
                            productId: "alightmotion_sub_yearly_1_year",
                            token: "mock_google_play_purchase_token_" + Math.random().toString(36).substring(2),
                            skuType: "subs",
                            orderId: "GPA.3333-4444-5555-" + Math.floor(10000 + Math.random() * 90000)
                        }
                    })
                });
                
                if (verifyRes.ok) {
                    const vData = await verifyRes.json();
                    verifyResult = vData.result || vData;
                } else {
                    verifyResult = { status_code: verifyRes.status, message: await verifyRes.text() };
                }

                // TAHAP 3: getAccountStatusAndLicenses (Memastikan status berubah)
                const licenseRes = await fetch('https://us-central1-alight-creative.cloudfunctions.net/getAccountStatusAndLicenses', {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        data: {
                            ui_sid: activeSid,
                            ui_sd: activeSd
                        }
                    })
                });
                
                if (licenseRes.ok) {
                    const licData = await licenseRes.json();
                    licenseResult = licData.result || licData;
                } else {
                    licenseResult = { status_code: licenseRes.status, message: await licenseRes.text() };
                }
            } catch (err) {
                licenseResult = { error: err.message };
            }
        }

        return res.status(200).json({
            ...data,
            session: sessionResult,
            verify: verifyResult,
            license: licenseResult
        });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}
