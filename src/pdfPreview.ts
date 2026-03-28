import * as vscode from 'vscode';

export class PdfPreview {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly resource: vscode.Uri,
        private readonly webviewPanel: vscode.WebviewPanel
    ) {
        const webview = webviewPanel.webview;

        // Include the PDF's parent directory so the webview can load it by URI
        const pdfDirUri = resource.with({
            path: resource.path.replace(/\/[^/]+$/, '/'),
        });

        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'media'),
                pdfDirUri,
            ],
        };

        webview.html = this.getHtml(webview);

        // Reload when file changes on disk
        const watcher = vscode.workspace.createFileSystemWatcher(resource.fsPath);
        watcher.onDidChange((e) => {
            if (e.fsPath === this.resource.fsPath) {
                webview.postMessage({ type: 'reload' });
            }
        });
        this.disposables.push(watcher);

        webview.onDidReceiveMessage(
            (msg) => {
                if (msg.type === 'reopen-as-text') {
                    vscode.commands.executeCommand('vscode.openWith', resource, 'default');
                }
            },
            undefined,
            this.disposables
        );
    }

    private getHtml(webview: vscode.Webview): string {
        const mediaUri = (file: string) =>
            webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));

        const pdfUri  = webview.asWebviewUri(this.resource);
        const nonce   = getNonce();
        const config  = vscode.workspace.getConfiguration('pdfViewer');
        const defaultZoom = config.get<string>('defaultZoom', 'auto');

        const configData = JSON.stringify({
            pdfUrl:              pdfUri.toString(),
            workerSrc:           mediaUri('pdf.worker.min.mjs').toString(),
            cMapUrl:             mediaUri('cmaps').toString() + '/',
            standardFontDataUrl: mediaUri('standard_fonts').toString() + '/',
            defaultZoom,
        });

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src 'nonce-${nonce}' ${webview.cspSource};
        style-src ${webview.cspSource} 'unsafe-inline';
        img-src ${webview.cspSource} data: blob:;
        font-src ${webview.cspSource} data:;
        connect-src ${webview.cspSource};
        worker-src blob:;
    ">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta id="pdf-preview-config" data-config="${escapeAttr(configData)}">
    <title>PDF Viewer</title>
    <link rel="stylesheet" href="${mediaUri('pdf_viewer.css')}">
    <style>
        /* ── Reset & body ──────────────────────────────────────────────── */
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            font-family: var(--vscode-font-family, sans-serif);
            font-size: 13px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* ── Toolbar ───────────────────────────────────────────────────── */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 10px;
            background: var(--vscode-editorWidget-background, #252526);
            border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
            flex-shrink: 0;
            flex-wrap: wrap;
        }

        .toolbar button {
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #cccccc);
            border: none;
            padding: 3px 9px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 13px;
            line-height: 1.5;
            white-space: nowrap;
        }
        .toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
        .toolbar button:disabled { opacity: 0.45; cursor: default; }
        .toolbar button.active {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }

        .toolbar input[type="number"] {
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #cccccc);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            padding: 2px 5px;
            width: 46px;
            text-align: center;
            border-radius: 2px;
            font-size: 13px;
        }

        .toolbar select {
            background: var(--vscode-dropdown-background, #3c3c3c);
            color: var(--vscode-dropdown-foreground, #cccccc);
            border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
            padding: 2px 5px;
            border-radius: 2px;
            font-size: 13px;
        }

        .separator {
            width: 1px;
            height: 18px;
            background: var(--vscode-editorWidget-border, #454545);
            flex-shrink: 0;
        }

        /* ── Find bar ──────────────────────────────────────────────────── */
        #find-bar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: var(--vscode-editorWidget-background, #252526);
            border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
            flex-shrink: 0;
        }
        #find-bar.hidden { display: none; }

        #find-input {
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #cccccc);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            padding: 3px 7px;
            border-radius: 2px;
            font-size: 13px;
            width: 200px;
        }
        #find-input:focus { outline: 1px solid var(--vscode-focusBorder, #007fd4); }
        #find-input.not-found { border-color: var(--vscode-inputValidation-errorBorder, #be1100); }

        #find-bar button {
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #cccccc);
            border: none;
            padding: 3px 8px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 12px;
        }
        #find-bar button:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

        #find-bar label {
            display: flex;
            align-items: center;
            gap: 3px;
            cursor: pointer;
            user-select: none;
            font-size: 12px;
        }

        #find-status {
            font-size: 12px;
            color: var(--vscode-descriptionForeground, #999);
            min-width: 80px;
        }
        #find-status.not-found { color: var(--vscode-errorForeground, #f48771); }

        /* ── App root: sidebar + main ──────────────────────────────────── */
        #app-root {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* ── Sidebar ───────────────────────────────────────────────────── */
        #sidebar {
            width: 152px;
            min-width: 152px;
            background: var(--vscode-sideBar-background, #252526);
            border-right: 1px solid var(--vscode-editorWidget-border, #454545);
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
        }
        #sidebar.hidden { display: none; }

        #thumbnail-list {
            padding: 8px 6px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .thumb-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            cursor: pointer;
            padding: 4px;
            border-radius: 3px;
            border: 2px solid transparent;
        }
        .thumb-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
        .thumb-item.active {
            border-color: var(--vscode-focusBorder, #007fd4);
            background: var(--vscode-list-activeSelectionBackground, #094771);
        }

        .thumb-item canvas {
            display: block;
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }

        .thumb-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #999);
        }

        /* ── Main panel ────────────────────────────────────────────────── */
        #main {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* ── Content area ──────────────────────────────────────────────── */
        #content-area {
            flex: 1;
            position: relative;
            overflow: hidden;
        }

        #viewerContainer {
            position: absolute;
            inset: 0;
            overflow: auto;
            background: #525659;
        }

        .pdfViewer { padding-top: 8px; }
        .pdfViewer .page { margin: 8px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }

        .textLayer ::selection { background: rgba(0, 100, 200, 0.4); }

        /* ── Loading overlay ───────────────────────────────────────────── */
        #loading {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-editor-background, #1e1e1e);
            font-size: 15px;
            color: var(--vscode-descriptionForeground, #999);
            z-index: 100;
        }
        #loading.error { color: var(--vscode-errorForeground, #f48771); }

        /* ── Print ─────────────────────────────────────────────────────── */
        #print-container { display: none; }

        @media print {
            .toolbar, #find-bar, #sidebar, #viewerContainer, #loading { display: none !important; }
            #print-container {
                display: block !important;
                background: white;
            }
            #print-container canvas {
                display: block;
                width: 100%;
                max-width: 100%;
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="btn-sidebar" title="Toggle Thumbnail Sidebar">&#9776;</button>
        <div class="separator"></div>
        <button id="btn-prev" title="Previous Page (&#8592; / PageUp)">&#9664;</button>
        <span style="white-space:nowrap">
            <input id="page-input" type="number" min="1" value="1">
            <span style="opacity:.7"> / </span><span id="page-count">-</span>
        </span>
        <button id="btn-next" title="Next Page (&#8594; / PageDown)">&#9654;</button>
        <div class="separator"></div>
        <button id="btn-zoom-out" title="Zoom Out (Ctrl+-)">&#8722;</button>
        <select id="zoom-select" title="Zoom Level">
            <option value="auto">Auto</option>
            <option value="page-fit">Page Fit</option>
            <option value="page-width">Page Width</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
        </select>
        <button id="btn-zoom-in" title="Zoom In (Ctrl++)">&#43;</button>
        <div class="separator"></div>
        <button id="btn-scroll-mode" title="Toggle Scroll Mode">&#8597; Scroll</button>
        <button id="btn-search" title="Search (Ctrl+F)">&#128269;</button>
        <button id="btn-print" title="Print">&#128424;</button>
    </div>

    <div id="find-bar" class="hidden">
        <input id="find-input" type="text" placeholder="Search in PDF…" autocomplete="off" spellcheck="false">
        <button id="btn-find-prev" title="Previous Match">&#9650;</button>
        <button id="btn-find-next" title="Next Match">&#9660;</button>
        <label><input id="find-case" type="checkbox"> Case</label>
        <label><input id="find-whole" type="checkbox"> Word</label>
        <span id="find-status"></span>
        <button id="btn-find-close" title="Close (Escape)">&#10005;</button>
    </div>

    <div id="app-root">
        <div id="sidebar" class="hidden">
            <div id="thumbnail-list"></div>
        </div>

        <div id="main">
            <div id="content-area">
                <div id="viewerContainer" tabindex="0">
                    <div id="viewer" class="pdfViewer"></div>
                </div>
                <div id="loading">Loading PDF…</div>
            </div>
        </div>
    </div>

    <div id="print-container"></div>

    <script nonce="${nonce}" src="${mediaUri('viewer.js')}" type="module"></script>
</body>
</html>`;
    }

    public dispose() {
        for (const d of this.disposables) { d.dispose(); }
    }
}

function escapeAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
