// routes/memory.js — 「{name}記得的事」彈窗用
//   GET /api/memory/search?q=關鍵字  → { conversations: [{ ts, role, content }] }
//     在目前角色的永久對話封存裡找有提到這個關鍵字的話（新到舊，最多 30 則）。
//     繁體／日文漢字互通（例如「貓」也找得到「猫」，同一套 normalizeText，見 lib/textIndex.js）。
// 記得的喜好、紀念日本身就在 GET /api/profile 裡，前端直接用；修改／刪除一樣走 POST /api/profile。
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { readArchive } from '../archiveService.js';
import { normalizeText } from '../lib/textIndex.js';

const router = Router();
const MAX_RESULTS = 30;
const SNIPPET = 90; // 關鍵字前後各留幾個字

function snippet(text, idx, qLen) {
  if (text.length <= SNIPPET * 2 + qLen) return text;
  const start = Math.max(0, idx - SNIPPET);
  const end = Math.min(text.length, idx + qLen + SNIPPET);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

router.get(
  '/memory/search',
  asyncHandler(async (req, res) => {
    const q = normalizeText(String(req.query.q || '').trim()).slice(0, 50);
    if (!q) return res.json({ conversations: [] });
    const records = await readArchive();
    const conversations = [];
    for (let i = records.length - 1; i >= 0 && conversations.length < MAX_RESULTS; i--) {
      const r = records[i];
      if (r.kind === 'fortune') continue;
      const idx = normalizeText(r.content).indexOf(q);
      if (idx === -1) continue;
      conversations.push({ ts: r.ts, role: r.role, content: snippet(r.content, idx, q.length) });
    }
    res.json({ conversations });
  })
);

export default router;
