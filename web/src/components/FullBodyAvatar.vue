<!--
  FullBodyAvatar.vue — 全身角色（預設）。手繪風的原創小動物：大頭、圓耳朵、短短的手腳、蓬蓬的尾巴。
  純 SVG＋CSS 動畫，沒有任何圖片或套件，整個元件幾 KB，在舊 Mac 上也很順。

  跟舊版 SvgAvatar 一樣只吃 props（status／mood／quirk／outfit／label）、只發 touch／hover 事件，
  outfit＝衣櫥實際穿在身上的東西 { head, neck, body, face }（web/src/outfits.js 的 resolveOutfit；舊的 accessory 也還吃）。
  表情規則共用 web/src/avatarFaces.js、點擊判斷共用 composables/useAvatarHit.js。

  「手繪感」的做法：每個形狀都有同一色的柔和描邊（圓角接點）、身體用由上到下的漸層、
  毛色邊緣稍微深一點、白色的反光點，不用濾鏡（filter 在 Safari 上很吃效能）。

  身體部位（感應區 data-part，名稱見 web/src/avatarParts.js 的 FULL_BODY_PARTS）：
    head 頭頂、face 臉、cheek 臉頰（左右）、ear 耳朵（左右）、belly 肚子（心情燈）、
    hand 手（左右）、foot 腳（左右）、tail 尾巴、body 身體其他地方
  部位專屬的小動作（App.vue 的 PART_QUIRK）：
    blush 臉紅、earwiggle 耳朵抖、giggle 笑到發抖、wave 揮手、hop 跳一下、tailwag 搖尾巴

  狀態的身體語言：
    LISTENING 耳朵亮、頭微微歪；THINKING 一隻手摸下巴；SPEAKING 手跟著輕輕擺；
    HAPPY 雙手舉高；SLEEPY 半閉眼、慢慢晃；ASLEEP 閉眼、Zzz、整隻變淡紫、尾巴捲起來
