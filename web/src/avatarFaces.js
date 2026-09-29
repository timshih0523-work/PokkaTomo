// avatarFaces.js
// 兩隻角色（SvgAvatar 舊版圓圓、FullBodyAvatar 全身）共用的「表情規則」：
// 什麼狀態／情緒／小動作要配什麼眼睛、什麼嘴型。嘴型路徑是以 (100, 142) 為中心畫的，
// 全身角色的臉比較小，會用 transform 縮放、搬到自己的嘴巴位置。

export const QUIRK_MOUTHS = {
  blush: 'M88 140 Q100 148 112 140',
  earwiggle: 'M86 140 Q100 150 114 140',
  giggle: 'M80 136 Q100 158 120 136 Q100 150 80 136 Z',
  wave: 'M80 136 Q100 158 120 136 Q100 150 80 136 Z',
  hop: 'M94 138 Q100 132 106 138 Q106 150 100 150 Q94 150 94 138 Z',
  tailwag: 'M86 140 Q100 150 114 140',
  yawn: 'M92 136 Q100 128 108 136 Q111 156 100 156 Q89 156 92 136 Z',
  sneeze: 'M92 142 Q100 137 108 142',
  hiccup: 'M96 140 Q100 136 104 140 Q104 146 100 146 Q96 146 96 140 Z',
  hum: 'M88 140 Q100 150 112 140',
  lookaround: 'M88 140 Q100 146 112 140',
  dizzy: 'M86 142 Q93 137 100 142 Q107 147 114 142',
  toot: 'M88 142 Q94 138 100 142 Q106 146 112 142'
};

export const MOOD_MOUTHS = {
  sad: 'M86 146 Q100 136 114 146',
  worried: 'M84 142 Q92 138 100 142 Q108 146 116 142',
  surprised: 'M94 138 Q100 132 106 138 Q106 150 100 150 Q94 150 94 138 Z'
};

const STATUS_MOUTHS = {
  HAPPY: 'M78 138 Q100 158 122 138 Q100 150 78 138 Z',
  SLEEPY: 'M88 140 Q100 144 112 140',
  LISTENING: 'M84 138 Q100 146 116 138',
  THINKING: 'M86 140 Q100 138 114 140',
  SPEAKING: 'M82 136 Q100 152 118 136 Q100 146 82 136 Z',
  ASLEEP: 'M92 142 Q100 146 108 142'
};
const DEFAULT_MOUTH = 'M84 138 Q100 148 116 138';

/** 聽／想／睡的時候以「正在做的事」為主，不套情緒表情；其他時候（平常、開心、講話）才用情緒臉。 */
export function showsMoodFace(status) {
  return ['IDLE', 'HAPPY', 'SPEAKING'].includes(status);
}

/** 眼睛：睡著、打呵欠、打噴嚏時閉起來；頭暈時變成轉圈圈眼。 */
export function eyeStyleFor(status, quirk) {
  if (quirk === 'dizzy') return 'dizzy';
  if (status === 'ASLEEP' || quirk === 'yawn' || quirk === 'sneeze') return 'closed';
  return 'open';
}

/** 嘴型：小動作 > 睡著 > 情緒 > 狀態。SPEAKING 的開合由 CSS 動畫做。 */
export function mouthFor(status, mood, quirk) {
  if (quirk && QUIRK_MOUTHS[quirk]) return QUIRK_MOUTHS[quirk];
  if (status === 'ASLEEP') return STATUS_MOUTHS.ASLEEP;
  if (status !== 'SPEAKING' && showsMoodFace(status) && MOOD_MOUTHS[mood]) return MOOD_MOUTHS[mood];
  return STATUS_MOUTHS[status] || DEFAULT_MOUTH;
}
