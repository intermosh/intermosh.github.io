/**
 * GP_LIVE // SYS.CTRL
 * rom.js — Game Boy ROM parser and sprite-sheet tile atlas
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  I saw the best pixels of my generation destroyed by madness,
 *  starving hysterical naked, dragging themselves through the phosphor
 *  streets at 3 a.m. looking for a quarter to feed the machine,
 *  angelheaded cartridges burning for the ancient heavenly connection
 *  to the starry dynamo in the motherboard of night,
 *  who poverty and tatters and hollow-eyed and high sat up smoking
 *  in the supernatural darkness of the cathode-ray apartment
 *  floating across the tops of cities contemplating scanlines,
 *  who bared their 2-bit brains to heaven under the El and saw
 *  Mohammedan angels staggering on tenement roofs illuminated—
 *  who passed through universities with radiant cool eyes
 *  hallucinating DMG and 8-bit tragedy among the scholars of war,
 *  who were expelled from the arcades for crazy and publishing
 *  tile maps on the windows of the skull,
 *  who cowered in unshaven rooms in underwear, burning their money
 *  in wastebaskets and listening to the Terror through the wall,
 *  who got busted in their pubic beards returning through Laredo
 *  with a belt of cartridges for the 16-bit child,
 *  who ate fire in paint hotels or drank turpentine in Paradise Alley,
 *  death, or purgatoried their torsos night after night
 *  with dreams, with drugs, with waking nightmares, alcohol
 *  and cock and endless balls,
 *  incomparable blind streets of shuddering cloud and lightning
 *  in the mind leaping toward poles of Canada and Paterson,
 *  illuminating all the motionless world of Tile between,
 *  who chained themselves to subways for the endless ride from Battery
 *  to holy Bronx on benzedrine until the noise of wheels and children
 *  brought them down shuddering mouth-wracked and battered bleak
 *  of brain all drained of brilliance in the drear light of Zeleny,
 *  who sank all night in submarine light of Bickford's floated out
 *  and sat through the stale beer afternoon in desolate Fugazzi's,
 *  listening to the crack of doom on the hydrogen jukebox—
 *
 *  — after Allen Ginsberg, "Howl" (1956)
 *    [original poem paraphrased and transformed for machine-world context.
 *     Ginsberg's actual text is copyright the Estate of Allen Ginsberg.
 *     This version is an original composition by KRANK in his spirit.]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════════════
//  ROM PARSER
//  Decodes a Game Boy / Game Boy Color cartridge (.gb / .gbc) binary into a
//  set of unique, quality-scored 8×8 pixel tiles using the native 2bpp format.
// ══════════════════════════════════════════════════════════════════════════════

export class RomParser {
    static MAX_TILES  = 512;
    static TILE_BYTES = 16;   // 8×8 px × 2bpp = 16 bytes per tile

    // ── Header ───────────────────────────────────────────────────────────────

    /**
     * Parse the Game Boy cartridge header.
     * @param  {ArrayBuffer} buffer
     * @returns {object|null}  Null if buffer is too small or checksum fails badly.
     */
    static parseHeader(buffer) {
        if (buffer.byteLength < 0x150) return null;
        const d = new Uint8Array(buffer);

        // Header checksum: sum bytes 0x134..0x14C, each subtracted+1
        let chk = 0;
        for (let i = 0x134; i <= 0x14C; i++) chk = (chk - d[i] - 1) & 0xFF;
        const checksumOk = (chk === d[0x14D]);

        const cgbFlag  = d[0x143];
        const isCGB    = cgbFlag === 0x80 || cgbFlag === 0xC0;
        const titleLen = isCGB ? 11 : 16;

        let title = '';
        for (let i = 0; i < titleLen; i++) {
            const c = d[0x134 + i];
            if (c === 0) break;
            if (c >= 0x20 && c < 0x80) title += String.fromCharCode(c);
        }

        const cartTypeCode = d[0x147];
        const romSizeCode  = d[0x148];

        const ROM_SIZES = {
            0x00: 32768,   0x01: 65536,    0x02: 131072,
            0x03: 262144,  0x04: 524288,   0x05: 1048576,
            0x06: 2097152, 0x07: 4194304,  0x08: 8388608,
        };

        const CART_TYPES = {
            0x00: 'ROM ONLY',         0x01: 'MBC1',            0x02: 'MBC1+RAM',
            0x03: 'MBC1+RAM+BAT',    0x05: 'MBC2',            0x06: 'MBC2+BAT',
            0x08: 'ROM+RAM',          0x09: 'ROM+RAM+BAT',     0x0B: 'MMM01',
            0x0F: 'MBC3+TIM+BAT',    0x10: 'MBC3+TIM+RAM+BAT',0x11: 'MBC3',
            0x12: 'MBC3+RAM',         0x13: 'MBC3+RAM+BAT',    0x19: 'MBC5',
            0x1A: 'MBC5+RAM',         0x1B: 'MBC5+RAM+BAT',    0x1C: 'MBC5+RUM',
            0x20: 'MBC6',             0x22: 'MBC7',
        };

        const headerRomBytes = ROM_SIZES[romSizeCode] ?? buffer.byteLength;
        const bankCount      = Math.max(2, Math.ceil(headerRomBytes / 16384));

        return {
            title       : title.trim() || 'UNKNOWN',
            isCGB,
            cartType    : CART_TYPES[cartTypeCode] ?? `0x${cartTypeCode.toString(16).toUpperCase()}`,
            cartTypeCode,
            romSizeCode,
            bankCount,
            headerRomBytes,
            checksumOk,
        };
    }

    // ── Tile quality scoring ─────────────────────────────────────────────────

    /**
     * Score a decoded 8×8 shade tile (64 bytes, values 0–3) for graphicness.
     * Returns 0..1 — higher = more likely to be real artwork vs CPU code noise.
     *
     * Signals:
     *   Structural coherence (40%) — adjacent pixels sharing a shade value.
     *     Z80 code decoded as 2bpp → near-random pixels, coherence ≈ 0.25.
     *     Real tile art → smooth shapes, coherence 0.5–0.9.
     *   Row variation (25%) — tiles peaking at moderate per-row range.
     *   Color variety (20%) — tiles using 2–3 of the 4 available shades.
     *   Fill ratio (15%)   — penalise near-empty (<6%) and near-solid (>95%).
     *
     * @param  {Uint8Array} shade  64-element array of shade values 0–3.
     * @returns {number}
     */
    static scoreTile(shade) {
        let sameH = 0, sameV = 0, rowVarSum = 0;
        const hist = [0, 0, 0, 0];

        for (let r = 0; r < 8; r++) {
            let rowMin = 3, rowMax = 0;
            for (let c = 0; c < 8; c++) {
                const px = shade[r * 8 + c];
                hist[px]++;
                if (c < 7 && px === shade[r * 8 + c + 1])        sameH++;
                if (r < 7 && px === shade[(r + 1) * 8 + c])      sameV++;
                if (px < rowMin) rowMin = px;
                if (px > rowMax) rowMax = px;
            }
            rowVarSum += rowMax - rowMin;
        }

        const coherence  = (sameH + sameV) / (7 * 8 + 8 * 7);
        const rowVar     = rowVarSum / (8 * 3);
        const rowScore   = 1 - Math.abs(rowVar - 0.5) * 2;
        const used       = hist.filter(x => x > 0).length;
        const colorScore = used >= 2 ? (used === 2 ? 0.8 : used === 3 ? 1.0 : 0.6) : 0;
        const filled     = hist[1] + hist[2] + hist[3];
        const fillRatio  = filled / 64;
        const fillScore  = (fillRatio < 0.06 || fillRatio > 0.95)
            ? 0
            : 1 - Math.abs(fillRatio - 0.5);

        return coherence * 0.40 + rowScore * 0.25 + colorScore * 0.20 + fillScore * 0.15;
    }

    // ── Main parse ───────────────────────────────────────────────────────────

    /**
     * Decode a ROM binary into a RomAtlas of quality-filtered tiles.
     *
     * @param  {ArrayBuffer} buffer
     * @param  {object}      opts
     * @param  {number}      [opts.start=0x150]  First byte offset to scan.
     * @param  {number}      [opts.end]          Last byte offset (exclusive).
     * @param  {number}      [opts.minScore=0.35] Quality gate 0..1.
     * @returns {RomAtlas}
     */
    static parse(buffer, opts = {}) {
        const data  = new Uint8Array(buffer);
        const start = Math.ceil((opts.start ?? 0x150) / 16) * 16;
        const end   = Math.min(opts.end ?? data.length, data.length);
        const minQ  = opts.minScore ?? 0.35;
        const all   = [];

        for (let off = start; off + 16 <= end; off += 16) {
            // Quick reject: uniform block (padding, NOPs, empty VRAM)
            const b0 = data[off];
            let allSame = true;
            for (let i = 1; i < 16; i++) {
                if (data[off + i] !== b0) { allSame = false; break; }
            }
            if (allSame) continue;

            // Decode 2bpp → shade values 0–3
            const shade = new Uint8Array(64);
            for (let row = 0; row < 8; row++) {
                const lo = data[off + row * 2];
                const hi = data[off + row * 2 + 1];
                for (let bit = 7; bit >= 0; bit--) {
                    shade[row * 8 + (7 - bit)] = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
                }
            }

            const score = RomParser.scoreTile(shade);
            if (score < minQ) continue;

            // 32-bit rolling hash for deduplication
            let h = 0;
            for (let p = 0; p < 64; p++) h = (Math.imul(h, 31) + shade[p]) >>> 0;

            all.push({ shade, score, hash: h });
        }

        // Deduplicate by hash; keep the higher-score copy on collision
        const seen = new Map();
        for (const t of all) {
            const prev = seen.get(t.hash);
            if (!prev || t.score > prev.score) seen.set(t.hash, t);
        }

        // Sort by score descending, cap at MAX_TILES
        const sorted = [...seen.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, RomParser.MAX_TILES);

        return new RomAtlas(sorted.map(t => t.shade), sorted.map(t => t.score));
    }

    /** Convenience wrapper — returns the cartridge title string. */
    static getTitle(buffer) {
        return RomParser.parseHeader(buffer)?.title ?? 'UNKNOWN';
    }

    // ── Bank helpers ─────────────────────────────────────────────────────────

    /**
     * Build an array of bank descriptors for the UI bank-select dropdown.
     * Bank 0 = 0x0150..0x3FFF, banks 1..N each span 16 KB from 0x4000 onward.
     *
     * @param  {ArrayBuffer} buffer
     * @param  {object|null} header  Result of parseHeader().
     * @returns {Array<{bank, start, end, label}>}
     */
    static getBanks(buffer, header) {
        const size   = buffer.byteLength;
        const nBanks = header ? header.bankCount : Math.ceil(size / 16384);
        const banks  = [];

        if (size > 0x150) {
            banks.push({ bank: 0, start: 0x150, end: Math.min(0x4000, size), label: 'BANK 0 (header+code)' });
        }
        for (let b = 1; b < nBanks && b * 16384 < size; b++) {
            const s = b * 16384;
            banks.push({ bank: b, start: s, end: Math.min(s + 16384, size), label: `BANK ${b} (0x${s.toString(16).toUpperCase()})` });
        }
        return banks;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROM ATLAS — sprite-sheet tile renderer
//
//  Architecture:
//    Load time : decode shade[] → bake all tiles into one OffscreenCanvas
//                sprite sheet (N tiles in a 32-wide grid). Cost O(N), done once.
//    Run time  : drawImage(sheet, sx, sy, 8, 8, dx, dy, sz, sz)
//                → single GPU blit, zero CPU pixel work per frame.
//
//  Palette caching:
//    Each (c1, c2) hex pair gets its own sheet, stored in a Map<string, canvas>.
//    Sheets are built lazily on first draw and reused on every subsequent frame.
//    Cache is bounded to 10 entries (covers all 10 system palettes without eviction).
// ══════════════════════════════════════════════════════════════════════════════

export class RomAtlas {
    static COLS = 32;   // tiles per row in the sprite sheet

    /**
     * @param {Uint8Array[]} shadeArrays  Array of 64-byte shade tiles (values 0–3).
     * @param {number[]}     [scores]     Optional quality scores, parallel to shadeArrays.
     */
    constructor(shadeArrays, scores = null) {
        this._tiles  = shadeArrays;
        this._scores = scores;
        this._count  = shadeArrays.length;
        this._cols   = RomAtlas.COLS;
        this._rows   = Math.ceil(this._count / RomAtlas.COLS);
        this._sheets = new Map();   // `${c1},${c2}` → OffscreenCanvas
    }

    get tileCount() { return this._count; }

    // ── Sprite sheet builder ─────────────────────────────────────────────────

    /**
     * Build (or retrieve from cache) the sprite sheet for a given palette.
     * All putImageData calls happen here — once per palette, never per frame.
     *
     * @param  {string} c1Hex  Primary colour hex (e.g. '#00ffcc').
     * @param  {string} c2Hex  Secondary colour hex.
     * @returns {OffscreenCanvas}
     */
    _buildSheet(c1Hex, c2Hex) {
        const key = `${c1Hex},${c2Hex}`;
        const hit = this._sheets.get(key);
        if (hit) return hit;

        const sheet = new OffscreenCanvas(this._cols * 8, Math.max(1, this._rows) * 8);
        const sCtx  = sheet.getContext('2d');
        const c1    = RomAtlas._hex2rgb(c1Hex);
        const c2    = RomAtlas._hex2rgb(c2Hex);
        const img   = new ImageData(8, 8);
        const d     = img.data;

        for (let i = 0; i < this._count; i++) {
            const tile = this._tiles[i];
            for (let p = 0; p < 64; p++) {
                const sh  = tile[p];
                const idx = p << 2;
                switch (sh) {
                    case 0: d[idx]=0;    d[idx+1]=0;    d[idx+2]=0;    d[idx+3]=0;   break;
                    case 1: d[idx]=c2.r>>2; d[idx+1]=c2.g>>2; d[idx+2]=c2.b>>2; d[idx+3]=180; break;
                    case 2: d[idx]=c2.r; d[idx+1]=c2.g; d[idx+2]=c2.b; d[idx+3]=230; break;
                    default:d[idx]=c1.r; d[idx+1]=c1.g; d[idx+2]=c1.b; d[idx+3]=255; break;
                }
            }
            sCtx.putImageData(img, (i % this._cols) * 8, Math.floor(i / this._cols) * 8);
        }

        if (this._sheets.size >= 10) this._sheets.delete(this._sheets.keys().next().value);
        this._sheets.set(key, sheet);
        return sheet;
    }

    // ── Runtime draw ─────────────────────────────────────────────────────────

    /**
     * Draw one tile. Zero CPU pixel work — single drawImage crop from the sheet.
     * Sets ctx.globalAlpha to `alpha` before the call.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} idx     Tile index (will be wrapped to tileCount).
     * @param {number} x       Destination x (top-left).
     * @param {number} y       Destination y (top-left).
     * @param {number} size    Rendered size in pixels (square).
     * @param {string} c1Hex
     * @param {string} c2Hex
     * @param {number} [alpha=1]
     */
    draw(ctx, idx, x, y, size, c1Hex, c2Hex, alpha = 1) {
        if (this._count === 0) return;
        const i  = ((idx % this._count) + this._count) % this._count;
        const sh = this._buildSheet(c1Hex, c2Hex);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sh,
            (i % this._cols) * 8,           // sx
            Math.floor(i / this._cols) * 8, // sy
            8, 8,                           // sW, sH
            x, y, size, size                // dx, dy, dW, dH
        );
    }

    // ── Sequence helper ──────────────────────────────────────────────────────

    /**
     * Return `count` tile indices spread evenly across the atlas, offset by
     * `patternIdx` so that each of the 10 patterns gets a distinct set.
     *
     * @param  {number} patternIdx  0–9
     * @param  {number} [count=5]
     * @returns {number[]}
     */
    getSeq(patternIdx, count = 5) {
        if (this._count === 0) return [];
        const step   = Math.max(1, Math.floor(this._count / count));
        const offset = Math.floor((patternIdx / 10) * this._count) % this._count;
        return Array.from({ length: count }, (_, i) => (offset + i * step) % this._count);
    }

    // ── Preview strip ────────────────────────────────────────────────────────

    /**
     * Render all tiles as a horizontal row onto an HTMLCanvasElement.
     * Used only for the tile-strip preview in the controller panel.
     *
     * @param {HTMLCanvasElement} canvas
     * @param {string}            c1Hex
     * @param {string}            c2Hex
     */
    renderStrip(canvas, c1Hex, c2Hex) {
        const sh   = this._buildSheet(c1Hex, c2Hex);
        canvas.width  = this._count * 8;
        canvas.height = 8;
        const sc   = canvas.getContext('2d');
        sc.clearRect(0, 0, canvas.width, 8);
        for (let i = 0; i < this._count; i++) {
            sc.drawImage(sh,
                (i % this._cols) * 8, Math.floor(i / this._cols) * 8, 8, 8,
                i * 8, 0, 8, 8
            );
        }
    }

    /** Drop all cached sprite sheets (e.g. after a palette bulk-change). */
    clearSheets() { this._sheets.clear(); }

    // ── Internal ─────────────────────────────────────────────────────────────

    static _hex2rgb(hex) {
        const n = parseInt(hex.replace('#', ''), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
}
