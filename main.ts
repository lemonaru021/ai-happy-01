// ai-happy-01 entry: "The Berry"
// A procedural golden-hour illustration, drawn entirely by this program:
// two little birds share a berry on a blossoming branch at sunset.
// Node 22, standard library only. No network, no model calls, deterministic.
// Renders at 2x supersampling, downsamples to 512x512, writes a PNG.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 512;
const H = 512;
const SS = 2; // supersampling factor
const IW = W * SS;
const IH = H * SS;
const px = new Uint8Array(IW * IH * 3); // RGB working buffer, 1024x1024

// ---------- colour helpers ----------
function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function set(x, y, c) {
  if (x < 0 || y < 0 || x >= IW || y >= IH) return;
  const i = (y * IW + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function blend(x, y, c, a) {
  if (x < 0 || y < 0 || x >= IW || y >= IH) return;
  const i = (y * IW + x) * 3;
  px[i] = px[i] * (1 - a) + c[0] * a;
  px[i + 1] = px[i + 1] * (1 - a) + c[1] * a;
  px[i + 2] = px[i + 2] * (1 - a) + c[2] * a;
}

// ---------- raster primitives (coordinates in 512-space, scaled by SS) ----------
function disc(x, y, r, c) {
  const X = x * SS;
  const Y = y * SS;
  const R = r * SS;
  for (let yy = Math.floor(Y - R); yy <= Math.ceil(Y + R); yy++) {
    for (let xx = Math.floor(X - R); xx <= Math.ceil(X + R); xx++) {
      const dx = xx + 0.5 - X;
      const dy = yy + 0.5 - Y;
      if (dx * dx + dy * dy <= R * R) set(xx, yy, c);
    }
  }
}

function discA(x, y, r, c, a) {
  const X = x * SS;
  const Y = y * SS;
  const R = r * SS;
  for (let yy = Math.floor(Y - R); yy <= Math.ceil(Y + R); yy++) {
    for (let xx = Math.floor(X - R); xx <= Math.ceil(X + R); xx++) {
      const dx = xx + 0.5 - X;
      const dy = yy + 0.5 - Y;
      if (dx * dx + dy * dy <= R * R) blend(xx, yy, c, a);
    }
  }
}

function ellipse(cx, cy, rx, ry, c, rot) {
  const X = cx * SS;
  const Y = cy * SS;
  const RX = rx * SS;
  const RY = ry * SS;
  const co = Math.cos(rot || 0);
  const si = Math.sin(rot || 0);
  const R = Math.max(RX, RY);
  for (let yy = Math.floor(Y - R); yy <= Math.ceil(Y + R); yy++) {
    for (let xx = Math.floor(X - R); xx <= Math.ceil(X + R); xx++) {
      const dx = xx + 0.5 - X;
      const dy = yy + 0.5 - Y;
      const u = (dx * co + dy * si) / RX;
      const v = (-dx * si + dy * co) / RY;
      if (u * u + v * v <= 1) set(xx, yy, c);
    }
  }
}

function poly(pts, c) {
  const P = pts.map((p) => [p[0] * SS, p[1] * SS]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of P) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
        const t = (y + 0.5 - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + (b[0] - a[0]) * t);
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) set(x, y, c);
    }
  }
}

function line(x1, y1, x2, y2, w, c) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len * SS);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x1 + dx * t, y1 + dy * t, w / 2, c);
  }
}

function arc(cx, cy, r, a0, a1, w, c) {
  const steps = Math.max(8, Math.ceil((a1 - a0) * r * SS));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w / 2, c);
  }
}

function glow(cx, cy, r, c, peak) {
  const X = cx * SS;
  const Y = cy * SS;
  const R = r * SS;
  for (let yy = Math.floor(Y - R); yy <= Math.ceil(Y + R); yy++) {
    for (let xx = Math.floor(X - R); xx <= Math.ceil(X + R); xx++) {
      const dx = xx + 0.5 - X;
      const dy = yy + 0.5 - Y;
      const d = Math.sqrt(dx * dx + dy * dy) / R;
      if (d < 1) blend(xx, yy, c, peak * (1 - d) * (1 - d));
    }
  }
}

function heart(cx, cy, s, c) {
  disc(cx - s * 0.32, cy - s * 0.22, s * 0.36, c);
  disc(cx + s * 0.32, cy - s * 0.22, s * 0.36, c);
  poly(
    [
      [cx - s * 0.62, cy - s * 0.02],
      [cx + s * 0.62, cy - s * 0.02],
      [cx, cy + s * 0.78],
    ],
    c,
  );
}

function flower(x, y, r, petal, center) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    disc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, petal);
  }
  disc(x, y, r * 0.42, center);
}

// ---------- PNG encoder (8-bit RGB, no interlace) ----------
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
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- scene pieces ----------
const DARK = rgb('#26221F');
const ORANGE = rgb('#FF8C42');

