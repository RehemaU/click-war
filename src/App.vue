<template>
  <div class="war-container" :class="{ banned: isLocalBanned }">
    <div class="side left" @pointerdown="handleUserClick('left')">
      <!-- Visual Count: Monotonic display to prevent jitter -->
      <div class="count">{{ visualCounts.left }}</div>
      <p>TEAM RED</p>
    </div>
    <div class="side right" @pointerdown="handleUserClick('right')">
      <div class="count">{{ visualCounts.right }}</div>
      <p>TEAM BLUE</p>
    </div>

    <!-- Ban Overlay -->
    <div v-if="isLocalBanned" class="ban-overlay">
      <div class="ban-content">
        <h2>⛔ ACCESS DENIED ⛔</h2>
        <p v-if="banType === 'permanent'">영구 차단되었습니다.</p>
        <p v-else>
          너무 빠른 클릭이 감지되었습니다.<br>
          <span class="timer">{{ banRemainingTime }}</span>초 후 해제됩니다.
        </p>
        <p class="warning-text" v-if="warningCount < 4 && banType !== 'permanent'">
           (경고 누적: {{ warningCount }}/3회 - 4회 시 영구차단)
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { db, ref as dbRef, onValue, serverTimestamp, get, set, update, increment } from './firebase'

// --- State ---
const counts = ref({ left: 0, right: 0 })         // Raw Server state
const pendingClicks = ref({ left: 0, right: 0 })  // Local unsent clicks
const visualCounts = ref({ left: 0, right: 0 })   // Displayed state (Monotonic)

// Ban State
const isLocalBanned = ref(false)
const banType = ref(null) // 'temporary' | 'permanent'
const banRemainingTime = ref(0)
const warningCount = ref(0)
let banTimerInterval = null

// Rate Limiting
let clickRateCount = 0
let lastRateCheckTime = Date.now()
const CLICK_LIMIT_PER_SEC = 20

// Batching
let flushInterval = null

// User ID
let userId = localStorage.getItem('user_id');
if (!userId) {
  userId = 'u_' + Math.random().toString(36).substring(2, 11);
  localStorage.setItem('user_id', userId);
}

// --- Lifecycle ---
onMounted(() => {
  // 1. Sync Logic
  const countsRef = dbRef(db, 'clicks');
  onValue(countsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      counts.value = { left: data.left?.value || 0, right: data.right?.value || 0 };
      updateVisualCounts();
    }
  });

  // 2. Initial Ban Check
  checkInitialBanStatus();

  // 3. Start Batch Flushing (every 200ms)
  flushInterval = setInterval(flushPendingClicks, 200);
})

onUnmounted(() => {
  if (flushInterval) clearInterval(flushInterval);
  if (banTimerInterval) clearInterval(banTimerInterval);
})

// --- Watchers for Monotonic Display ---
// Whenever server counts or pending clicks change, we try to update visual counts.
// But we generally only allow it to GO UP.
watch(pendingClicks, () => updateVisualCounts(), { deep: true });

function updateVisualCounts() {
  const targetLeft = counts.value.left + pendingClicks.value.left;
  const targetRight = counts.value.right + pendingClicks.value.right;

  // Monotonic Logic: Only update if target is greater than current visual.
  // Exception: If the server count drops significantly (e.g. database reset), we allow sync.
  if (targetLeft >= visualCounts.value.left || counts.value.left < visualCounts.value.left - 100) {
    visualCounts.value.left = targetLeft;
  }
  
  if (targetRight >= visualCounts.value.right || counts.value.right < visualCounts.value.right - 100) {
    visualCounts.value.right = targetRight;
  }
}

// --- Click Handling ---
const handleUserClick = (side) => {
  if (isLocalBanned.value) return;

  // 1. Rate Check
  const now = Date.now();
  if (now - lastRateCheckTime >= 1000) {
    clickRateCount = 0;
    lastRateCheckTime = now;
  }
  
  clickRateCount++;

  if (clickRateCount > CLICK_LIMIT_PER_SEC) {
    triggerBanLogic(); // Too fast!
    return;
  }

  // 2. Queue Click
  pendingClicks.value[side]++;
  // (Watcher will update visualCounts automatically)
}

