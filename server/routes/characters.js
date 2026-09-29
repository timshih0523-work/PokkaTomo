// routes/characters.js — 角色清單（進入畫面後選要跟誰聊、新增角色）
//   GET  /api/characters  { characters: [{ id, name, avatarStyle, palette, firstMetAt, level }] }
//   POST /api/characters  { name?, personaPrompt?, avatarStyle?, palette? } → { character }
//   DELETE /api/characters/:id  { pin } → { ok, id, name }  刪除角色（要再輸入一次密碼；資料整個刪掉，無法復原）
//   PUT    /api/characters/order { ids } → { characters }  調整角色順序（選角色畫面拖曳）
// 改某個角色的名字／個性／外觀：帶著 X-PokkaTomo-Character 標頭打 POST /api/profile（跟以前一樣）。
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { BadRequestError } from '../lib/errors.js';
import { listCharacters, createCharacter, reorderCharacters } from '../characterService.js';
import { getState, levelInfo } from '../companionService.js';
import { withCharacter } from '../lib/characterContext.js';
import { saveProfile, freshProfile } from '../profileService.js';
import { verifyPin } from '../lockService.js';
import { deleteCharacter } from '../dataAdminService.js';

const router = Router();

// 選角色畫面要的欄位（含親密度等級）
function summaries(list) {
  return Promise.all(
    list.map((c) =>
      withCharacter(c.id, async () => ({
        id: c.id,
        name: c.name,
        avatarStyle: c.avatarStyle,
        palette: c.palette,
        outfit: c.outfit,
        firstMetAt: c.firstMetAt,
        level: levelInfo((await getState()).points).level
      }))
    )
  );
}

router.get(
  '/characters',
  asyncHandler(async (_req, res) => {
    res.json({ characters: await summaries(await listCharacters()) });
  })
);

router.put(
  '/characters/order',
  asyncHandler(async (req, res) => {
    if (!Array.isArray(req.body?.ids)) throw new BadRequestError('ids 要是陣列');
    res.json({ characters: await summaries(await reorderCharacters(req.body.ids.slice(0, 100))) });
  })
);

router.post(
  '/characters',
  asyncHandler(async (req, res) => {
    try {
      const character = await createCharacter(req.body || {});
      // 新角色一律從「預設值」開始，不從別的角色複製任何東西（我們不知道使用者想怎麼設定這隻）：
      //   稱呼＝主人（日文：ご主人さま）、個性＝預設個性（characterService）、
      //   喜好／紀念日／城市全部空白。語言只用新增表單上使用者自己選的那個。
      const language = req.body?.language === 'ja' ? 'ja' : 'zh';
      await withCharacter(character.id, () => saveProfile({ ...freshProfile(language) }));
      res.json({ character });
    } catch (err) {
      if (err.code === 'too_many') throw new BadRequestError(err.message);
      throw err;
    }
  })
);

router.delete(
  '/characters/:id',
  asyncHandler(async (req, res) => {
    await verifyPin(req.body?.pin);
    const result = await deleteCharacter(req.params.id);
    res.json({ ok: true, ...result });
  })
);

export default router;
