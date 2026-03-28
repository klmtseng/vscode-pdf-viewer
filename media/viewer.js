// PDF Viewer — Webview Script
// Loads pdf.min.mjs first, exposes it as globalThis.pdfjsLib,
// then dynamically imports pdf_viewer.mjs (which reads globalThis.pdfjsLib).

(async () => {
    const pdfjsLib = await import('./pdf.min.mjs');
    globalThis.pdfjsLib = pdfjsLib;

    const { PDFViewer, EventBus, PDFLinkService, PDFFindController, FindState, ScrollMode } =
        await import('./pdf_viewer.mjs');

    // ── Config & state ────────────────────────────────────────────────────────

    const config = JSON.parse(
        document.getElementById('pdf-preview-config').dataset.config
    );

    pdfjsLib.GlobalWorkerOptions.workerSrc = config.workerSrc;

    const vscode         = acquireVsCodeApi();
    const previousState  = vscode.getState() || {};

    // ── PDFViewer setup ───────────────────────────────────────────────────────

    const container    = document.getElementById('viewerContainer');
    const eventBus     = new EventBus();
    const linkService  = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ linkService, eventBus });

    const pdfViewer = new PDFViewer({
        container,
        viewer:         document.getElementById('viewer'),
        eventBus,
        linkService,
        findController,
    });

    linkService.setViewer(pdfViewer);

    // ── DOM refs ──────────────────────────────────────────────────────────────

    const loading       = document.getElementById('loading');
    const pageInput     = document.getElementById('page-input');
    const pageCount     = document.getElementById('page-count');
    const btnPrev       = document.getElementById('btn-prev');
    const btnNext       = document.getElementById('btn-next');
    const btnZoomIn     = document.getElementById('btn-zoom-in');
    const btnZoomOut    = document.getElementById('btn-zoom-out');
    const zoomSelect    = document.getElementById('zoom-select');
    const btnScrollMode = document.getElementById('btn-scroll-mode');
    const btnSearch     = document.getElementById('btn-search');
    const btnPrint      = document.getElementById('btn-print');
    const btnSidebar    = document.getElementById('btn-sidebar');
    const sidebar       = document.getElementById('sidebar');
    const thumbList     = document.getElementById('thumbnail-list');
    const findBar       = document.getElementById('find-bar');
    const findInput     = document.getElementById('find-input');
    const findStatus    = document.getElementById('find-status');
    const findCase      = document.getElementById('find-case');
    const findWhole     = document.getElementById('find-whole');
    const btnFindPrev   = document.getElementById('btn-find-prev');
    const btnFindNext   = document.getElementById('btn-find-next');
    const btnFindClose  = document.getElementById('btn-find-close');
    const printContainer = document.getElementById('print-container');

    // Restore scroll mode from state
    let currentScrollMode = previousState.scrollMode ?? ScrollMode.VERTICAL;

    // ── Load PDF ──────────────────────────────────────────────────────────────

    async function loadPdf(url) {
        loading.textContent = 'Loading PDF…';
        loading.className   = '';
        loading.style.display = 'flex';

        try {
            const doc = await pdfjsLib.getDocument({
                url,
                cMapUrl:             config.cMapUrl,
                cMapPacked:          true,
                standardFontDataUrl: config.standardFontDataUrl,
                useWorkerFetch:      false,
            }).promise;

            pdfViewer.setDocument(doc);
            linkService.setDocument(doc);

            pageCount.textContent = doc.numPages;
            pageInput.max         = doc.numPages;

            loading.style.display = 'none';

            // Render thumbnails after a brief delay (let main view initialise first)
            setTimeout(() => renderThumbnails(doc), 300);
        } catch (err) {
            loading.textContent   = `Error loading PDF: ${err.message}`;
            loading.className     = 'error';
            loading.style.display = 'flex';
        }
    }

    // ── PDFViewer events ──────────────────────────────────────────────────────

    eventBus.on('pagesinit', () => {
        pdfViewer.scrollMode = currentScrollMode;
        pdfViewer.currentScaleValue = String(previousState.scale ?? config.defaultZoom);
        if ((previousState.page ?? 1) > 1) {
            pdfViewer.currentPageNumber = previousState.page;
        }
        updateScrollModeButton();
        updateNavButtons();
        updateZoomSelect();
    });

    eventBus.on('pagechanging', ({ pageNumber }) => {
        pageInput.value = pageNumber;
        updateNavButtons();
        highlightThumb(pageNumber);
        saveState();
    });

    eventBus.on('scalechanging', () => {
        updateZoomSelect();
        saveState();
    });

    // ── Navigation ────────────────────────────────────────────────────────────

    btnPrev.addEventListener('click', () => { pdfViewer.currentPageNumber--; });
    btnNext.addEventListener('click', () => { pdfViewer.currentPageNumber++; });

    pageInput.addEventListener('change', () => {
        const p = parseInt(pageInput.value, 10);
        if (!isNaN(p)) { pdfViewer.currentPageNumber = p; }
    });

    // ── Zoom ──────────────────────────────────────────────────────────────────

    btnZoomIn.addEventListener('click',  () => {
        pdfViewer.currentScale = Math.min(pdfViewer.currentScale + 0.25, 5);
    });
    btnZoomOut.addEventListener('click', () => {
        pdfViewer.currentScale = Math.max(pdfViewer.currentScale - 0.25, 0.25);
    });
    zoomSelect.addEventListener('change', () => {
        pdfViewer.currentScaleValue = zoomSelect.value;
    });

    // Ctrl + mouse wheel
    container.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) { return; }
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        pdfViewer.currentScale = Math.min(5, Math.max(0.25, pdfViewer.currentScale + delta));
    }, { passive: false });

    // ── Scroll mode ───────────────────────────────────────────────────────────

    btnScrollMode.addEventListener('click', () => {
        currentScrollMode = (currentScrollMode === ScrollMode.VERTICAL)
            ? ScrollMode.PAGE
            : ScrollMode.VERTICAL;
        pdfViewer.scrollMode = currentScrollMode;
        updateScrollModeButton();
        saveState();
    });

    function updateScrollModeButton() {
        if (currentScrollMode === ScrollMode.PAGE) {
            btnScrollMode.textContent = '📄 Single';
            btnScrollMode.classList.add('active');
        } else {
            btnScrollMode.textContent = '↕ Scroll';
            btnScrollMode.classList.remove('active');
        }
    }

    // ── Search (Ctrl+F) ───────────────────────────────────────────────────────

    let lastQuery = '';

    function openFindBar() {
        findBar.classList.remove('hidden');
        btnSearch.classList.add('active');
        findInput.focus();
        findInput.select();
    }

    function closeFindBar() {
        findBar.classList.add('hidden');
        btnSearch.classList.remove('active');
        findInput.value = '';
        findStatus.textContent = '';
        findStatus.className = '';
        findInput.className = '';
        // Clear highlights
        eventBus.dispatch('find', { query: '', type: '', highlightAll: false, findPrevious: false, caseSensitive: false, entireWord: false, phraseSearch: true });
        container.focus();
    }

    function dispatchFind(findPrevious = false, isNew = false) {
        const query = findInput.value;
        lastQuery = query;
        eventBus.dispatch('find', {
            query,
            type:           isNew ? '' : 'again',
            caseSensitive:  findCase.checked,
            entireWord:     findWhole.checked,
            phraseSearch:   true,
            findPrevious,
            highlightAll:   true,
        });
    }

    btnSearch.addEventListener('click', () => {
        if (findBar.classList.contains('hidden')) { openFindBar(); } else { closeFindBar(); }
    });

    btnFindClose.addEventListener('click', closeFindBar);

    btnFindNext.addEventListener('click', () => dispatchFind(false));
    btnFindPrev.addEventListener('click', () => dispatchFind(true));

    findInput.addEventListener('input', () => dispatchFind(false, true));
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { dispatchFind(e.shiftKey); e.preventDefault(); }
        if (e.key === 'Escape') { closeFindBar(); }
    });

    findCase.addEventListener('change',  () => dispatchFind(false, true));
    findWhole.addEventListener('change', () => dispatchFind(false, true));

    // Find result feedback
    eventBus.on('updatefindcontrolstate', ({ state, matchesCount }) => {
        if (!findInput.value) { findStatus.textContent = ''; findInput.className = ''; return; }
        if (state === FindState.NOT_FOUND) {
            findStatus.textContent = 'Not found';
            findStatus.className   = 'not-found';
            findInput.classList.add('not-found');
        } else if (state === FindState.FOUND || state === FindState.WRAPPED) {
            const { current, total } = matchesCount || {};
            findStatus.textContent = total
                ? `${current} / ${total}${state === FindState.WRAPPED ? ' (wrapped)' : ''}`
                : '';
            findStatus.className = '';
            findInput.classList.remove('not-found');
        } else {
            findStatus.textContent = '…';
            findStatus.className   = '';
            findInput.classList.remove('not-found');
        }
    });

    // ── Print ─────────────────────────────────────────────────────────────────

    btnPrint.addEventListener('click', async () => {
        const doc = pdfViewer.pdfDocument;
        if (!doc) { return; }

        btnPrint.disabled   = true;
        btnPrint.textContent = '…';
        loading.textContent  = 'Preparing print…';
        loading.className    = '';
        loading.style.display = 'flex';

        printContainer.innerHTML = '';

        try {
            for (let i = 1; i <= doc.numPages; i++) {
                loading.textContent = `Preparing print… (${i}/${doc.numPages})`;
                const page     = await doc.getPage(i);
                const viewport = page.getViewport({ scale: 2 }); // 2× for print quality
                const canvas   = document.createElement('canvas');
                canvas.width   = viewport.width;
                canvas.height  = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                printContainer.appendChild(canvas);
            }
        } finally {
            loading.style.display = 'none';
            btnPrint.disabled     = false;
            btnPrint.textContent  = '🖨';
        }

        window.print();
        // Clean up after print dialog closes
        setTimeout(() => { printContainer.innerHTML = ''; }, 1000);
    });

    // ── Thumbnail sidebar ─────────────────────────────────────────────────────

    let thumbsRendered = false;

    btnSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
        btnSidebar.classList.toggle('active');
    });

    async function renderThumbnails(doc) {
        if (thumbsRendered) { return; }
        thumbsRendered = true;
        thumbList.innerHTML = '';

        for (let i = 1; i <= doc.numPages; i++) {
            const item   = document.createElement('div');
            item.className = 'thumb-item';
            item.dataset.page = i;

            const canvas  = document.createElement('canvas');
            const label   = document.createElement('div');
            label.className = 'thumb-label';
            label.textContent = String(i);

            item.appendChild(canvas);
            item.appendChild(label);
            thumbList.appendChild(item);

            item.addEventListener('click', () => {
                pdfViewer.currentPageNumber = i;
            });

            // Render lazily — only when item enters viewport in the sidebar
            const observer = new IntersectionObserver(async (entries) => {
                if (!entries[0].isIntersecting) { return; }
                observer.disconnect();
                try {
                    const page     = await doc.getPage(i);
                    const viewport = page.getViewport({ scale: 0.18 });
                    canvas.width   = Math.floor(viewport.width);
                    canvas.height  = Math.floor(viewport.height);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                } catch (_) { /* ignore render errors for thumbnails */ }
            }, { root: sidebar, threshold: 0.1 });

            observer.observe(item);
        }

        highlightThumb(pdfViewer.currentPageNumber);
    }

    function highlightThumb(pageNumber) {
        thumbList.querySelectorAll('.thumb-item').forEach((el) => {
            el.classList.toggle('active', Number(el.dataset.page) === pageNumber);
        });
        // Scroll active thumb into view (only when sidebar is open)
        if (!sidebar.classList.contains('hidden')) {
            const active = thumbList.querySelector('.thumb-item.active');
            active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    document.addEventListener('keydown', (e) => {
        if (e.target === pageInput || e.target === findInput) { return; }

        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            openFindBar(); e.preventDefault();
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            pdfViewer.currentPageNumber--; e.preventDefault();
        } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            pdfViewer.currentPageNumber++; e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
            pdfViewer.currentScale = Math.min(pdfViewer.currentScale + 0.25, 5); e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            pdfViewer.currentScale = Math.max(pdfViewer.currentScale - 0.25, 0.25); e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            pdfViewer.currentScaleValue = 'auto'; e.preventDefault();
        } else if (e.key === 'Escape' && !findBar.classList.contains('hidden')) {
            closeFindBar();
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
            thumbsRendered = false;
            loadPdf(config.pdfUrl);
        }
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    function updateNavButtons() {
        btnPrev.disabled = pdfViewer.currentPageNumber <= 1;
        btnNext.disabled = !pdfViewer.pdfDocument ||
                           pdfViewer.currentPageNumber >= pdfViewer.pagesCount;
    }

    function updateZoomSelect() {
        const scale  = pdfViewer.currentScale;
        const preset = pdfViewer.currentScaleValue;

        if (['auto', 'page-fit', 'page-width'].includes(preset)) {
            zoomSelect.value = preset; return;
        }

        let matched = false;
        for (const opt of zoomSelect.options) {
            if (!['auto', 'page-fit', 'page-width'].includes(opt.value)) {
                if (Math.abs(parseFloat(opt.value) - scale) < 0.01) {
                    zoomSelect.value = opt.value; matched = true; break;
                }
            }
        }
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
            scale:      pdfViewer.currentScaleValue || String(pdfViewer.currentScale),
            page:       pdfViewer.currentPageNumber,
            scrollMode: currentScrollMode,
        });
    }

    // ── Start ─────────────────────────────────────────────────────────────────

    loadPdf(config.pdfUrl);
})();
