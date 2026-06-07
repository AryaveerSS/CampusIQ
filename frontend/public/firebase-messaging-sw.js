// public/firebase-messaging-sw.js
// This file MUST be in the /public directory for Firebase push to work

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Replace with your actual Firebase config
firebase.initializeApp({
  apiKey:            'NEXT_PUBLIC_FIREBASE_API_KEY',
  projectId:         'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId:             'NEXT_PUBLIC_FIREBASE_APP_ID',
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  const { type, slot_id, user_id } = payload.data || {};

  // Show notification with action buttons if it's an attendance prompt
  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/badge.png',
    tag: `attendance-${slot_id}`,
    requireInteraction: true,  // stays until user interacts
    actions: type === 'attendance_prompt'
      ? [
          { action: 'present', title: '✅ Yes, I attended' },
          { action: 'absent',  title: '❌ No, I missed it'  },
        ]
      : [],
    data: payload.data,
  };

  self.registration.showNotification(title, options);
});

// Handle notification click / action
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { action } = event;
  const { slot_id } = event.notification.data || {};

  if (action === 'present' || action === 'absent') {
    // POST to backend to mark attendance
    event.waitUntil(
      fetch('/api/attendance/respond-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id, status: action }),
      })
    );
  } else {
    // Open app on regular click
    event.waitUntil(clients.openWindow('/dashboard/attendance'));
  }
});
