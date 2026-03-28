# VS Code PDF Viewer

A lightweight PDF viewer extension for Visual Studio Code, built on [PDF.js](https://mozilla.github.io/pdf.js/).

## Features

- **Automatic PDF opening** — registered as the default editor for `.pdf` files
- **Page navigation** — previous/next buttons, direct page number input
- **Zoom controls** — zoom in/out buttons, dropdown presets (Auto, Page Fit, Page Width, 50%–200%)
- **Ctrl + mouse wheel zoom** — scroll to zoom in and out
- **Text selection** — select and copy text directly from the PDF
- **PDF link support** — internal links (table of contents, footnotes) are clickable
- **File change auto-reload** — automatically reloads when the PDF is modified on disk
- **State persistence** — remembers your zoom level and page position when switching tabs
- **VS Code theme integration** — toolbar adapts to your current light/dark theme

## Requirements

- Visual Studio Code `v1.75.0` or later

## Usage

Open any `.pdf` file in VS Code — the viewer launches automatically.

If VS Code opens the file as raw text instead, right-click the tab and select **Reopen Editor With → PDF Viewer**.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `←` / `PageUp` | Previous page |
| `→` / `PageDown` | Next page |
| `Ctrl + scroll up` | Zoom in |
| `Ctrl + scroll down` | Zoom out |
| `Ctrl + 0` | Reset zoom to Auto |

## Settings

| Setting | Default | Options | Description |
|---|---|---|---|
| `pdfViewer.defaultZoom` | `auto` | `auto`, `page-fit`, `page-width`, `50`–`200` | Default zoom level when opening a PDF |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Visual Studio Code](https://code.visualstudio.com/)

### Setup

```bash
git clone https://github.com/klmtseng/vscode-pdf-viewer.git
cd vscode-pdf-viewer
npm install
npm run build
```

`npm run build` runs two steps:
1. **`prepare-pdfjs`** — copies PDF.js library files from `node_modules` into `media/`
2. **`compile`** — compiles TypeScript source in `src/` to `out/`

### Run & Debug

Open the project folder in VS Code and press **F5**. This launches an Extension Development Host window where you can open any `.pdf` file to test the extension.

### Project Structure

```
vscode-pdf-viewer/
├── src/
│   ├── extension.ts          # Entry point — registers the custom editor provider
│   ├── pdfEditorProvider.ts  # CustomReadonlyEditorProvider implementation
│   └── pdfPreview.ts         # Webview HTML, CSP, config, and file watcher
├── media/
│   └── viewer.js             # Webview-side script — initialises PDFViewer and toolbar
├── scripts/
│   └── prepare-pdfjs.js      # Copies PDF.js assets from node_modules to media/
├── package.json
└── tsconfig.json
```

### Package as `.vsix`

```bash
npm run package
```

Install the generated `.vsix` file locally:

```bash
code --install-extension vscode-pdf-viewer-*.vsix
```

## Architecture

The extension uses VS Code's [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors):

```
VS Code opens .pdf
    │
    ▼
PdfEditorProvider (extension host / Node.js)
    │  generates HTML + passes PDF URI via data-config meta tag
    ▼
Webview (isolated browser context)
    │  loads pdf.min.mjs + pdf_viewer.mjs (PDF.js v4)
    │  PDFViewer renders pages to canvas with text & annotation layers
    ▼
Toolbar (viewer.js)
    │  connects page navigation, zoom controls, Ctrl+wheel to PDFViewer API
```

PDF data is loaded via a direct file URI (no base64 encoding), which keeps memory usage low even for large documents.

## License

[MIT](LICENSE)
