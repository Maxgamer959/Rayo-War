// ======================
// FIREBASE CONFIGURATION - RAYO WAR
// ======================

// Importar Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Configuración de Firebase - RAYO WAR (Credenciales Reales)
const firebaseConfig = {
    apiKey: "AIzaSyCDshwK38YtPOK_Y10Qv3g80h1lt80y9Ig",
    authDomain: "rayo-war.firebaseapp.com",
    projectId: "rayo-war",
    storageBucket: "rayo-war.firebasestorage.app",
    messagingSenderId: "368191820270",
    appId: "1:368191820270:web:05abe7c7038da614913eff",
    measurementId: "G-8M6KDPP2WF"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Auth y Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("✅ Firebase inicializado correctamente con Rayo War");
