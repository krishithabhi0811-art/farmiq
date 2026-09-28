/**
 * scripts/lib/test-image.js
 * Builds a tiny, valid PNG in pure Node (no image libraries) so the test suite
 * can exercise photo upload → storage → AI analysis without shipping any
 * copyrighted photo in the repo.
 *
 * It draws a rough "field": green background, rows of crop, a few brown spots.
 */
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
};

/** @returns {Buffer} PNG bytes of a 96x96 "field" image */
export function makeTestPng(size = 96) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 8) % 2 === 0;
      let r = 60, g = row ? 150 : 120, b = 45;             // crop rows / soil
      if ((x + y) % 37 === 0) { r = 120; g = 85; b = 40; }  // brown spot
      if (y < 12) { r = 150; g = 195; b = 235; }            // sky
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

/** @returns {string} data URL ready to POST */
export const makeTestImageDataUrl = (size = 96) =>
  `data:image/png;base64,${makeTestPng(size).toString('base64')}`;
