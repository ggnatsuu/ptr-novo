// src/config/firebase.js
// 🎯 Conexão centralizada com o Firebase (SDK v10 Modular).
// Qualquer componente que precisar de auth ou Firestore importa daqui,
// em vez de inicializar o app de novo em cada arquivo.
 
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
 
const firebaseConfig = {
  apiKey: "AIzaSyCP52iZeGS93SqjpcEW9X9NAcC3HBrmxxM",
  authDomain: "pocolordstr.firebaseapp.com",
  projectId: "pocolordstr",
  storageBucket: "pocolordstr.firebasestorage.app",
  messagingSenderId: "864392120692",
  appId: "1:864392120692:web:42900385664d189d320421",
  measurementId: "G-EDSNRZJE1Y",
};
 
const app = initializeApp(firebaseConfig);
 
export const auth = getAuth(app);
export const db = getFirestore(app);
 
export default app;