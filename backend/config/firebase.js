const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

/**
 * Send push notification to a single device
 * @param {string} fcmToken - device token
 * @param {string} title
 * @param {string} body
 * @param {object} data - extra key-value data
 */
async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) return;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    console.log(`📱 Notification sent: ${title}`);
  } catch (err) {
    console.error('FCM error:', err.message);
  }
}

module.exports = { admin, sendPushNotification };
