// routes/characters.js — 角色清單（進入畫面後選要跟誰聊、新增角色）
//   GET  /api/characters  { characters: [{ id, name, avatarStyle, palette, firstMetAt, level }] }
//   POST /api/characters  { name?, personaPrompt?, avatarStyle?, palette? } → { character }
//   DELETE /api/characters/:id  { pin } → { ok, movedTo }  刪除角色（要再輸入一次密碼；資料搬到 backups/deleted-characters/）
// 改某個角色的名字／個性／外觀：帶著 X-PokkaTomo-Character 標頭打 POST /api/profile（跟以前一樣）。
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { BadRequestError } from '../lib/errors.js';
import { listCharacters, createCharacter } from '../characterService.js';
import { getState, levelInfo } from '../companionService.js';
import { withCharacter } from '../lib/characterContext.js';
import { saveProfile, freshProfile } from '../profileService.js';
import { verifyPin } from '../lockService.js';
import { deleteCharacter } from '../dataAdminService.js';

const router = Router();

router.get(
  '/characters',
  asyncHandler(async (_req, res) => {
    const list = await listCharacters();
    const characters = await Promise.all(
      list.map((c) =>
        withCharacter(c.id, async () => ({
          id: c.id,
          name: c.name,
          avatarStyle: c.avatarStyle,
          palette: c.palette,
          firstMetAt: c.firstMetAt,
          level: levelInfo((await getState()).points).level
        }))
      )
    );
    res.json({ characters });
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