-->
<template>
  <svg
    viewBox="0 0 200 200"
    class="fb-avatar"
    :class="[statusClass, `mood-${mood}`, quirk ? `quirk-${quirk}` : '']"
    :style="rootStyle"
    role="button"
    tabindex="0"
    :aria-label="label"
    @click="onClick"
    @pointerover="onPointerOver"
    @pointerout="onPointerOut"
    @keydown.enter.prevent="emitTouch('head')"
    @keydown.space.prevent="emitTouch('head')"
  >
    <defs>
      <linearGradient :id="`${uid}-fur`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="fur-top" />
        <stop offset="1" class="fur-bottom" />
      </linearGradient>
      <!-- 衣服只畫在身體的範圍裡 -->
      <clipPath :id="`${uid}-body`">
        <path d="M66 150 C62 120 80 110 100 110 C120 110 138 120 134 150 C132 176 120 186 100 186 C80 186 68 176 66 150 Z" />
      </clipPath>
      <radialGradient :id="`${uid}-cream`" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#fffaf1" />
        <stop offset="1" stop-color="#ffeccf" />
      </radialGradient>
    </defs>

    <!-- 地上的影子：浮起來的時候變小 -->
    <ellipse cx="100" cy="194" rx="40" ry="4.5" class="shadow" />

    <g class="quirk-group">
      <g class="float-group">
        <!-- 尾巴（在身體後面） -->
        <g class="tail">
          <!-- 蓬蓬的大尾巴：一個斜斜的橢圓＋淺色尾巴尖，外框最後再描一次才不會被尾巴尖蓋掉 -->
          <ellipse cx="149" cy="146" rx="16" ry="28" transform="rotate(34 149 146)" class="fur" />
          <ellipse cx="159" cy="131" rx="9.5" ry="11" transform="rotate(34 159 131)" class="tail-tip" />
          <ellipse cx="149" cy="146" rx="16" ry="28" transform="rotate(34 149 146)" class="outline" />
          <path class="fur-line" d="M142 150 q6 -3 9 -10 M147 158 q6 -3 9 -9" />
        </g>

        <!-- 身體 -->
        <path
          class="fur"
          d="M66 150 C62 120 80 110 100 110 C120 110 138 120 134 150 C132 176 120 186 100 186 C80 186 68 176 66 150 Z"
        />
        <ellipse cx="100" cy="158" rx="22" ry="21" class="cream" />
        <!-- 衣櫥：衣服（身體上、心情燈下面；心情燈像胸針一樣一直看得到） -->
        <g v-if="body" class="acc clothes" :clip-path="`url(#${uid}-body)`">
          <template v-if="body === 'tshirt'">
            <rect x="58" y="108" width="84" height="58" fill="#7fb8e8" />
            <path d="M60 164 H140" stroke="#5b93c4" stroke-width="2" />
            <path d="M88 112 Q100 122 112 112" stroke="#5b93c4" stroke-width="2" fill="none" />
          </template>
          <template v-else-if="body === 'sweater'">
            <rect x="58" y="108" width="84" height="62" fill="#f2a7a0" />
            <path d="M72 126 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6" stroke="#fbd3cf" stroke-width="2" fill="none" />
            <rect x="58" y="162" width="84" height="8" fill="#e58d85" />
            <path d="M66 162 v8 M74 162 v8 M82 162 v8 M90 162 v8 M98 162 v8 M106 162 v8 M114 162 v8 M122 162 v8 M130 162 v8" stroke="#d07d76" stroke-width="1" />
          </template>
          <template v-else-if="body === 'yukata'">
            <rect x="58" y="108" width="84" height="80" fill="#445d93" />
            <circle v-for="d in YUKATA_DOTS" :key="d.join()" :cx="d[0]" :cy="d[1]" r="2.2" fill="#e8eefc" opacity="0.8" />
            <path d="M84 110 L100 134 L116 110" stroke="#ffffff" stroke-width="5" fill="none" stroke-linejoin="round" />
            <rect x="58" y="148" width="84" height="11" fill="#f28c8c" />
            <path d="M58 153.5 H142" stroke="#ffd1d1" stroke-width="1.5" />
          </template>
          <template v-else-if="body === 'apron'">
            <path d="M82 124 H118 V150 C126 152 130 166 128 186 H72 C70 166 74 152 82 150 Z" fill="#fffdf7" stroke="#e0c9a6" stroke-width="1.8" stroke-linejoin="round" />
            <path d="M82 124 L76 112 M118 124 L124 112" stroke="#e0c9a6" stroke-width="3" stroke-linecap="round" />
            <path d="M90 164 h20 v10 a4 4 0 0 1 -4 4 h-12 a4 4 0 0 1 -4 -4 Z" fill="#ffe3e9" stroke="#e8b4c0" stroke-width="1.4" />
          </template>
          <template v-else-if="body === 'raincoat'">
            <rect x="58" y="108" width="84" height="74" fill="#ffd54f" />
            <path d="M100 118 V182" stroke="#e0b030" stroke-width="1.8" />
            <circle cx="106" cy="160" r="2.4" fill="#e0b030" /><circle cx="106" cy="172" r="2.4" fill="#e0b030" />
            <path d="M58 180 H142" stroke="#e0b030" stroke-width="2" />
          </template>
        </g>
        <path v-if="body" class="clothes-outline" d="M66 150 C62 120 80 110 100 110 C120 110 138 120 134 150 C132 176 120 186 100 186 C80 186 68 176 66 150 Z" />
        <!-- 心情燈：情緒的顏色 -->
        <!-- 心情燈：胸口的小愛心，顏色＝現在的心情 -->
        <path
          class="mood-light"
          d="M100 152 C91 146 90 139.5 94.5 137.8 C97.3 136.8 99.4 138.4 100 140.6 C100.6 138.4 102.7 136.8 105.5 137.8 C110 139.5 109 146 100 152 Z"
        />

        <!-- 腳 -->
        <ellipse cx="84" cy="187" rx="13" ry="7" class="fur foot foot-left" />
        <ellipse cx="116" cy="187" rx="13" ry="7" class="fur foot foot-right" />
        <path class="paw-line" d="M80 188 v3 M86 188 v3 M112 188 v3 M118 188 v3" />

        <!-- 手（在身體前面）。外層 g 做動畫，裡面的 transform 只負責擺好角度 -->
        <g class="arm arm-left">
          <ellipse cx="68" cy="142" rx="8.5" ry="15" transform="rotate(28 68 142)" class="fur" />
          <!-- 袖子：短袖蓋手臂上半、長袖（毛衣、雨衣、浴衣）蓋到手腕，手掌露出來 -->
          <ellipse v-if="sleeve" :cx="sleeve.long ? 70 : 72.5" :cy="sleeve.long ? 139 : 134" rx="9.6" :ry="sleeve.long ? 12.5 : 8" :transform="`rotate(28 ${sleeve.long ? 70 : 72.5} ${sleeve.long ? 139 : 134})`" :fill="sleeve.fill" :stroke="sleeve.line" stroke-width="1.5" />
        </g>
        <g class="arm arm-right">
          <ellipse cx="132" cy="142" rx="8.5" ry="15" transform="rotate(-28 132 142)" class="fur" />
          <ellipse v-if="sleeve" :cx="sleeve.long ? 130 : 127.5" :cy="sleeve.long ? 139 : 134" rx="9.6" :ry="sleeve.long ? 12.5 : 8" :transform="`rotate(-28 ${sleeve.long ? 130 : 127.5} ${sleeve.long ? 139 : 134})`" :fill="sleeve.fill" :stroke="sleeve.line" stroke-width="1.5" />
        </g>

        <!-- 吃東西：雙手捧著飯糰（畫在手的前面、頭的後面，手從兩側捧著），頭一下一下低下去咬 -->
        <g v-if="quirk === 'eat' && !neck" class="snack">
          <path d="M100 119 C108 119 123 139 123 146 C123 154 77 154 77 146 C77 139 92 119 100 119 Z" fill="#ffffff" stroke="#cdbfa9" stroke-width="1.8" stroke-linejoin="round" />
          <rect x="88" y="138" width="24" height="15" rx="2.5" fill="#2f3d2f" />
          <circle cx="96" cy="129" r="1.2" fill="#e57373" /><circle cx="104" cy="131" r="1" fill="#e57373" />
        </g>

        <!-- 頭（耳朵 → 頭 → 臉） -->
        <g class="head-group">
          <g class="ear ear-left" :class="{ 'ear-glow': status === 'LISTENING' }">
            <circle cx="60" cy="44" r="17" class="fur" />
            <circle cx="61" cy="46" r="9" class="ear-inner" />
          </g>
          <g class="ear ear-right" :class="{ 'ear-glow': status === 'LISTENING' }">
            <circle cx="140" cy="44" r="17" class="fur" />
            <circle cx="139" cy="46" r="9" class="ear-inner" />
          </g>

          <ellipse cx="100" cy="80" rx="52" ry="44" class="fur head" />
          <!-- 嘴邊的淺色毛 -->
          <ellipse cx="100" cy="99" rx="17" ry="11" class="cream muzzle" />
          <!-- 頭頂一撮毛 -->
          <path class="tuft" d="M93 38 Q95 27 102 34 Q104 25 111 35" />

          <!-- 頭上的配件（衣櫥的「頭」；自動＝節日配件或換季帽子） -->
          <g v-if="head === 'santa' && status !== 'ASLEEP'" class="acc">
            <path d="M58 56 C62 22 104 4 140 14 L128 54 Z" fill="#e53935" stroke="#b71c1c" stroke-width="1.5" />
            <circle cx="142" cy="14" r="8" fill="#ffffff" />
            <rect x="54" y="48" width="92" height="12" rx="6" fill="#ffffff" />
          </g>
          <g v-else-if="head === 'witch' && status !== 'ASLEEP'" class="acc">
            <ellipse cx="100" cy="46" rx="54" ry="9" fill="#4a2f73" />
            <path d="M76 44 L108 -4 L124 44 Z" fill="#6a45a3" />
            <rect x="78" y="34" width="44" height="8" fill="#ffb74d" />
          </g>
          <g v-else-if="head === 'sakura'" class="acc">
            <circle
              v-for="a in [0, 72, 144, 216, 288]"
              :key="a"
              :cx="136 + 6.5 * Math.cos((a * Math.PI) / 180)"
              :cy="52 + 6.5 * Math.sin((a * Math.PI) / 180)"
              r="5"
              fill="#ffb7d0"
            />
            <circle cx="136" cy="52" r="2.8" fill="#ff7aa8" />
          </g>
          <!-- 睡覺：睡帽（蓋過季節的帽子） -->
          <g v-if="status === 'ASLEEP'" class="acc nightcap">
            <path d="M56 58 C58 26 96 12 128 20 C146 25 160 40 166 62 L150 58 C146 44 138 38 128 38 L140 56 Z" fill="#8fa3e0" stroke="#6377b8" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M84 24 L92 50 M108 18 L112 46" stroke="#b9c6f0" stroke-width="5" stroke-linecap="round" />
            <circle cx="166" cy="64" r="7" fill="#ffffff" stroke="#c9d2f0" stroke-width="1.2" />
            <rect x="52" y="50" width="96" height="11" rx="5.5" fill="#ffffff" stroke="#c9d2f0" stroke-width="1.2" />
          </g>
          <!-- 帽子類（睡覺時戴睡帽，其他帽子先拿下來） -->
          <g v-else-if="head === 'flowers'" class="acc">
            <g v-for="(f, i) in SPRING_FLOWERS" :key="i" :transform="`translate(${f[0]} ${f[1]})`">
              <circle v-for="a in [0, 72, 144, 216, 288]" :key="a" :cx="4.2 * Math.cos((a * Math.PI) / 180)" :cy="4.2 * Math.sin((a * Math.PI) / 180)" r="3.4" :fill="f[2]" />
              <circle r="2.2" fill="#ffd54f" />
            </g>
          </g>
          <g v-else-if="head === 'strawhat'" class="acc">
            <ellipse cx="100" cy="46" rx="64" ry="11" fill="#f3d58a" stroke="#c9a24f" stroke-width="1.6" />
            <path d="M68 46 C66 18 134 18 132 46 Z" fill="#f3d58a" stroke="#c9a24f" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M68 40 C88 44 112 44 132 40 L132 46 C112 50 88 50 68 46 Z" fill="#e57373" />
            <path d="M80 30 q20 -4 40 0" stroke="#d8b665" stroke-width="1.2" fill="none" />
          </g>
          <g v-else-if="head === 'beret'" class="acc">
            <ellipse cx="94" cy="40" rx="46" ry="15" transform="rotate(-10 94 40)" fill="#b0463f" stroke="#86302b" stroke-width="1.6" />
            <rect x="96" y="20" width="4" height="7" rx="2" transform="rotate(-10 98 24)" fill="#86302b" />
            <!-- 一片小楓葉 -->
            <path d="M134 44 l3 -6 l2 4 l4 -3 l-1 5 l5 1 l-5 3 l2 4 l-5 -2 l-1 5 l-2 -5 l-5 2 l2 -4 l-5 -2 l5 -2 Z" fill="#f08a3c" />
          </g>
          <g v-else-if="head === 'beanie'" class="acc">
            <path d="M56 58 C54 20 146 20 144 58 Z" fill="#7db38a" stroke="#5c8f69" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M78 30 v24 M92 26 v28 M108 26 v28 M122 30 v24" stroke="#94c4a0" stroke-width="2" />
            <rect x="53" y="48" width="94" height="13" rx="6.5" fill="#6aa078" stroke="#5c8f69" stroke-width="1.4" />
            <circle cx="100" cy="20" r="9" fill="#fbfbf6" stroke="#dcdccf" stroke-width="1.2" />
          </g>
          <g v-else-if="head === 'ribbon'" class="acc">
            <ellipse cx="119" cy="40" rx="11" ry="7" transform="rotate(-25 119 40)" fill="#ff6f91" stroke="#e0467c" stroke-width="1.4" />
            <ellipse cx="139" cy="34" rx="11" ry="7" transform="rotate(-25 139 34)" fill="#ff6f91" stroke="#e0467c" stroke-width="1.4" />
            <circle cx="129" cy="37" r="4.5" fill="#e0467c" />
          </g>
          <g v-else-if="head === 'crown'" class="acc">
            <path d="M76 42 L78 18 L90 30 L100 12 L110 30 L122 18 L124 42 Z" fill="#ffd54f" stroke="#d4a017" stroke-width="1.8" stroke-linejoin="round" />
            <circle cx="100" cy="34" r="3.4" fill="#e57373" /><circle cx="86" cy="36" r="2.4" fill="#64b5f6" /><circle cx="114" cy="36" r="2.4" fill="#64b5f6" />
            <circle cx="78" cy="17" r="2.4" fill="#fff3a8" /><circle cx="100" cy="11" r="2.6" fill="#fff3a8" /><circle cx="122" cy="17" r="2.4" fill="#fff3a8" />
          </g>

          <!-- 臉頰 -->
          <ellipse cx="68" cy="98" rx="10" ry="6.5" class="cheek" />
          <ellipse cx="132" cy="98" rx="10" ry="6.5" class="cheek" />

          <!-- 眼睛 -->
          <g v-if="eyeStyle === 'closed'" class="line-eyes">
            <path d="M72 86 Q80 93 88 86" />
            <path d="M112 86 Q120 93 128 86" />
          </g>
          <g v-else-if="eyeStyle === 'dizzy'" class="line-eyes">
            <circle cx="80" cy="84" r="7" /><circle cx="80" cy="84" r="3" />
            <circle cx="120" cy="84" r="7" /><circle cx="120" cy="84" r="3" />
          </g>
          <g v-else class="eyes">
            <g class="eye">
              <ellipse cx="80" cy="84" rx="7.5" ry="9.5" class="pupil" />
              <circle cx="82.6" cy="80.2" r="2.6" class="shine" />
            </g>
            <g class="eye">
              <ellipse cx="120" cy="84" rx="7.5" ry="9.5" class="pupil" />
              <circle cx="122.6" cy="80.2" r="2.6" class="shine" />
            </g>
            <path v-if="status === 'SLEEPY'" d="M71 81 Q80 88 89 81" class="lid" />
            <path v-if="status === 'SLEEPY'" d="M111 81 Q120 88 129 81" class="lid" />
          </g>

          <!-- 眉毛：難過／擔心 -->
          <g v-if="showMoodFace && (mood === 'sad' || mood === 'worried')" class="brows">
            <path d="M72 72 Q79 68 88 73" />
            <path d="M112 73 Q121 68 128 72" />
          </g>

          <!-- 衣櫥：眼鏡 -->
          <g v-if="face === 'roundglasses'" class="acc glasses">
            <circle cx="80" cy="85" r="11.5" fill="rgba(255,255,255,0.18)" stroke="#6d4c41" stroke-width="2.3" />
            <circle cx="120" cy="85" r="11.5" fill="rgba(255,255,255,0.18)" stroke="#6d4c41" stroke-width="2.3" />
            <path d="M91.5 84 Q100 79 108.5 84 M68.5 83 L56 79 M131.5 83 L144 79" stroke="#6d4c41" stroke-width="2.3" fill="none" stroke-linecap="round" />
          </g>
          <g v-else-if="face === 'sunglasses'" class="acc glasses">
            <path d="M66 78 H94 V88 Q94 97 84 97 H76 Q66 97 66 88 Z M106 78 H134 V88 Q134 97 124 97 H116 Q106 97 106 88 Z" fill="#2f2f38" stroke="#1d1d24" stroke-width="1.6" opacity="0.92" />
            <path d="M94 81 H106 M66 80 L56 77 M134 80 L144 77" stroke="#1d1d24" stroke-width="2.3" stroke-linecap="round" />
            <path d="M71 82 l6 0 M111 82 l6 0" stroke="#ffffff" stroke-width="2" opacity="0.55" stroke-linecap="round" />
          </g>
          <g v-else-if="face === 'heartglasses'" class="acc glasses">
            <path v-for="x in [80, 120]" :key="x" :transform="`translate(${x} 84)`" d="M0 10 C-14 1 -14 -9 -7 -10 C-3 -11 -0.5 -8 0 -5 C0.5 -8 3 -11 7 -10 C14 -9 14 1 0 10 Z" fill="rgba(255,122,168,0.72)" stroke="#e0467c" stroke-width="1.8" stroke-linejoin="round" />
            <path d="M92 81 Q100 77 108 81 M67 80 L56 77 M133 80 L144 77" stroke="#e0467c" stroke-width="2" fill="none" stroke-linecap="round" />
          </g>

          <!-- 鼻子＋嘴巴（嘴型共用 avatarFaces.js，原本以 (100,142) 為中心，縮小搬到這裡） -->
          <ellipse cx="100" cy="95" rx="3.4" ry="2.4" class="nose" />
          <g transform="translate(100 103) scale(0.6) translate(-100 -142)">
            <path :d="mouthPath" class="mouth" :class="{ 'mouth-talking': status === 'SPEAKING' }" />
          </g>
        </g>

        <!-- 脖子（在頭的下面、身體前面）：圍巾（冬天自動）、領結、鈴鐺項圈、領巾 -->
        <g v-if="neck === 'scarf'" class="acc scarf">
          <path d="M60 118 C78 130 122 130 140 118 L142 129 C122 141 78 141 58 129 Z" fill="#e05a5a" stroke="#b83f3f" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M116 130 L132 128 L136 160 L120 162 Z" fill="#e05a5a" stroke="#b83f3f" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M121 158 v6 M126 158 v6 M131 157 v6" stroke="#b83f3f" stroke-width="1.6" stroke-linecap="round" />
          <path d="M72 128 q28 8 56 0" stroke="#ffffff" stroke-width="2.5" fill="none" opacity="0.7" stroke-dasharray="5 5" />
        </g>

        <g v-else-if="neck === 'bowtie'" class="acc">
          <path d="M100 124 L86 116 Q83 124 86 132 Z M100 124 L114 116 Q117 124 114 132 Z" fill="#e05a7a" stroke="#b8405c" stroke-width="1.5" stroke-linejoin="round" />
          <circle cx="100" cy="124" r="3.6" fill="#b8405c" />
        </g>
        <g v-else-if="neck === 'bell'" class="acc">
          <path d="M62 118 C80 129 120 129 138 118 L139 124 C120 135 80 135 61 124 Z" fill="#e05a5a" stroke="#b83f3f" stroke-width="1.3" stroke-linejoin="round" />
          <!-- 鈴鐺在心情燈上面一點，不要擋到它 -->
          <circle cx="100" cy="130" r="5.2" fill="#ffd54f" stroke="#d4a017" stroke-width="1.4" />
          <path d="M100 131 v3.4 M95.5 129 h9" stroke="#a87a10" stroke-width="1.2" stroke-linecap="round" />
        </g>
        <g v-else-if="neck === 'bandana'" class="acc">
          <path d="M64 118 C80 128 120 128 136 118 L130 125 L100 136 L70 125 Z" fill="#5a9be0" stroke="#3f7cc0" stroke-width="1.4" stroke-linejoin="round" />
          <circle cx="86" cy="126" r="1.5" fill="#fff" /><circle cx="100" cy="130" r="1.5" fill="#fff" /><circle cx="114" cy="126" r="1.5" fill="#fff" />
        </g>

        <!-- 脖子有東西時飯糰要畫在它前面，不然會被擋住 -->
        <g v-if="quirk === 'eat' && neck" class="snack">
          <path d="M100 119 C108 119 123 139 123 146 C123 154 77 154 77 146 C77 139 92 119 100 119 Z" fill="#ffffff" stroke="#cdbfa9" stroke-width="1.8" stroke-linejoin="round" />
          <rect x="88" y="138" width="24" height="15" rx="2.5" fill="#2f3d2f" />
          <circle cx="96" cy="129" r="1.2" fill="#e57373" /><circle cx="104" cy="131" r="1" fill="#e57373" />
        </g>
        <g v-if="quirk === 'eat'" class="crumbs">
          <circle cx="88" cy="150" r="1.4" /><circle cx="110" cy="152" r="1.2" /><circle cx="100" cy="156" r="1.3" />
        </g>

        <!-- 感應區（透明、疊在最上面）：後面的蓋過前面的，所以小的部位放在後面 -->
        <g class="hit">
          <path data-part="body" d="M66 150 C62 120 80 110 100 110 C120 110 138 120 134 150 C132 176 120 186 100 186 C80 186 68 176 66 150 Z" />
          <ellipse data-part="tail" cx="151" cy="143" rx="18" ry="30" transform="rotate(34 151 143)" />
          <ellipse data-part="head" cx="100" cy="60" rx="50" ry="26" />
          <path v-if="TALL_HATS.includes(head) || status === 'ASLEEP'" data-part="head" d="M56 58 L106 -6 L146 14 L140 58 Z" />
          <ellipse data-part="face" cx="100" cy="92" rx="38" ry="28" />
          <circle data-part="cheek" data-side="left" cx="68" cy="98" r="12" />
          <circle data-part="cheek" data-side="right" cx="132" cy="98" r="12" />
          <ellipse data-part="belly" cx="100" cy="154" rx="23" ry="22" />
          <ellipse data-part="hand" data-side="left" cx="66" cy="143" rx="12" ry="17" transform="rotate(28 66 143)" />
          <ellipse data-part="hand" data-side="right" cx="134" cy="143" rx="12" ry="17" transform="rotate(-28 134 143)" />
          <!-- 尾巴露出來的部分（身體右邊）：放在手的後面，點尾巴不會被手搶走 -->
          <path data-part="tail" d="M140 160 C160 158 176 140 170 122 C166 112 154 112 148 122 C146 132 144 140 140 146 Z" />
          <ellipse data-part="foot" data-side="left" cx="84" cy="188" rx="15" ry="9" />
          <ellipse data-part="foot" data-side="right" cx="116" cy="188" rx="15" ry="9" />
          <circle data-part="ear" data-side="left" cx="60" cy="44" r="19" />
          <circle data-part="ear" data-side="right" cx="140" cy="44" r="19" />
        </g>
      </g>
    </g>

    <!-- 睡著：Zzz -->
    <g v-if="status === 'ASLEEP'" class="zzz">
      <text x="146" y="46">z</text>
      <text x="158" y="32">z</text>
      <text x="172" y="16">Z</text>
    </g>
    <!-- 哼歌：音符 -->
    <g v-if="quirk === 'hum' || quirk === 'dance'" class="notes">
      <text x="150" y="56">♪</text>
      <text x="166" y="36">♫</text>
    </g>
    <!-- 噗：一小團雲 -->
    <g v-if="quirk === 'toot'" class="puff">
      <circle cx="46" cy="180" r="7" /><circle cx="36" cy="174" r="5" /><circle cx="30" cy="184" r="4" />
    </g>
    <!-- 搖尾巴／跳一下：小小的動線 -->
    <g v-if="quirk === 'hop'" class="motion">
      <path d="M70 196 q-6 -2 -10 0 M130 196 q6 -2 10 0" />
    </g>
    <!-- THINKING 泡泡 -->
    <g v-if="status === 'THINKING'" class="think-bubble">
      <circle cx="154" cy="40" r="5" />
      <circle cx="167" cy="28" r="4" />
      <circle cx="178" cy="17" r="3.2" />
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { moodColor } from '../moods.js';
import { eyeStyleFor, mouthFor, showsMoodFace } from '../avatarFaces.js';
import { useAvatarHit } from '../composables/useAvatarHit.js';
import { paletteStyle } from '../palettes.js';

