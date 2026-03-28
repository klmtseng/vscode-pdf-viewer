// PDF Viewer - Webview Script
// Uses PDFViewer from pdfjs-dist for proper text layer, annotation layer, and rendering.
//
// pdf_viewer.mjs reads the core library via globalThis.pdfjsLib, so we must:
//   1. Load pdf.min.mjs first
//   2. Assign it to globalThis.pdfjsLib
//   3. Then dynamically import pdf_viewer.mjs

(async () => {
    // Step 1: Load core library and expose it globally for pdf_viewer.mjs
    const pdfjsLib = await import('./pdf.min.mjs');
    globalThis.pdfjsLib = pdfjsLib;

    // Step 2: Load viewer components (needs globalThis.pdfjsLib already set)
    const { PDFViewer, EventBus, PDFLinkService, PDFFindController } =
        await import('./pdf_viewer.mjs');

    // Read config from meta tag
    const config = JSON.parse(
        document.getElementById('pdf-preview-config').dataset.config
    );

    pdfjsLib.GlobalWorkerOptions.workerSrc = config.workerSrc;

    const vscode = acquireVsCodeApi();
    const previousState = vscode.getState();

    // Setup PDFViewer
    const container = document.getElementById('viewerContainer');
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ linkService, eventBus });

    const pdfViewer = new PDFViewer({
        container,
        viewer: document.getElementById('viewer'),
        eventBus,
        linkService,
        findController,
    });

    linkService.setViewer(pdfViewer);

    // DOM elements
    const loading    = document.getElementById('loading');
    const pageInput  = document.getElementById('page-input');
    const pageCount  = document.getElementById('page-count');
    const btnPrev    = document.getElementById('btn-prev');
    const btnNext    = document.getElementById('btn-next');
    const btnZoomIn  = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const zoomSelect = document.getElementById('zoom-select');

    // ── Load PDF ─────────────────────────────────────────────────────────────

    async function loadPdf(url) {
        loading.textContent = 'Loading PDF...';
        loading.className = '';
        loading.style.display = 'flex';

        try {
            const pdfDocument = await pdfjsLib.getDocument({
                url,
                cMapUrl: config.cMapUrl,
                cMapPacked: true,
                standardFontDataUrl: config.standardFontDataUrl,
                useWorkerFetch: false,
            }).promise;

            pdfViewer.setDocument(pdfDocument);
            linkService.setDocument(pdfDocument);

            pageCount.textContent = pdfDocument.numPages;
            pageInput.max = pdfDocument.numPages;

            loading.style.display = 'none';
        } catch (err) {
            loading.textContent = `Error loading PDF: ${err.message}`;
            loading.className = 'error';
            loading.style.display = 'flex';
        }
    }

    // ── PDFViewer events ─────────────────────────────────────────────────────

    // Fires once all pages are initialised — good time to restore state
    eventBus.on('pagesinit', () => {
        const savedScale = previousState?.scale ?? config.defaultZoom;
        pdfViewer.currentScaleValue = String(savedScale);

        if (previousState?.page > 1) {
            pdfViewer.currentPageNumber = previousState.page;
        }

        updateNavButtons();
        updateZoomSelect();
    });

    eventBus.on('pagechanging', ({ pageNumber }) => {
        pageInput.value = pageNumber;
        updateNavButtons();
        saveState();
    });

    eventBus.on('scalechanging', () => {
        updateZoomSelect();
        saveState();
    });

    // ── Toolbar ───────────────────────────────────────────────────────────────

    btnPrev.addEventListener('click', () => { pdfViewer.currentPageNumber--; });
    btnNext.addEventListener('click', () => { pdfViewer.currentPageNumber++; });

    pageInput.addEventListener('change', () => {
        const page = parseInt(pageInput.value, 10);
        if (!isNaN(page)) { pdfViewer.currentPageNumber = page; }
    });

    btnZoomIn.addEventListener('click', () => {
        pdfViewer.currentScale = Math.min(pdfViewer.currentScale + 0.25, 5);
    });

    btnZoomOut.addEventListener('click', () => {
        pdfViewer.currentScale = Math.max(pdfViewer.currentScale - 0.25, 0.25);
    });

    zoomSelect.addEventListener('change', () => {
        pdfViewer.currentScaleValue = zoomSelect.value;
    });

    // ── Ctrl + mouse wheel zoom ───────────────────────────────────────────────

    container.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) { return; }
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        pdfViewer.currentScale = Math.min(5, Math.max(0.25, pdfViewer.currentScale + delta));
    }, { passive: false });

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    document.addEventListener('keydown', (e) => {
        if (e.target === pageInput) { return; }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            pdfViewer.currentPageNumber--;
            e.preventDefault();
        } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            pdfViewer.currentPageNumber++;
            e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            pdfViewer.currentScaleValue = 'auto';
            e.preventDefault();
        }
    });

    // ── Window resize ─────────────────────────────────────────────────────────

    window.addEventListener('resize', () => {
        clearTimeout(window._resizeTimer);
        window._resizeTimer = setTimeout(() => {
            const v = pdfViewer.currentScaleValue;
            if (v === 'auto' || v === 'page-fit' || v === 'page-width') {
                pdfViewer.currentScaleValue = v;
            }
        }, 200);
    });

    // ── Messages from extension host ──────────────────────────────────────────

    window.addEventListener('message', (event) => {
        if (event.data.type === 'reload') {
            loadPdf(config.pdfUrl);
        }
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    function updateNavButtons() {
        btnPrev.disabled = pdfViewer.currentPageNumber <= 1;
        btnNext.disabled =
            !pdfViewer.pdfDocument ||
            pdfViewer.currentPageNumber >= pdfViewer.pagesCount;
    }

    function updateZoomSelect() {
        const scale = pdfViewer.currentScale;
        const preset = pdfViewer.currentScaleValue;

        // Match preset strings first
        if (['auto', 'page-fit', 'page-width'].includes(preset)) {
            zoomSelect.value = preset;
            return;
        }

        // Match numeric option
        let matched = false;
        for (const opt of zoomSelect.options) {
            if (!['auto', 'page-fit', 'page-width'].includes(opt.value)) {
                if (Math.abs(parseFloat(opt.value) - scale) < 0.01) {
                    zoomSelect.value = opt.value;
                    matched = true;
                    break;
                }
            }
        }

        // Add custom percentage option if no match
        if (!matched) {
            zoomSelect.querySelector('[data-custom]')?.remove();
            const opt = document.createElement('option');
            opt.value = String(scale);
            opt.textContent = `${Math.round(scale * 100)}%`;
            opt.dataset.custom = 'true';
            opt.selected = true;
            zoomSelect.insertBefore(opt, zoomSelect.firstChild);
        }
    }

    function saveState() {
        vscode.setState({
            scale: pdfViewer.currentScaleValue || String(pdfViewer.currentScale),
            page: pdfViewer.currentPageNumber,
        });
    }

    // ── Start ─────────────────────────────────────────────────────────────────

    loadPdf(config.pdfUrl);
})();
