import * as vscode from 'vscode';
import { PdfEditorProvider } from './pdfEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new PdfEditorProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            PdfEditorProvider.viewType,
            provider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: true,
            }
        )
    );
}

export function deactivate() {}
