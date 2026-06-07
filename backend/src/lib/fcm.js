/**
 * Firebase Cloud Messaging helper.
 *
 * Setup:
 *  1. Go to Firebase Console → Project Settings → Service Accounts
 *  2. Click "Generate new private key" — save the JSON file
 *  3. Set FIREBASE_SERVICE_ACCOUNT env var to the file path, OR
 *     set FIREBASE_SERVICE_ACCOUNT_JSON to the raw JSON string
 *
 * If neither env var is set the module is a no-op (safe for local dev).
 */
import { readFileSync } from 'fs';

let messaging = null;

async function initFCM() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ?? (process.env.FIREBASE_SERVICE_ACCOUNT
        ? readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, 'utf8')
        : null);

  if (!raw) {
    console.log('[FCM] No service account configured — push notifications disabled.');
    return;
  }

  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging }                 = await import('firebase-admin/messaging');

    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    messaging = getMessaging();
    console.log('[FCM] Initialised successfully.');
  } catch (err) {
    console.error('[FCM] Failed to initialise:', err.message);
  }
}

initFCM();

/**
 * Send a push notification to a single device token.
 * Silently no-ops if FCM is not configured or the token is missing.
 */
export async function sendPush(fcmToken, { title, body, data = {} }) {
  if (!messaging || !fcmToken) return;

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'reon_messages' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    });
  } catch (err) {
    // Stale token — remove it from the database
    if (err.code === 'messaging/registration-token-not-registered') {
      const User = (await import('../models/User.js')).default;
      await User.updateOne({ fcmToken }, { $unset: { fcmToken: 1 } }).catch(() => {});
    } else {
      console.error('[FCM] sendPush error:', err.message);
    }
  }
}
