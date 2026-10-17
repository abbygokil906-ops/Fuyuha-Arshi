export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    const { action, email, oobCode, uiSid, uiSd } = req.body || {};
    const FIREBASE_API_KEY = "AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0";

    const safeSid = (typeof uiSid === 'string' && uiSid.trim() !== '') 
        ? uiSid 
        : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    
    const safeSd = (typeof uiSd === 'string' && uiSd.trim() !== '') ? uiSd : "1";

    let endpoint = '';
    let payload = {};

    if (action === 'sendOobCode') {
        endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;
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

        let logs = {
            userSessionBegan: null,
            verifyPurchase: null,
            getAccountStatus: null
        };

        if (action === 'signInWithEmailLink' && authData.idToken) {
            const appInstanceUuid = 'inst_' + Math.random().toString(36).substring(2, 15);
            const commonHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authData.idToken}`,
                'X-Android-Package': 'com.alightcreative.motion',
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; POCO X3 NFC Build/QKQ1.200114.002)'
            };

            // 1. userSessionBegan
            try {
                const res1 = await fetch('https://us-central1-alight-creative.cloudfunctions.net/userSessionBegan', {
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
                            ui_sid: safeSid,
                            ui_sd: safeSd
                        }
                    })
                });
                logs.userSessionBegan = {
                    status: res1.status,
                    body: await res1.text()
                };
            } catch (err) {
                logs.userSessionBegan = { error: err.message };
            }

            // 2. verifyPurchase
            try {
                const res2 = await fetch('https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase', {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        data: {
                            productId: "alightmotion_sub_yearly_1_year",
                            token: "mock_google_play_purchase_token_" + Math.random().toString(36).substring(2, 12),
                            skuType: "subs",
                            orderId: "GPA.3333-4444-5555-" + Math.floor(10000 + Math.random() * 90000)
                        }
                    })
                });
                logs.verifyPurchase = {
                    status: res2.status,
                    body: await res2.text()
                };
            } catch (err) {
                logs.verifyPurchase = { error: err.message };
            }

            // 3. getAccountStatusAndLicenses
            try {
                const res3 = await fetch('https://us-central1-alight-creative.cloudfunctions.net/getAccountStatusAndLicenses', {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        data: {
                            ui_sid: safeSid,
                            ui_sd: safeSd
                        }
                    })
                });
                logs.getAccountStatus = {
                    status: res3.status,
                    body: await res3.text()
                };
            } catch (err) {
                logs.getAccountStatus = { error: err.message };
            }
        }

        // Kembalikan format asli Firebase Auth agar verifier.js tidak error, plus sisipkan debug_logs
        return res.status(200).json({
            ...authData,
            debug_logs: logs
        });

    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}
