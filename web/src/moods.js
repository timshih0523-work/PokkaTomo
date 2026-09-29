// moods.js
// 前端的情緒清單跟顏色，SvgAvatar 的心情燈、DiaryPanel 的心情圓點共用這一份。
// 情緒種類要跟後端 server/lib/mood.js 的 MOODS 一致（後端決定模型可以回哪幾種）。
export const MOOD_COLORS = {
  joy: '#ffc93c',
  love: '#ff7eb6',
  calm: '#7fdcc0',
  sad: '#6fa8ff',
  worried: '#b18cff',
  surprised: '#4fd8ff'
};
export const MOODS = Object.keys(MOOD_COLORS);
export const DEFAULT_MOOD = 'calm';
export const moodColor = (m) => MOOD_COLORS[m] || MOOD_COLORS[DEFAULT_MOOD];
