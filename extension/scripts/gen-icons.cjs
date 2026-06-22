// Rasterize assets/logo.svg design into extension PNG icons (no external deps).
// Run: node extension/scripts/gen-icons.cjs  (or: npm run icons)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function inRoundedRect(x, y, size, radius) {
  const cx = Math.min(x, size - 1 - x);
  const cy = Math.min(y, size - 1 - y);
  if (cx >= radius || cy >= radius) return true;
  const dx = radius - cx;
  const dy = radius - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
  const cx = x < x0 + r ? x0 + r - x : x > x0 + w - r ? x - (x0 + w - r) : 0;
  const cy = y < y0 + r ? y0 + r - y : y > y0 + h - r ? y - (y0 + h - r) : 0;
  return cx * cx + cy * cy <= r * r;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 128;
  const corner = 28 * s;
  const blue = [29, 155, 240, 255];
  const white = [255, 255, 255, 255];

  const bars = [
    { x: 22, y: 34, w: 54, h: 13, a: 0.95 },
    { x: 22, y: 52, w: 46, h: 13, a: 0.82 },
    { x: 22, y: 70, w: 38, h: 13, a: 0.68 },
  ];

  const arrowY = 58.5 * s;
  const arrowX0 = 74 * s;
  const arrowX1 = 104 * s;
  const chevronTip = 106 * s;
  const chevronBack = 90 * s;
  const chevronTop = 44.5 * s;
  const chevronBot = 72.5 * s;
  const stroke = Math.max(1.5, 3.5 * s);

  const set = (x, y, col) => {
    const i = (y * size + x) * 4;
    const a = col[3] / 255;
    if (a >= 1) {
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = 255;
      return;
    }
    const oa = px[i + 3] / 255;
    const outA = a + oa * (1 - a);
    if (outA <= 0) return;
    px[i] = Math.round((col[0] * a + px[i] * oa * (1 - a)) / outA);
    px[i + 1] = Math.round((col[1] * a + px[i + 1] * oa * (1 - a)) / outA);
    px[i + 2] = Math.round((col[2] * a + px[i + 2] * oa * (1 - a)) / outA);
    px[i + 3] = Math.round(outA * 255);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRoundedRect(x, y, size, corner)) continue;
      set(x, y, blue);

      for (const bar of bars) {
        const bx = bar.x * s;
        const by = bar.y * s;
        const bw = bar.w * s;
        const bh = bar.h * s;
        const br = 3.5 * s;
        if (inRoundRect(x + 0.5, y + 0.5, bx, by, bw, bh, br)) {
          set(x, y, [white[0], white[1], white[2], Math.round(bar.a * 255)]);
        }
      }

      if (distToSegment(x + 0.5, y + 0.5, arrowX0, arrowY, arrowX1, arrowY) <= stroke) {
        set(x, y, white);
      }
      if (distToSegment(x + 0.5, y + 0.5, chevronBack, chevronTop, chevronTip, arrowY) <= stroke) {
        set(x, y, white);
      }
      if (distToSegment(x + 0.5, y + 0.5, chevronBack, chevronBot, chevronTip, arrowY) <= stroke) {
        set(x, y, white);
      }
    }
  }
  return px;
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, encodePNG(size, draw(size)));
  console.log(`wrote ${path.relative(path.join(__dirname, "..", ".."), file)}`);
}
