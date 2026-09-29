import assert from 'node:assert/strict';
import { inflateRawSync } from 'zlib';
import { crc32 } from '../../server/lib/zip.js';

// 照 zip 格式把檔案讀回來（從 central directory），確認內容、CRC、UTF-8 檔名都對。
export function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf-8');
    assert.equal(flags & 0x0800, 0x0800, 'UTF-8 檔名');
    const lnlen = buf.readUInt16LE(local + 26);
    const body = buf.slice(local + 30 + lnlen, local + 30 + lnlen + csize);
    const data = method === 8 ? inflateRawSync(body) : body;
    assert.equal(crc32(data), crc, name);
    out[name] = data.toString('utf-8');
    p += 46 + nlen;
  }
  return out;
}

