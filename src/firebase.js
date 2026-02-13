import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, runTransaction, serverTimestamp, get, set, update, increment } from "firebase/database";

// 본인의 Firebase 콘솔 설정값으로 채워져 있어야 합니다.
const firebaseConfig = {
  apiKey: "AIzaSyCKtL_UbiIPlHvwEC3BY7k4BD3MwdPTPrw",
  authDomain: "click-war-ee167.firebaseapp.com",
  databaseURL: "https://click-war-ee167-default-rtdb.firebaseio.com/",
  projectId: "click-war-ee167",
  storageBucket: "click-war-ee167.firebasestorage.app",
  messagingSenderId: "1095709341884",
  appId: "1:1095709341884:web:0d21d511df284bbe9878b9",
  measurementId: "G-8N5DYZQ0T4"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// App.vue에서 사용할 함수들을 모두 export 합니다.
export { db, ref, onValue, runTransaction, serverTimestamp, get, set, update, increment };