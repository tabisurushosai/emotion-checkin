import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = pixels[y * size + x];
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = px[0];
      raw[off + 1] = px[1];
      raw[off + 2] = px[2];
      raw[off + 3] = px[3];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function drawSmiley(size) {
  const pixels = new Array(size * size).fill(null).map(() => [0, 0, 0, 0]);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size / 2 - Math.max(1, size * 0.04);
  const r2 = r * r;
  const faceColor = [255, 204, 64, 255];
  const darkColor = [60, 40, 0, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        pixels[y * size + x] = [...faceColor];
      }
    }
  }

  const eyeR = Math.max(1, size * 0.07);
  const eyeOffsetX = size * 0.22;
  const eyeOffsetY = size * 0.18;
  const eyes = [
    [cx - eyeOffsetX, cy - eyeOffsetY],
    [cx + eyeOffsetX, cy - eyeOffsetY],
  ];
  for (const [ex, ey] of eyes) {
    const er2 = eyeR * eyeR;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - ex;
        const dy = y - ey;
        if (dx * dx + dy * dy <= er2) {
          pixels[y * size + x] = [...darkColor];
        }
      }
    }
  }

  const mouthR = size * 0.28;
  const mouthThickness = Math.max(1, size * 0.06);
  const mouthCx = cx;
  const mouthCy = cy - size * 0.02;
  const mr2outer = (mouthR + mouthThickness / 2) ** 2;
  const mr2inner = (mouthR - mouthThickness / 2) ** 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - mouthCx;
      const dy = y - mouthCy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= mr2outer && d2 >= mr2inner && dy > 0) {
        pixels[y * size + x] = [...darkColor];
      }
    }
  }

  return pixels;
}

for (const size of [16, 48, 128]) {
  const png = encodePNG(size, drawSmiley(size));
  const path = resolve(OUT_DIR, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