// --- Batching Logic ---
const flushPendingClicks = async () => {
  if (isLocalBanned.value) return;

  const updates = {};
  let hasUpdates = false;

  // Snapshot pending values to allow for safe subtraction/reset
  const flushLeft = pendingClicks.value.left;
  const flushRight = pendingClicks.value.right;

  if (flushLeft > 0) {
    updates[`clicks/left/value`] = increment(flushLeft);
    updates[`clicks/left/last_updated`] = serverTimestamp();
    updates[`clicks/left/user_id`] = userId;
    hasUpdates = true;
  }

  if (flushRight > 0) {
    updates[`clicks/right/value`] = increment(flushRight);
    updates[`clicks/right/last_updated`] = serverTimestamp();
    updates[`clicks/right/user_id`] = userId;
    hasUpdates = true;
  }

  if (hasUpdates) {
    // 1. Optimistic Reset: "Move" pending to "sent" (implicitly)
    // We strictly subtract what we are sending. 
    // Usually pendingClicks is exactly what we perform increment on.
    pendingClicks.value.left -= flushLeft;
    pendingClicks.value.right -= flushRight;
    
    // NOTE: visualCounts will NOT drop because updateVisualCounts checks (target >= visual).
    // Target drops (server+0), but visual stays high until server catches up.

    try {
      await update(dbRef(db), updates);
    } catch (error) {
      console.error("Update failed:", error);
      // Restore clicks if failed? (Optional, but simple is better here)
      // If permission denied, trigger ban
      if (error.message.includes("permission_denied")) {
        triggerBanLogic();
      }
    }
  }
}

// --- Ban Logic (v2) ---
const triggerBanLogic = async () => {
  if (isLocalBanned.value && banType.value === 'permanent') return;

  // v2: Reset warning history for everyone by using a new field
  const banRef = dbRef(db, `banned_users/${userId}`);
  
  isLocalBanned.value = true;
  
  try {
    const snapshot = await get(banRef);
    const serverData = snapshot.val() || {};
    let currentWarnings = serverData.warning_count_v2 || 0;
    
    currentWarnings++;
    warningCount.value = currentWarnings;

    if (currentWarnings >= 4) {
      // 4th Strike = PERMANENT
      banType.value = 'permanent';
      await set(banRef, {
        type: 'permanent',
        warning_count_v2: currentWarnings,
        reason: "Exceeded limit (4th strike)",
        timestamp: serverTimestamp()
      });
    } else {
      // Temporary Bans
      banType.value = 'temporary';
      
      // 1st: 30s, 2nd: 60s, 3rd: 300s(5min)
      let durationSec = 30;
      if (currentWarnings === 2) durationSec = 60;
      if (currentWarnings === 3) durationSec = 300;

      const until = Date.now() + (durationSec * 1000);
      
      banRemainingTime.value = durationSec;
      startBanTimer(until);

      await set(banRef, { // Merge set to keep other data if necessary, but here we overwrite mostly
        type: 'temporary',
        warning_count_v2: currentWarnings,
        until: until,
        timestamp: serverTimestamp()
      });
    }
  } catch (e) {
    console.error("Ban logic error:", e);
  }
}

const checkInitialBanStatus = async () => {
  const banRef = dbRef(db, `banned_users/${userId}`);
  const snapshot = await get(banRef);
  
  if (snapshot.exists()) {
    const data = snapshot.val();
    warningCount.value = data.warning_count_v2 || 0;

    if (data.type === 'permanent') {
      isLocalBanned.value = true;
      banType.value = 'permanent';
    } else if (data.until && Date.now() < data.until) {
      isLocalBanned.value = true;
      banType.value = 'temporary';
      startBanTimer(data.until);
    }
  }
}

const startBanTimer = (untilTimestamp) => {
  if (banTimerInterval) clearInterval(banTimerInterval);

  const updateTimer = () => {
    const remaining = Math.ceil((untilTimestamp - Date.now()) / 1000);
    if (remaining <= 0) {
      isLocalBanned.value = false;
      banRemainingTime.value = 0;
      clearInterval(banTimerInterval);
    } else {
      banRemainingTime.value = remaining;
    }
  };

  updateTimer();
  banTimerInterval = setInterval(updateTimer, 1000);
}
</script>

<style scoped>
.war-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  touch-action: manipulation;
  position: relative;
}
.side {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: transform 0.05s;
  user-select: none;
  -webkit-user-select: none;
}
.left { background-color: #ff5e62; color: white; }
.right { background-color: #00f2fe; color: white; }

.side:active {
  opacity: 0.9;
  transform: scale(0.98);
}
.count { font-size: 8rem; font-weight: bold; pointer-events: none; }

/* Ban UI */
.ban-overlay {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  color: white;
  text-align: center;
}
.ban-content h2 {
  font-size: 3rem;
  color: #ff4444;
  margin-bottom: 20px;
}
.ban-content p {
  font-size: 1.5rem;
  line-height: 1.6;
}
.timer {
  font-size: 4rem;
  font-weight: bold;
  color: #ffe600;
  display: block;
  margin: 10px 0;
}
.warning-text {
  font-size: 1rem !important;
  color: #aaa;
  margin-top: 15px;
}
</style>