// 同一頁可能有好幾隻（選角色畫面），漸層的 id 要各自不同，不然全部會吃到第一隻的顏色
const uid = `fb${Math.random().toString(36).slice(2, 8)}`;

const emit = defineEmits(['touch', 'hover']);
const { onClick, onPointerOver, onPointerOut, emitTouch } = useAvatarHit(emit);

// 春天小花冠的位置與顏色（沿著頭頂排一圈）
const SPRING_FLOWERS = [
  [66, 46, '#ffffff'],
  [80, 38, '#ffc1d9'],
  [96, 34, '#fff3a8'],
  [112, 35, '#ffc1d9'],
  [127, 40, '#ffffff'],
  [138, 48, '#cfe8ff']
];

const props = defineProps({
  status: { type: String, default: 'IDLE' },
  mood: { type: String, default: 'calm' },
  label: { type: String, default: 'PokkaTomo' },
  quirk: { type: String, default: null },
  // 衣櫥：實際穿在身上的東西 { head, neck, body, face }（web/src/outfits.js 的 resolveOutfit）
  outfit: { type: Object, default: null },
  // 舊的寫法（只有一個配件）：沒給 outfit 時用；圍巾算脖子，其他算頭
  accessory: { type: String, default: null },
  palette: { type: String, default: 'peach' }
});

