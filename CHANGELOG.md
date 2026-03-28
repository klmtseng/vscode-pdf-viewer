# Changelog

## [0.2.0] - 2025

### Added
- Ctrl+F search bar with match count, case-sensitive and whole-word options
- Thumbnail sidebar with clickable page previews
- Print support (File → Print or toolbar button)
- Scroll mode toggle (continuous vertical scroll / single-page mode)
- Ctrl + mouse wheel zoom

### Changed
- PDF loading switched from base64 encoding to direct file URI (lower memory usage)
- Text layer now uses `PDFViewer` component from PDF.js for accurate text selection and PDF link support
- File watcher uses `resource.fsPath` for reliable change detection

### Fixed
- Text selection positioning was incorrect (baseline vs top-of-element offset)
- `rendering` flag could get permanently stuck on error
- File watcher pattern was unreliable on Windows paths

## [0.1.0] - 2025

### Added
- Initial release
- PDF rendering via PDF.js (pdfjs-dist v4)
- Page navigation (previous/next, direct page input)
- Zoom controls (buttons, dropdown presets, keyboard shortcuts)
- Text selection
- VS Code theme integration
- File change auto-reload
- State persistence (zoom level and page position)
