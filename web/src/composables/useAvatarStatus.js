// useAvatarStatus.js
// 集中管理 Avatar 的狀態機，並加上「24 小時時間感知」：
// 晚上時段（預設 23:00–07:00）如果沒有其他事情發生（IDLE），
// 就自動顯示成 SLEEPY，讓角色感覺是真的有生活作息，而不是每次進來都一樣。
//
// 對話流程只需要呼叫 setStatus('LISTENING' | 'THINKING' | 'SPEAKING' | 'HAPPY')，
// 這個 composable 會負責在恢復 IDLE 時，依照當下時間決定要不要顯示 SLEEPY。
//
// SLEEPY 跟 ASLEEP 不一樣：SLEEPY 是「晚上了、有點睏」（醒著），ASLEEP 是使用者說了晚安之後
// 「真的睡著了」（閉眼、會說夢話，見 useQuirks.js），要被叫醒（說話、或連點好幾下）才會醒。

import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue';

const NIGHT_START_HOUR = 23;
const NIGHT_END_HOUR = 7;

function isNightNow() {
  const hour = new Date().getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

export function useAvatarStatus() {
  const status = ref(isNightNow() ? 'SLEEPY' : 'IDLE');
  const isNight = ref(isNightNow());
  const asleep = ref(false);
  let timer = null;

  function restToIdle() {
    status.value = asleep.value ? 'ASLEEP' : isNight.value ? 'SLEEPY' : 'IDLE';
  }

  // 睡著／醒來。正在聽、想、講話的時候不打斷，等那些結束時 restToIdle() 自然會套用。
  function setAsleep(value) {
    asleep.value = !!value;
    if (['IDLE', 'SLEEPY', 'ASLEEP', 'HAPPY'].includes(status.value)) restToIdle();
  }

  function setStatus(next, { autoRestMs } = {}) {
    status.value = next;
    if (autoRestMs) {
      setTimeout(() => {
        // 只有在還停在同一個暫時狀態時才自動回到 IDLE/SLEEPY，
        // 避免蓋掉使用者這段時間內觸發的新狀態。
        if (status.value === next) restToIdle();
      }, autoRestMs);
    }
  }

  // 在元件外（例如自動測試）使用時沒有生命週期，就不啟動每分鐘的日夜檢查。
  if (!getCurrentInstance()) return { status, isNight, asleep, setStatus, restToIdle, setAsleep };

  onMounted(() => {
    // 每分鐘檢查一次是不是進入/離開夜間時段。
    timer = setInterval(() => {
      const night = isNightNow();
      if (night !== isNight.value) {
        isNight.value = night;
        if (status.value === 'IDLE' || status.value === 'SLEEPY' || status.value === 'ASLEEP') restToIdle();
      }
    }, 60 * 1000);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { status, isNight, asleep, setStatus, restToIdle, setAsleep };
}