const worn = computed(() => {
  if (props.outfit) return props.outfit;
  const a = props.accessory;
  return { head: a && a !== 'scarf' ? a : null, neck: a === 'scarf' ? 'scarf' : null, body: null, face: null };
});
const head = computed(() => worn.value.head || null);
const neck = computed(() => worn.value.neck || null);
const body = computed(() => worn.value.body || null);
const face = computed(() => worn.value.face || null);

// 比較高的帽子：頭的感應區往上加大，點帽子也算摸頭
const TALL_HATS = ['santa', 'witch', 'strawhat', 'beanie', 'crown'];

// 衣服的袖子顏色（long：長袖）
const SLEEVES = {
  tshirt: { fill: '#7fb8e8', line: '#5b93c4', long: false },
  sweater: { fill: '#f2a7a0', line: '#d07d76', long: true },
  yukata: { fill: '#445d93', line: '#33466f', long: true },
  raincoat: { fill: '#ffd54f', line: '#e0b030', long: true }
};
const sleeve = computed(() => SLEEVES[body.value] || null);

// 浴衣的點點花紋
const YUKATA_DOTS = [
  [74, 128], [128, 124], [70, 168], [86, 176], [118, 172], [132, 164], [80, 142], [124, 142]
];

const rootStyle = computed(() => ({
  '--mood-color': moodColorValue.value,
  '--fur-fill': `url(#${uid}-fur)`,
  '--cream-fill': `url(#${uid}-cream)`,
  ...paletteStyle(props.palette)
}));

