/*
 * svg2am.js - Konverter SVG (mis. hasil imagetracer) ke format scene XML Alight Motion.
 *
 * Setiap path SVG yang warnanya berurutan sama digabung jadi satu <shape> bentuk bebas.
 * Kurva kuadratik (Q) diubah jadi titik-titik lurus (L), karena contoh Alight Motion hanya memakai M dan L.
 */
(function (global) {
    'use strict';

    const CURVE_STEPS = 4;     // jumlah segmen per kurva Q
    const DECIMALS = 1;        // ketelitian koordinat

    function parseAttrs(str) {
        const attrs = {};
        const re = /([a-zA-Z:-]+)="([^"]*)"/g;
        let m;
        while ((m = re.exec(str))) attrs[m[1]] = m[2];
        return attrs;
    }

    function toHex2(n) {
        return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    }

    // Ubah warna SVG ke #AARRGGBB (huruf besar). Mengembalikan null untuk 'none' atau tidak dikenal.
    function parseColor(color, opacity) {
        if (!color || color === 'none') return null;
        const c = color.trim().toLowerCase();
        let r, g, b, a = opacity;

        if (c.startsWith('#')) {
            let hex = c.slice(1);
            if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
            if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return null;
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            const m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
            if (!m) return null;
            r = parseFloat(m[1]); g = parseFloat(m[2]); b = parseFloat(m[3]);
            if (m[4] !== undefined) a *= parseFloat(m[4]);
        }

        return '#' + toHex2(a * 255) + toHex2(r) + toHex2(g) + toHex2(b);
    }

    // Ubah data path SVG (M, L, Q, Z absolut) jadi daftar subpath berisi titik [x, y].
    // Setiap subpath ditutup dengan mengulang titik awal.
    function flattenPath(d) {
        const tokens = d.match(/[MLQZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
        const subpaths = [];
        let cur = null;
        let px = 0, py = 0, sx = 0, sy = 0;
        let cmd = null;
        let i = 0;

        const num = () => parseFloat(tokens[i++]);
        const start = (x, y) => {
            cur = [[x, y]];
            subpaths.push(cur);
            sx = x; sy = y; px = x; py = y;
        };

        while (i < tokens.length) {
            const t = tokens[i];
            if (/^[MLQZ]$/i.test(t)) {
                cmd = t.toUpperCase();
                i++;
                if (cmd === 'Z') {
                    if (cur) {
                        cur.push([sx, sy]);
                        px = sx; py = sy;
                        cur = null;
                    }
                }
                continue;
            }

            if (cmd === 'M') {
                const x = num(), y = num();
                start(x, y);
                cmd = 'L';
            } else if (cmd === 'L') {
                const x = num(), y = num();
                if (!cur) start(px, py);
                cur.push([x, y]);
                px = x; py = y;
            } else if (cmd === 'Q') {
                const qx = num(), qy = num(), x = num(), y = num();
                if (!cur) start(px, py);
                for (let k = 1; k <= CURVE_STEPS; k++) {
                    const t2 = k / CURVE_STEPS;
                    const mt = 1 - t2;
                    cur.push([
                        mt * mt * px + 2 * mt * t2 * qx + t2 * t2 * x,
                        mt * mt * py + 2 * mt * t2 * qy + t2 * t2 * y
                    ]);
                }
                px = x; py = y;
            } else {
                i++; // token tidak dikenal, lewati
            }
        }

        return subpaths.filter(s => s.length > 1);
    }

    function fmt(n) {
        return Number(n.toFixed(DECIMALS)).toString();
    }

    // Ubah subpath menjadi string d Alight Motion (koordinat relatif terhadap pusat scene).
    function subpathsToD(subpaths, offsetX, offsetY) {
        const parts = [];
        for (const sp of subpaths) {
            sp.forEach((p, idx) => {
                const x = fmt(p[0] - offsetX);
                const y = fmt(p[1] - offsetY);
                parts.push((idx === 0 ? 'M' : 'L') + ' ' + x + ' ' + y);
            });
        }
        return parts.join(' ');
    }

    function escapeXml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    /**
     * Konversi teks SVG ke teks scene XML Alight Motion.
     * options.title     : judul scene
     * options.duration  : durasi dalam ms (default 1000)
     * options.fps       : fps (default 30)
     * options.bgcolor   : warna latar, format #AARRGGBB (default #ffffffff)
     */
    function convertSvgToAm(svgText, options) {
        options = options || {};
        const title = options.title || 'SVG Import';
        const duration = options.duration || 1000;
        const fps = options.fps || 30;
        const bgcolor = options.bgcolor || '#ffffffff';

        const svgTagMatch = svgText.match(/<svg\b[^>]*>/i);
        if (!svgTagMatch) throw new Error('Tag <svg> tidak ditemukan.');
        const svgAttrs = parseAttrs(svgTagMatch[0]);

        // Ukuran scene: pakai width/height, lalu viewBox sebagai cadangan
        let width = parseFloat(svgAttrs.width);
        let height = parseFloat(svgAttrs.height);
        const vb = svgAttrs.viewBox ? svgAttrs.viewBox.trim().split(/[\s,]+/).map(Number) : null;
        if (!(width > 0) && vb && vb.length === 4) width = vb[2];
        if (!(height > 0) && vb && vb.length === 4) height = vb[3];
        if (!(width > 0) || !(height > 0)) throw new Error('SVG perlu atribut width/height atau viewBox.');
        width = Math.round(width);
        height = Math.round(height);

        const offsetX = width / 2;
        const offsetY = height / 2;

        // Kumpulkan path dan gabungkan path berwarna sama yang berurutan
        const groups = [];
        const pathRe = /<path\b([^>]*?)\/?>/gi;
        let m;
        while ((m = pathRe.exec(svgText))) {
            const attrs = parseAttrs(m[1]);
            if (!attrs.d) continue;

            const fill = attrs.fill === undefined ? '#000000' : attrs.fill;
            const fillOpacity = (parseFloat(attrs['fill-opacity'] ?? '1') || 1) * (parseFloat(attrs.opacity ?? '1') || 1);
            const colorHex = parseColor(fill, Math.max(0, Math.min(1, fillOpacity)));
            if (!colorHex) continue;

            const subpaths = flattenPath(attrs.d);
            if (subpaths.length === 0) continue;

            const last = groups[groups.length - 1];
            if (last && last.color === colorHex) {
                last.subpaths.push(...subpaths);
            } else {
                groups.push({ color: colorHex, subpaths: subpaths.slice() });
            }
        }

        if (groups.length === 0) throw new Error('Tidak ada path dengan warna isi yang bisa dikonversi.');

        const modified = Date.now();
        const shapes = groups.map((g, idx) => {
            const d = subpathsToD(g.subpaths, offsetX, offsetY);
            return [
                `  <shape id="${1000000000 + idx}" label="Bentuk ${idx + 1}" startTime="0" endTime="${duration}" fillType="color" mediaFillMode="fill">`,
                `    <transform>`,
                `      <location value="${offsetX.toFixed(6)},${offsetY.toFixed(6)},0.000000" />`,
                `    </transform>`,
                `    <fillColor value="${g.color}" />`,
                `    <path d="${d}" />`,
                `  </shape>`
            ].join('\n');
        });

        const sceneOpen = [
            `<scene title="${escapeXml(title)}" width="${width}" height="${height}" exportWidth="${width}" exportHeight="${height}"`,
            `  precompose="dynamicResolution" bgcolor="${bgcolor}" totalTime="${duration}" fps="${fps}"`,
            `  modifiedTime="${modified}" amver="1028425" ffver="106" am="com.alightcreative.motion/5.0.273.1028425"`,
            `  amplatform="android" retime="freeze" retimeAdaptFPS="false">`
        ].join('\n');

        return `<?xml version='1.0' encoding='UTF-8' ?>\n${sceneOpen}\n${shapes.join('\n')}\n</scene>\n`;
    }

    const api = { convertSvgToAm, flattenPath, parseColor };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        global.Svg2Am = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
