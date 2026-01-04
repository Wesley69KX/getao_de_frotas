// ===============================
// Firebase Inicialização
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// CONFIG DO SEU FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAbWgRpYBguSf5J9xYG7EwH6tx0xxBEvV4",
    authDomain: "gestao-torres.firebaseapp.com",
    projectId: "gestao-torres",
    storageBucket: "gestao-torres.firebasestorage.app",
    messagingSenderId: "580007649384",
    appId: "1:580007649384:web:568bd6c711bb9e0df35bdd",
    measurementId: "G-P6N25K7R4X"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);

// Firestore
const db = getFirestore(app);
const towersRef = collection(db, "torres");

// Export
export { db, towersRef };