const statusClass = computed(() => `status-${props.status.toLowerCase()}`);
const moodColorValue = computed(() => moodColor(props.mood));
const eyeStyle = computed(() => eyeStyleFor(props.status, props.quirk));
const showMoodFace = computed(() => showsMoodFace(props.status));
const mouthPath = computed(() => mouthFor(props.status, props.mood, props.quirk));
</script>

<style scoped>
.fb-avatar {
  /* 毛色來自角色設定（web/src/palettes.js → --pal-*），睡覺時下面的狀態 class 會蓋掉 --fur-* */
  --line: var(--pal-line, #9a6a45);
  --fur-top: var(--pal-top, #ffe0b2);
  --fur-bottom: var(--pal-bottom, #f6c28a);
  width: 100%;
  height: 100%;
  overflow: visible;
  /* 看得到的形狀都不接收滑鼠，只有 .hit 感應區接收（跟舊版角色一樣） */
  pointer-events: none;
  outline: none;
}
.fb-avatar:focus-visible {
  outline: 3px solid #ff7a59;
  outline-offset: 4px;
  border-radius: 24px;
}
.hit * {
  fill: transparent;
  pointer-events: all;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* 所有會動的群組都用「整張圖的座標」當 transform 基準，才不會因為瀏覽器算 bounding box 不同而歪掉 */
.fb-avatar g {
  transform-box: view-box;
}

/* ---- 顏色與線條（手繪感：同色系柔和描邊、圓角） ---- */
.fur-top { stop-color: var(--fur-top); transition: stop-color 0.8s ease; }
.fur-bottom { stop-color: var(--fur-bottom); transition: stop-color 0.8s ease; }
.fur {
  fill: var(--fur-fill);
  stroke: var(--line);
  stroke-width: 2.2;
  stroke-linejoin: round;
}
.cream { fill: var(--cream-fill); }
.muzzle { opacity: 0.95; }
.tail-tip { fill: #fff3e0; }
.outline { fill: none; stroke: var(--line); stroke-width: 2.2; }
/* 穿衣服時身體的外框再描一次（衣服蓋掉了身體邊緣的描邊） */
.clothes-outline { fill: none; stroke: var(--line); stroke-width: 2.2; stroke-linejoin: round; }
.fur-line { fill: none; stroke: var(--line); stroke-width: 1.4; stroke-linecap: round; opacity: 0.45; }
.ear-inner { fill: #ffb9a0; opacity: 0.85; }
.tuft { fill: none; stroke: var(--line); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.paw-line { stroke: var(--line); stroke-width: 1.4; stroke-linecap: round; opacity: 0.55; }
.cheek { fill: #ff9d80; opacity: 0.5; transition: opacity 0.2s, fill 0.2s; }
.nose { fill: var(--line); }
.pupil { fill: #3a2b22; }
.shine { fill: #ffffff; }
.lid,
.brows path,
.line-eyes path,
.line-eyes circle {
  fill: none;
  stroke: #3a2b22;
  stroke-width: 2.6;
  stroke-linecap: round;
}
.line-eyes circle { stroke-width: 2; }
.lid { stroke-width: 3; }
.shadow { fill: #7a5c3a; opacity: 0.14; transform-origin: 100px 194px; animation: shadow 3.2s ease-in-out infinite; }

.mouth { fill: none; stroke: #a5502f; stroke-width: 5; stroke-linecap: round; transform-origin: 100px 142px; }
.mouth-talking { animation: talk 0.32s ease-in-out infinite; fill: #a5502f; }

.mood-light {
  fill: var(--mood-color);
  stroke: #ffffff;
  stroke-width: 1.6;
  stroke-linejoin: round;
  transition: fill 0.6s ease;
  animation: mood-breathe 3s ease-in-out infinite;
}
.think-bubble circle { fill: #ffffffcc; }
.ear-glow .fur { stroke: #ffb25a; stroke-width: 3.5; }

/* ---- 待機：浮動、眨眼、尾巴輕輕晃 ---- */
.float-group { animation: float 3.2s ease-in-out infinite; }
.fb-avatar .eye { transform-origin: center; transform-box: fill-box; animation: blink 4.6s ease-in-out infinite; }
.tail { transform-origin: 132px 162px; animation: tail-sway 3.6s ease-in-out infinite; }
.head-group { transform-origin: 100px 118px; transition: transform 0.4s ease; }
.arm-left { transform-origin: 74px 130px; transition: transform 0.35s ease; }
.arm-right { transform-origin: 126px 130px; transition: transform 0.35s ease; }
.ear-left { transform-origin: 66px 58px; }
.ear-right { transform-origin: 134px 58px; }

/* ---- 狀態的身體語言 ---- */
.status-listening .head-group { transform: rotate(-5deg); }
.status-thinking .arm-right { transform: rotate(-70deg) translate(-6px, -4px); }
.status-thinking .head-group { transform: rotate(4deg); }
.status-thinking .float-group { animation-duration: 2s; }
.status-speaking .arm-left { animation: arm-talk-l 0.9s ease-in-out infinite; }
.status-speaking .arm-right { animation: arm-talk-r 0.9s ease-in-out infinite 0.45s; }
.status-speaking .mood-light { animation-duration: 0.9s; }
.status-happy .arm-left { transform: rotate(55deg); }
.status-happy .arm-right { transform: rotate(-55deg); }
.status-sleepy { --fur-top: #eadcf5; --fur-bottom: #d4c2ee; }
.status-sleepy .float-group { animation-duration: 5.5s; }
.status-sleepy .mood-light { opacity: 0.3; animation: none; }
.status-asleep { --fur-top: #e4d6f5; --fur-bottom: #cdb9ec; }
.status-asleep .float-group { animation-duration: 6s; }
.status-asleep .head-group { transform: rotate(6deg) translateY(3px); }
.status-asleep .tail { animation: none; transform: rotate(-14deg); }
.status-asleep .mood-light { opacity: 0.2; animation: none; }
.mood-sad .float-group { animation-duration: 4.5s; }
.mood-sad .head-group,
.mood-worried .head-group { transform: translateY(2px); }

/* ---- 小動作（一次性） ---- */
.quirk-group { transform-origin: 100px 190px; }
.quirk-sneeze .quirk-group { animation: q-sneeze 0.6s ease-out 1; }
.quirk-hiccup .quirk-group { animation: q-hiccup 0.5s ease-out 2; }
.quirk-yawn .quirk-group { animation: q-yawn 1.4s ease-in-out 1; }
.quirk-yawn .arm-left { transform: rotate(60deg); }
.quirk-yawn .arm-right { transform: rotate(-60deg); }
.quirk-hum .quirk-group { animation: q-sway 0.7s ease-in-out 2; }
.quirk-lookaround .head-group { animation: q-look 1.4s ease-in-out 1; }
.quirk-dizzy .quirk-group { animation: q-dizzy 0.45s linear 3; }
.quirk-toot .quirk-group { animation: q-hiccup 0.4s ease-out 1; }
.quirk-toot .cheek,
.quirk-blush .cheek { opacity: 1; fill: #ff7aa0; }
.quirk-blush .head-group { animation: q-shy 0.8s ease-in-out 1; }
.quirk-earwiggle .ear-left { animation: q-ear-l 0.25s ease-in-out 4; }
.quirk-earwiggle .ear-right { animation: q-ear-r 0.25s ease-in-out 4; }
.quirk-giggle .quirk-group { animation: q-giggle 0.18s ease-in-out 6; }
.quirk-giggle .arm-left { transform: rotate(-20deg); }
.quirk-giggle .arm-right { transform: rotate(20deg); }
.quirk-wave .arm-right { animation: q-wave 0.4s ease-in-out 3; }
.quirk-hop .quirk-group { animation: q-hop 0.7s cubic-bezier(0.3, 0, 0.4, 1) 1; }
.quirk-hop .shadow { animation: q-hop-shadow 0.7s ease 1; }
.quirk-tailwag .tail { animation: q-wag 0.22s ease-in-out 6; }
.motion path { fill: none; stroke: #b99470; stroke-width: 2; stroke-linecap: round; }

/* 吃東西：雙手往中間捧著飯糰，飯糰一下一下往嘴巴送，嘴巴嚼嚼 */
.quirk-eat .arm-left { transform: rotate(-50deg); }
.quirk-eat .arm-right { transform: rotate(50deg); }
.quirk-eat .mouth { animation: talk 0.3s ease-in-out infinite; }
.quirk-eat .head-group { animation: q-nibble 0.9s ease-in-out 4; }
.quirk-eat .arm-left,
.quirk-eat .arm-right { transition: none; }
.snack { transform-origin: 100px 140px; animation: q-bite 0.9s ease-in-out 4; }
.crumbs circle { fill: #e6dccb; animation: q-crumb 0.9s ease-in 4; }
/* 跳舞：左右手輪流舉高、身體左右扭＋小跳步、頭跟著歪 */
.quirk-dance .quirk-group { animation: q-dance 0.6s ease-in-out 6; }
.quirk-dance .arm-left { animation: q-dance-arm-l 0.6s ease-in-out 6; }
.quirk-dance .arm-right { animation: q-dance-arm-r 0.6s ease-in-out 6; }
.quirk-dance .head-group { animation: q-dance-head 0.6s ease-in-out 6; }
.quirk-dance .tail { animation: q-wag 0.3s ease-in-out 12; }
/* 睡帽的毛球跟著呼吸晃 */
.nightcap { transform-origin: 100px 56px; animation: q-sway 4s ease-in-out infinite; }

.zzz text,
.notes text {
  font-size: 16px;
  font-weight: 700;
  fill: #8a7bb8;
  animation: float-up 3s ease-in-out infinite;
}
.zzz text:nth-child(2) { animation-delay: 0.6s; font-size: 20px; }
.zzz text:nth-child(3) { animation-delay: 1.2s; font-size: 24px; }
.notes text { fill: #ff7a59; font-size: 20px; animation-duration: 1.4s; }
.notes text:nth-child(2) { animation-delay: 0.4s; }
.puff circle { fill: #e8dccb; animation: puff 1.4s ease-out forwards; transform-origin: 40px 180px; }

@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes shadow { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(0.88); } }
@keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes talk { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1.15); } }
@keyframes mood-breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes tail-sway { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(6deg); } }
@keyframes arm-talk-l { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(14deg); } }
@keyframes arm-talk-r { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-14deg); } }
@keyframes float-up { 0% { opacity: 0; transform: translateY(6px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
@keyframes puff { 0% { opacity: 0.9; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1.4); } }
@keyframes q-sneeze { 0% { transform: none; } 30% { transform: translateY(3px) scale(1.03, 0.95); } 55% { transform: translateY(-6px) rotate(-4deg); } 100% { transform: none; } }
@keyframes q-hiccup { 0%, 100% { transform: none; } 40% { transform: translateY(-8px); } }
@keyframes q-yawn { 0%, 100% { transform: none; } 50% { transform: scale(0.97, 1.05); } }
@keyframes q-sway { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(4deg); } }
@keyframes q-look { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-9deg); } 70% { transform: rotate(9deg); } }
@keyframes q-dizzy { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 75% { transform: rotate(7deg); } }
@keyframes q-shy { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-6deg) translateY(2px); } }
@keyframes q-ear-l { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-12deg); } }
@keyframes q-ear-r { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(12deg); } }
@keyframes q-giggle { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
@keyframes q-wave { 0%, 100% { transform: rotate(-110deg); } 50% { transform: rotate(-80deg); } }
@keyframes q-hop { 0%, 100% { transform: translateY(0) scale(1); } 15% { transform: translateY(2px) scale(1.04, 0.95); } 50% { transform: translateY(-18px) scale(0.98, 1.03); } 80% { transform: translateY(1px) scale(1.03, 0.97); } }
@keyframes q-hop-shadow { 0%, 100% { transform: scaleX(1); opacity: 0.14; } 50% { transform: scaleX(0.6); opacity: 0.07; } }
@keyframes q-bite { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-4px); } }
@keyframes q-nibble { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(6px) rotate(-2deg); } }
@keyframes q-crumb { 0%, 50% { opacity: 0; transform: translateY(-6px); } 70% { opacity: 1; } 100% { opacity: 0; transform: translateY(8px); } }
@keyframes q-dance { 0%, 100% { transform: rotate(0) translateY(0); } 25% { transform: rotate(-7deg) translateY(-6px); } 50% { transform: rotate(0) translateY(0); } 75% { transform: rotate(7deg) translateY(-6px); } }
@keyframes q-dance-arm-l { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(120deg); } 50% { transform: rotate(20deg); } }
@keyframes q-dance-arm-r { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-20deg); } 75% { transform: rotate(-120deg); } }
@keyframes q-dance-head { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(6deg); } 75% { transform: rotate(-6deg); } }
@keyframes q-wag { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(14deg); } }

@media (prefers-reduced-motion: reduce) {
  .quirk-group, .float-group, .tail, .shadow, .eye, .zzz text, .notes text, .snack, .crumbs circle, .nightcap,
  .quirk-dance .arm-left, .quirk-dance .arm-right, .quirk-dance .head-group, .quirk-eat .head-group,
  .status-speaking .arm-left, .status-speaking .arm-right {
    animation: none !important;
  }
}
</style>
