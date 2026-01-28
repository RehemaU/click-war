<template>
  <div class="war-container">
    <div class="side left" @click="sendClick('left')">
      <div class="count">{{ counts.left }}</div>
      <p>TEAM RED</p>
    </div>

    <div class="side right" @click="sendClick('right')">
      <div class="count">{{ counts.right }}</div>
      <p>TEAM BLUE</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { db, ref as dbRef, onValue, runTransaction } from './firebase'

// 1. 상태 관리 (초기값 0)
const counts = ref({ left: 0, right: 0 })

// 2. 실시간 데이터 구독 (onValue)
// DB의 값이 변하면 이 함수가 자동으로 실행되어 화면이 바뀝니다.
onMounted(() => {
  const countsRef = dbRef(db, 'clicks');
  onValue(countsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      counts.value = {
        left: data.left || 0,
        right: data.right || 0
      };
    }
  });
})

// 3. 클릭 시 데이터 증가 (Transaction)
// 여러 명이 동시에 클릭해도 숫자가 씹히지 않게 처리합니다.
const sendClick = (side) => {
  const specificRef = dbRef(db, `clicks/${side}`);
  runTransaction(specificRef, (currentValue) => {
    return (currentValue || 0) + 1;
  });
}
</script>

<style scoped>
.war-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.side {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: 0.2s;
  user-select: none;
}
.left { background-color: #ff5e62; color: white; }
.right { background-color: #00f2fe; color: white; }
.side:active { opacity: 0.8; transform: scale(0.95); }
.count { font-size: 8rem; font-weight: bold; }
</style>