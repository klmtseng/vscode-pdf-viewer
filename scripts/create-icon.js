// Generates media/icon.png — a 128x128 PDF document icon
// Uses only Node.js built-ins (zlib). No extra dependencies needed.
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 128, H = 128;
const px = new Uint8Array(W * H * 4);

// ── Helpers ──────────────────────────────────────────────────────────────────

function set(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = a;
}

function rect(x, y, w, h, r, g, b, a = 255) {
    for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
            set(x + dx, y + dy, r, g, b, a);
}

// ── Draw ─────────────────────────────────────────────────────────────────────

// Background: VS Code dark
rect(0, 0, W, H, 0x1E, 0x1E, 0x1E);

// Drop shadow
rect(49, 22, 58, 88, 0x0A, 0x0A, 0x0A, 120);

// Document body (white)
const DX = 44, DY = 17, DW = 58, DH = 90;
rect(DX, DY, DW, DH, 0xFF, 0xFF, 0xFF);

// Folded corner — top-right triangle
const FC = 16;
for (let i = 0; i < FC; i++) {
    // shadow side of fold
    rect(DX + DW - FC + i, DY + i, FC - i, 1, 0xC0, 0xC0, 0xC0);
    // underside visible
    rect(DX + DW - FC, DY + i, i, 1, 0xE8, 0xE8, 0xE8);
}

// Red header bar (stops before folded corner)
rect(DX, DY, DW - FC, 22, 0xC6, 0x28, 0x28);

// Pixel-art "PDF" in white — 5×7 glyphs, 1 px gap between letters
// Origin: top-left of first glyph
const GX = DX + 6, GY = DY + 8, S = 2; // S = pixel size (2×2 blocks for clarity)

// Each glyph: array of (col, row) "on" pixels in a 5×7 grid
const glyphs = {
    P: [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6], [1,0],[2,0],[3,0], [3,1],[3,2], [1,3],[2,3]],
    D: [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6], [1,0],[2,0], [3,1],[3,2],[3,3],[3,4],[3,5], [1,6],[2,6]],
    F: [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6], [1,0],[2,0],[3,0], [1,3],[2,3]],
};

function drawGlyph(ox, oy, glyph) {
    for (const [col, row] of glyph) {
        rect(ox + col * S, oy + row * S, S, S, 0xFF, 0xFF, 0xFF);
    }
}

drawGlyph(GX,           GY, glyphs.P);
drawGlyph(GX + 5*S + 2, GY, glyphs.D);
drawGlyph(GX + 10*S+ 4, GY, glyphs.F);

// Content lines (simulated text in body)
const lineColors = [[0xCC,0xCC,0xCC], [0xCC,0xCC,0xCC], [0xCC,0xCC,0xCC],
                    [0xCC,0xCC,0xCC], [0xDD,0xAA,0xAA]]; // last line: accent
const lineWidths = [0.78, 0.68, 0.80, 0.72, 0.42];
for (let i = 0; i < 5; i++) {
    const lw = Math.round((DW - 14) * lineWidths[i]);
    const ly = DY + 30 + i * 11;
    const [r, g, b] = lineColors[i];
    rect(DX + 7, ly, lw, 4, r, g, b);
}

// Border
for (let x = DX; x < DX + DW; x++) { set(x, DY, 0xAA,0xAA,0xAA); set(x, DY+DH-1, 0xAA,0xAA,0xAA); }
for (let y = DY; y < DY + DH; y++) { set(DX, y, 0xAA,0xAA,0xAA); set(DX+DW-1, y, 0xAA,0xAA,0xAA); }

// ── PNG encoder ───────────────────────────────────────────────────────────────

const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, c]);
}

// Scanlines: filter byte 0x00 (None) + row RGBA
const rows = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
    rows[y * (1 + W * 4)] = 0;
    Buffer.from(px).copy(rows, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'media', 'icon.png');
fs.writeFileSync(out, png);
console.log('Icon created:', out);
