import * as vscode from 'vscode';
import { PdfPreview } from './pdfPreview';

export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static readonly viewType = 'pdfViewer.preview';

    constructor(private readonly extensionUri: vscode.Uri) {}

    public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
        return { uri, dispose: () => {} };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const preview = new PdfPreview(
            this.extensionUri,
            document.uri,
            webviewPanel
        );

        webviewPanel.onDidDispose(() => {
            preview.dispose();
        });
    }
}
