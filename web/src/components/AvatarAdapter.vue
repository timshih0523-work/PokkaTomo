<!--
  AvatarAdapter.vue

  這是「插拔式 Avatar 介面」的核心：外部（App.vue / 對話邏輯）永遠只透過
  `status` 這個 prop 溝通，完全不知道底層是用 SVG、Lottie 還是 Three.js/VRM 畫的。

  status 的合法值：'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'HAPPY' | 'SLEEPY' | 'ASLEEP'
  quirk（小動作，選用、一次性）：'sneeze' | 'yawn' | 'hiccup' | 'hum' | 'lookaround' | 'dizzy' | 'toot' | 'eat' | 'dance'
    | 'blush' | 'earwiggle' | 'giggle' | 'wave' | 'hop' | 'tailwag'（後三個只有全身角色有動畫）
  variant：'full'（全身，預設，FullBodyAvatar.vue）| 'classic'（舊版圓圓的，SvgAvatar.vue）
  accessory（配件，選用）：節日 'santa' | 'witch' | 'sakura'；換季 'flowers' | 'strawhat' | 'beret' | 'scarf'（web/src/outfits.js，只有全身角色有）

  事件（角色 → 外面）：
    touch { part, side }：被摸／被點到哪個部位（part 見 web/src/avatarParts.js 的 PARTS，side 是 'left'|'right'|null）
    hover { part, side }：滑鼠移到哪個部位上
  底層元件回報的部位名稱會在這裡用 normalizePart() 統一，所以未來的 3D 角色可以直接回報骨架名稱
  （例如 'LeftHand'），App.vue 收到的永遠是統一的名稱。
  mood（情緒，選用）：'joy' | 'love' | 'calm' | 'sad' | 'worried' | 'surprised'
    ——「正在做什麼」跟「心情怎樣」是兩個獨立的維度：可以「難過地講話」、「開心地待著」。
    來源是後端 /api/chat 的 mood（見 server/lib/mood.js）。未來的 3D 角色一樣只要吃這兩個 prop。

  未來要換成 3D 角色時，只需要：
    1. 新增一個 ThreeAvatar.vue（或 VrmAvatar.vue），一樣接受 `status` prop，
       內部自己去對應成骨架動畫 / morph target。
    2. 把下面 <component :is="..."> 指到新的元件（或用環境變數/設定切換）。
  App.vue 完全不用改。
-->
<template>
  <div class="avatar-adapter">
    <component
      :is="currentAvatarComponent"
      @touch="onTouch"
      @hover="onHover"
      :status="status"
      :mood="mood"
      :label="label"
      :quirk="quirk"
      :accessory="accessory"
      :palette="palette"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SvgAvatar from './SvgAvatar.vue';
import FullBodyAvatar from './FullBodyAvatar.vue';
import { MOODS } from '../moods.js';
import { normalizePart } from '../avatarParts.js';

const emit = defineEmits(['touch', 'hover']);
const onTouch = (e) => emit('touch', normalizePart(e?.part, e?.side));
const onHover = (e) => emit('hover', normalizePart(e?.part, e?.side));

const props = defineProps({
  status: {
    type: String,
    default: 'IDLE',
    validator: (v) => ['IDLE', 'LISTENING', 'THINKING', 'SPEAKING', 'HAPPY', 'SLEEPY', 'ASLEEP'].includes(v)
  },
  // 角色名字，給螢幕報讀器唸的（角色可以改名，所以不寫死）。
  label: { type: String, default: 'PokkaTomo' },
  quirk: { type: String, default: null },
  accessory: { type: String, default: null },
  mood: {
    type: String,
    default: 'calm',
    validator: (v) => MOODS.includes(v)
  },
  // 用哪一隻角色：full = 全身（預設）、classic = 舊版圓圓的。使用者在設定面板選（profile.avatarStyle）。
  variant: { type: String, default: 'full' },
  // 毛色（web/src/palettes.js），每個角色可以不一樣
  palette: { type: String, default: 'peach' }
});

// 之後要加 3D/Lottie 角色，在這裡多加一個選項即可（App.vue 不用改）。
const AVATARS = { full: FullBodyAvatar, classic: SvgAvatar };
const currentAvatarComponent = computed(() => AVATARS[props.variant] || FullBodyAvatar);
</script>

<style scoped>
/* 尺寸完全由外層決定（App.vue 的 .avatar-anchor，吃 styles.css 的 --avatar-size），
   這裡只負責填滿。以前兩邊各寫一份 min(60vw, 260px)、要記得一起改，現在只剩一個地方。 */
.avatar-adapter {
  width: 100%;
  height: 100%;
}
</style>
