import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { profileApi } from './api';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app;
let messaging;

export function initFirebase() {
  if (!getApps().length) app = initializeApp(firebaseConfig);
  else app = getApps()[0];

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
  return { app, messaging };
}

/**
 * Request notification permission and register FCM token with backend
 */
export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const { messaging } = initFirebase();
    if (!messaging) return null;

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });

    if (token) {
      await profileApi.registerFCM(token);
      console.log('FCM token registered');
    }

    return token;
  } catch (err) {
    console.error('FCM error:', err);
    return null;
  }
}

/**
 * Listen for foreground push messages
 */
export function onForegroundMessage(callback) {
  const { messaging } = initFirebase();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