function bird(cx, cy, r, body, belly, wing, beak, dir, happy) {
  // tail feathers, fanned behind
  line(cx - dir * r * 0.8, cy + r * 0.3, cx - dir * r * 1.3, cy + r * 0.7, r * 0.16, wing);
  line(cx - dir * r * 0.75, cy + r * 0.45, cx - dir * r * 1.2, cy + r * 0.92, r * 0.16, wing);
  // round body
  disc(cx, cy, r, body);
  // pale belly
  ellipse(cx + dir * r * 0.15, cy + r * 0.35, r * 0.6, r * 0.48, belly, 0);
  // folded wing
  ellipse(cx - dir * r * 0.08, cy + r * 0.02, r * 0.48, r * 0.32, wing, -dir * 0.35);
  // little feet gripping the branch
  line(cx - r * 0.28, cy + r * 0.92, cx - r * 0.28, cy + r * 1.12, r * 0.09, ORANGE);
  line(cx + r * 0.28, cy + r * 0.92, cx + r * 0.28, cy + r * 1.12, r * 0.09, ORANGE);
  // eye: a happy closed curve, or an open dot with a highlight
  if (happy) {
    arc(cx + dir * r * 0.42, cy - r * 0.28, r * 0.16, Math.PI * 1.15, Math.PI * 1.85, r * 0.09, DARK);
  } else {
    disc(cx + dir * r * 0.42, cy - r * 0.3, r * 0.11, DARK);
    disc(cx + dir * r * 0.47, cy - r * 0.34, r * 0.04, rgb('#FFFFFF'));
  }
  // blush
  discA(cx + dir * r * 0.52, cy + r * 0.08, r * 0.15, rgb('#FF9EBB'), 0.6);
  // beak
  poly(
    [
      [cx + dir * r * 0.8, cy - r * 0.18],
      [cx + dir * r * 0.8, cy + r * 0.08],
      [cx + dir * r * 1.18, cy - r * 0.05],
    ],
    beak,
  );
}

function sky() {
  const stops = [
    [0, rgb('#FF9E64')],
    [0.45, rgb('#FFC184')],
    [0.75, rgb('#FFE0B0')],
    [1, rgb('#FFF3D6')],
  ];
  for (let y = 0; y < IH; y++) {
    const t = y / IH;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const f = (t - a[0]) / (b[0] - a[0] || 1);
    const c = mix(a[1], b[1], f);
    for (let x = 0; x < IW; x++) set(x, y, c);
  }
}

// The branch runs from bottom-left to mid-right; birds stand on it.
function branchY(x) {
  return 400 - (x - 20) * (85 / 470);
}

function drawScene() {
  sky();
  // low sun with a warm glow, upper right
  glow(405, 95, 165, rgb('#FFE9A8'), 0.55);
  disc(405, 95, 48, rgb('#FFF3C4'));
  disc(405, 95, 34, rgb('#FFE9A8'));
  // soft distant hills along the bottom
  ellipse(110, 525, 340, 110, rgb('#E9B78C'), 0);
  ellipse(420, 545, 320, 100, rgb('#D89A6A'), 0);
  // branch, with a small twig
  line(20, 400, 490, 315, 13, rgb('#7A4A32'));
  line(20, 400, 490, 315, 7, rgb('#9C6644'));
  line(300, 360, 350, 318, 6, rgb('#7A4A32'));
  // leaves on the branch
  ellipse(140, 388, 22, 9, rgb('#7FB069'), -0.5);
  ellipse(385, 338, 22, 9, rgb('#8FBC74'), 0.45);
  ellipse(455, 322, 18, 8, rgb('#7FB069'), -0.3);
  // blossom clusters along the branch
  flower(82, 388, 13, rgb('#FFB7C9'), rgb('#FFE66D'));
  flower(262, 366, 11, rgb('#FF9EBB'), rgb('#FFE66D'));
  flower(438, 330, 12, rgb('#FFC2D4'), rgb('#FFE66D'));
  flower(335, 330, 9, rgb('#FFB7C9'), rgb('#FFE66D'));
  // the two birds, feet on the branch, facing each other
  const ax = 185;
  const ay = branchY(ax) - 52 * 1.02;
  const bx = 330;
  const by = branchY(bx) - 48 * 1.02;
  bird(ax, ay, 52, rgb('#4ECDC4'), rgb('#C8F5EF'), rgb('#2FA8A0'), rgb('#FF9F43'), 1, false);
  bird(bx, by, 48, rgb('#FF9F43'), rgb('#FFD6A5'), rgb('#E87E1B'), rgb('#E85D3D'), -1, true);
  // the berry the teal bird offers, held right at its beak tip: red,
  // glossy, on a little stem with a leaf
  const berryX = ax + 52 * 1.18 + 14;
  const berryY = ay - 2;
  line(berryX - 2, berryY - 8, berryX + 6, berryY - 20, 3, rgb('#7A4A32'));
  ellipse(berryX + 8, berryY - 16, 7, 3.5, rgb('#7FB069'), -0.6);
  disc(berryX, berryY, 12, rgb('#E63946'));
  disc(berryX - 4, berryY - 4, 4, rgb('#FF8FA3'));
  // three little hearts floating between them
  heart(258, 222, 14, rgb('#FF6B81'));
  heart(292, 192, 10, rgb('#FF8FA3'));
  heart(224, 188, 8, rgb('#FF6B81'));
  // petals drifting in the warm air
  ellipse(120, 150, 10, 5, rgb('#FFC2D4'), 0.6);
  ellipse(420, 185, 9, 4.5, rgb('#FFD6E0'), -0.5);
  ellipse(90, 245, 8, 4, rgb('#FFB7C9'), 0.9);
  ellipse(462, 262, 9, 4.5, rgb('#FFC2D4'), 0.3);
  ellipse(300, 118, 8, 4, rgb('#FFD6E0'), -0.8);
  ellipse(60, 120, 7, 3.5, rgb('#FFD6E0'), 0.4);
}

// ---------- main ----------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
drawScene();

// downsample 2x -> 512x512 (box average)
const out = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * IW + (x * SS + dx)) * 3;
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
      }
    }
    const j = (y * W + x) * 3;
    const n = SS * SS;
    out[j] = r / n;
    out[j + 1] = g / n;
    out[j + 2] = b / n;
  }
}

writeFileSync(join(outDir, 'entry.png'), encodePNG(W, H, Buffer.from(out)));
