import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, runTransaction, serverTimestamp, get, set, update, increment } from "firebase/database";

// 본인의 Firebase 콘솔 설정값으로 채워져 있어야 합니다.
const firebaseConfig = {

};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// App.vue에서 사용할 함수들을 모두 export 합니다.
export { db, ref, onValue, runTransaction, serverTimestamp, get, set, update, increment };
