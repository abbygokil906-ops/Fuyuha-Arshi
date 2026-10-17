document.addEventListener('DOMContentLoaded', () => {
    const svgInput = document.getElementById('svg-input');
    const svgContainer = document.getElementById('svg-container');
    const xmlOutput = document.getElementById('xml-output');
    const downloadBtn = document.getElementById('download-btn');
    const titleInput = document.getElementById('title-input');
    const statusEl = document.getElementById('status');

    let svgText = null;
    let xmlText = null;
    let baseName = 'scene';

    function setStatus(msg, isError) {
        statusEl.textContent = msg || '';
        statusEl.className = 'status' + (isError ? ' error' : '');
    }

    svgInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.svg')) {
            setStatus('Hanya file SVG yang didukung.', true);
            reset();
            return;
        }

        baseName = file.name.replace(/\.[^/.]+$/, '');
        titleInput.value = baseName;

        const reader = new FileReader();
        reader.onload = () => {
            svgText = reader.result;
            svgContainer.innerHTML = svgText;
            convert();
        };
        reader.onerror = () => setStatus('Gagal membaca file.', true);
        reader.readAsText(file);
    });

    titleInput.addEventListener('input', () => {
        if (svgText) convert();
    });

    function convert() {
        if (!svgText) return;
        try {
            xmlText = window.Svg2Am.convertSvgToAm(svgText, { title: titleInput.value || baseName });
            xmlOutput.textContent = xmlText;
            downloadBtn.disabled = false;
            setStatus('Selesai. Ukuran XML: ' + (xmlText.length / 1024).toFixed(1) + ' KB');
        } catch (err) {
            xmlText = null;
            downloadBtn.disabled = true;
            setStatus('Konversi gagal: ' + err.message, true);
        }
    }

    downloadBtn.addEventListener('click', () => {
        if (!xmlText) return;
        const blob = new Blob([xmlText], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = baseName + '.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    function reset() {
        svgContainer.innerHTML = '';
        xmlOutput.textContent = '';
        downloadBtn.disabled = true;
        svgText = null;
        xmlText = null;
    }
});
