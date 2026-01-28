// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, runTransaction } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCKtL_UbiIPlHvwEC3BY7k4BD3MwdPTPrw",
  authDomain: "click-war-ee167.firebaseapp.com",
  projectId: "click-war-ee167",
  storageBucket: "click-war-ee167.firebasestorage.app",
  messagingSenderId: "1095709341884",
  appId: "1:1095709341884:web:0d21d511df284bbe9878b9",
  measurementId: "G-8N5DYZQ0T4",
  databaseURL: "https://click-war-ee167-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const analytics = getAnalytics(app);

export { db, ref, onValue, runTransaction };