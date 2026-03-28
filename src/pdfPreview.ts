import * as vscode from 'vscode';

export class PdfPreview {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly resource: vscode.Uri,
        private readonly webviewPanel: vscode.WebviewPanel
    ) {
        const webview = webviewPanel.webview;

        // Include the PDF's parent directory so webview can load it directly by URI
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

        // Watch for file changes and send reload message
        const watcher = vscode.workspace.createFileSystemWatcher(resource.fsPath);
        watcher.onDidChange((e) => {
            if (e.fsPath === this.resource.fsPath) {
                webview.postMessage({ type: 'reload' });
            }
        });
        this.disposables.push(watcher);

        // Handle messages from webview
        webview.onDidReceiveMessage(
            (msg) => {
                if (msg.type === 'reopen-as-text') {
                    vscode.commands.executeCommand(
                        'vscode.openWith',
                        resource,
                        'default'
                    );
                }
            },
            undefined,
            this.disposables
        );
    }

    private getHtml(webview: vscode.Webview): string {
        const mediaUri = (file: string) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'media', file)
            );

        const pdfUri = webview.asWebviewUri(this.resource);
        const nonce = getNonce();
        const config = vscode.workspace.getConfiguration('pdfViewer');
        const defaultZoom = config.get<string>('defaultZoom', 'auto');

        const configData = JSON.stringify({
            pdfUrl: pdfUri.toString(),
            workerSrc: mediaUri('pdf.worker.min.mjs').toString(),
            cMapUrl: mediaUri('cmaps').toString() + '/',
            standardFontDataUrl: mediaUri('standard_fonts').toString() + '/',
            defaultZoom,
        });

        return /* html */ `<!DOCTYPE html>
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
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            font-family: var(--vscode-font-family, sans-serif);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--vscode-editorWidget-background, #252526);
            border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
            flex-shrink: 0;
            flex-wrap: wrap;
        }

        .toolbar button {
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #cccccc);
            border: none;
            padding: 4px 10px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 13px;
            line-height: 1.4;
        }

        .toolbar button:hover {
            background: var(--vscode-button-secondaryHoverBackground, #45494e);
        }

        .toolbar button:disabled {
            opacity: 0.5;
            cursor: default;
        }

        .toolbar input {
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #cccccc);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            padding: 3px 6px;
            width: 50px;
            text-align: center;
            border-radius: 2px;
            font-size: 13px;
        }

        .toolbar select {
            background: var(--vscode-dropdown-background, #3c3c3c);
            color: var(--vscode-dropdown-foreground, #cccccc);
            border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
            padding: 3px 6px;
            border-radius: 2px;
            font-size: 13px;
        }

        .toolbar .separator {
            width: 1px;
            height: 20px;
            background: var(--vscode-editorWidget-border, #454545);
        }

        /* Content area: viewer + loading overlay */
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

        /* pdf_viewer.css provides .pdfViewer .page styles */
        .pdfViewer {
            padding-top: 8px;
        }

        .pdfViewer .page {
            margin: 8px auto;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        /* Text layer selection highlight */
        .textLayer ::selection {
            background: rgba(0, 100, 200, 0.4);
        }

        /* Loading overlay */
        #loading {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-editor-background, #1e1e1e);
            font-size: 16px;
            color: var(--vscode-descriptionForeground, #999);
            z-index: 100;
        }

        #loading.error {
            color: var(--vscode-errorForeground, #f48771);
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="btn-prev" title="Previous Page">&#9664;</button>
        <span style="font-size:13px">
            <input id="page-input" type="number" min="1" value="1">
            / <span id="page-count">-</span>
        </span>
        <button id="btn-next" title="Next Page">&#9654;</button>

        <div class="separator"></div>

        <button id="btn-zoom-out" title="Zoom Out">-</button>
        <select id="zoom-select">
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
        <button id="btn-zoom-in" title="Zoom In">+</button>
    </div>

    <div id="content-area">
        <div id="viewerContainer" tabindex="0">
            <div id="viewer" class="pdfViewer"></div>
        </div>
        <div id="loading">Loading PDF...</div>
    </div>

    <script nonce="${nonce}" src="${mediaUri('viewer.js')}" type="module"></script>
</body>
</html>`;
    }

    public dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
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
