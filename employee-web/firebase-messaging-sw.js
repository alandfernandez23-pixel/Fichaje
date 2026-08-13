importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyANMkRYgy05W86lJ42KTN7GsOFUCs8CupE",
  authDomain: "fichaje-b9421.firebaseapp.com",
  projectId: "fichaje-b9421",
  storageBucket: "fichaje-b9421.firebasestorage.app",
  messagingSenderId: "634712461696",
  appId: "1:634712461696:web:3faa528b066cb90df23165",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const titulo = payload.notification?.title || "Más Que Pilates";
  self.registration.showNotification(titulo, {
    body: payload.notification?.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
});
