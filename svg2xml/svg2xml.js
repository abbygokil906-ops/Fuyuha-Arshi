document.addEventListener('DOMContentLoaded', () => {
    const svgInput = document.getElementById('svg-input');
    const svgContainer = document.getElementById('svg-container');
    const xmlOutput = document.getElementById('xml-output');
    const convertBtn = document.getElementById('convert-btn');
    const errorMessage = document.getElementById('error-message');
    const loader = document.getElementById('loader');
    let svgContent = null;
    let xmlContent = null;
    let svgFileName = null;

    // Load SVG file
    svgInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        svgFileName = file.name.replace(/\.[^/.]+$/, '');

        if (!file.type.includes('svg') && !file.name.toLowerCase().endsWith('.svg')) {
            showError('Only SVG files are allowed.');
            resetUI();
            return;
        }

        try {
            loader.style.display = 'block';

            svgContent = await readFile(file);
            if (!isValidSVG(svgContent)) {
                showError('The file is not a valid SVG.');
                resetUI();
                loader.style.display = 'none';
                return;
            }

            // Preview
            svgContainer.innerHTML = svgContent;
            errorMessage.textContent = '';
            convertBtn.disabled = false;

            // Convert to VectorDrawable XML
            xmlContent = convertToVectorDrawable(svgContent);
            xmlOutput.textContent = xmlContent;

            loader.style.display = 'none';
        } catch (err) {
            showError('Error processing the SVG: ' + err.message);
            resetUI();
            loader.style.display = 'none';
        }
    });

    // Download
    convertBtn.addEventListener('click', () => {
        if (xmlContent && svgFileName) {
            downloadXML(xmlContent, `${svgFileName}.xml`);
        }
    });

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read the file.'));
            reader.readAsText(file);
        });
    }

    function isValidSVG(content) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'image/svg+xml');
            if (doc.querySelector('parsererror')) return false;
            return doc.documentElement.tagName.toLowerCase() === 'svg';
        } catch (err) {
            return false;
        }
    }

    // Read the size of the SVG. Uses viewBox when present, otherwise width/height.
    function getSvgSize(svgElement) {
        let minX = 0, minY = 0, vpWidth = 0, vpHeight = 0;

        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
            const v = viewBox.trim().split(/[\s,]+/).map(Number);
            if (v.length === 4 && v[2] > 0 && v[3] > 0) {
                [minX, minY, vpWidth, vpHeight] = v;
            }
        }

        // Size shown in Android (dp). Fall back to the viewBox size if width/height are missing.
        let width = parseFloat(svgElement.getAttribute('width'));
        let height = parseFloat(svgElement.getAttribute('height'));
        if (!(width > 0)) width = vpWidth;
        if (!(height > 0)) height = vpHeight;

        if (!(vpWidth > 0) || !(vpHeight > 0)) {
            // No usable viewBox: use width/height as the viewport
            vpWidth = width;
            vpHeight = height;
        }

        if (!(width > 0) || !(height > 0)) {
            throw new Error('The SVG needs a viewBox or width/height attributes.');
        }

        return { minX, minY, width, height, vpWidth, vpHeight };
    }

    function convertToVectorDrawable(svg) {
        try {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
            const svgElement = svgDoc.documentElement;

            const { minX, minY, width, height, vpWidth, vpHeight } = getSvgSize(svgElement);

            let vectorDrawable = `<?xml version="1.0" encoding="utf-8"?>\n`;
            vectorDrawable += `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n`;
            vectorDrawable += `    android:width="${width}dp"\n`;
            vectorDrawable += `    android:height="${height}dp"\n`;
            vectorDrawable += `    android:viewportWidth="${vpWidth}"\n`;
            vectorDrawable += `    android:viewportHeight="${vpHeight}">\n`;

            // Shift the drawing if the viewBox does not start at 0,0
            const needsShift = minX !== 0 || minY !== 0;
            if (needsShift) {
                vectorDrawable += `    <group\n`;
                vectorDrawable += `        android:translateX="${-minX}"\n`;
                vectorDrawable += `        android:translateY="${-minY}">\n`;
            }

            const paths = [];
            const elements = svgElement.querySelectorAll('path, rect, circle');
            elements.forEach(element => {
                const pathData = convertElementToPathData(element);
                if (!pathData) return;

                const fill = element.getAttribute('fill');
                const stroke = element.getAttribute('stroke');
                const fillOpacity = getOpacity(element, 'fill-opacity');
                const strokeOpacity = getOpacity(element, 'stroke-opacity');
                const strokeWidth = element.getAttribute('stroke-width') || '1';
                const fillRule = element.getAttribute('fill-rule');

                // Fill defaults to black when no fill is set in the SVG
                const fillColor = fill === null ? '#000000' : fill;
                const fillHex = fillColor === 'none' ? null : normalizeColor(fillColor, fillOpacity);
                const strokeHex = (stroke === null || stroke === 'none') ? null : normalizeColor(stroke, strokeOpacity);

                let path = `        <path\n`;
                path += `            android:pathData="${pathData}"\n`;
                if (fillHex) {
                    path += `            android:fillColor="${fillHex}"\n`;
                }
                if (fillRule === 'evenodd') {
                    path += `            android:fillType="evenOdd"\n`;
                }
                if (strokeHex) {
                    path += `            android:strokeColor="${strokeHex}"\n`;
                    path += `            android:strokeWidth="${strokeWidth}"\n`;
                }
                path += `        />\n`;
                paths.push(path);
            });

            if (paths.length === 0) {
                throw new Error('No supported elements (path, rect, circle) found in the SVG.');
            }

            vectorDrawable += paths.map(p => needsShift ? '    ' + p : p).join('');

            if (needsShift) {
                vectorDrawable += `    </group>\n`;
            }
            vectorDrawable += `</vector>`;

            return vectorDrawable;
        } catch (err) {
            throw new Error('Conversion failed: ' + err.message);
        }
    }

    // Combine element opacity with fill/stroke opacity
    function getOpacity(element, attr) {
        const own = parseFloat(element.getAttribute(attr));
        const general = parseFloat(element.getAttribute('opacity'));
        let value = isNaN(own) ? 1 : own;
        if (!isNaN(general)) value *= general;
        return Math.max(0, Math.min(1, value));
    }

    // Convert SVG shape to path data for VectorDrawable
    function convertElementToPathData(element) {
        const tagName = element.tagName.toLowerCase();

        if (tagName === 'path') {
            return element.getAttribute('d') || '';
        } else if (tagName === 'rect') {
            const x = parseFloat(element.getAttribute('x') || '0');
            const y = parseFloat(element.getAttribute('y') || '0');
            const width = parseFloat(element.getAttribute('width') || '0');
            const height = parseFloat(element.getAttribute('height') || '0');
            if (width <= 0 || height <= 0) return null;
            return `M${x},${y} h${width} v${height} h${-width} Z`;
        } else if (tagName === 'circle') {
            const cx = parseFloat(element.getAttribute('cx') || '0');
            const cy = parseFloat(element.getAttribute('cy') || '0');
            const r = parseFloat(element.getAttribute('r') || '0');
            if (r <= 0) return null;

            // Approximate a circle with four Bezier curves
            const kappa = 0.5522847498;
            const kr = r * kappa;
            return `M${cx - r},${cy} ` +
                   `C${cx - r},${cy - kr} ${cx - kr},${cy - r} ${cx},${cy - r} ` +
                   `C${cx + kr},${cy - r} ${cx + r},${cy - kr} ${cx + r},${cy} ` +
                   `C${cx + r},${cy + kr} ${cx + kr},${cy + r} ${cx},${cy + r} ` +
                   `C${cx - kr},${cy + r} ${cx - r},${cy + kr} ${cx - r},${cy} Z`;
        }

        return null;
    }

    // Convert a color to Android format #AARRGGBB, using the given opacity (0-1)
    function normalizeColor(color, opacity) {
        const alphaValue = opacity === undefined ? 1 : opacity;
        let r, g, b, a = alphaValue;
        color = color.trim().toLowerCase();

        if (color.startsWith('#')) {
            let hex = color.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length === 8) {
                a = parseInt(hex.slice(6, 8), 16) / 255 * alphaValue;
                hex = hex.slice(0, 6);
            }
            if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return '#FF000000';
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            const match = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
            if (!match) return '#FF000000';
            r = Math.round(parseFloat(match[1]));
            g = Math.round(parseFloat(match[2]));
            b = Math.round(parseFloat(match[3]));
            if (match[4] !== undefined) a = parseFloat(match[4]) * alphaValue;
        }

        const alpha = Math.round(Math.max(0, Math.min(1, a)) * 255);
        return '#' + [alpha, r, g, b]
            .map(v => v.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    }

    function downloadXML(content, fileName) {
        const blob = new Blob([content], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function showError(message) {
        errorMessage.textContent = message;
        convertBtn.disabled = true;
    }

    function resetUI() {
        svgContainer.innerHTML = '';
        xmlOutput.textContent = '';
        convertBtn.disabled = true;
        svgContent = null;
        xmlContent = null;
        svgFileName = null;
    }
});
