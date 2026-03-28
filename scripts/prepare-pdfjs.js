// Script to copy PDF.js assets from node_modules to media/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nodeModules = path.join(root, 'node_modules', 'pdfjs-dist');
const media = path.join(root, 'media');

function copyFile(src, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    console.log(`  Copied: ${path.relative(root, dest)}`);
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`  Warning: ${src} does not exist, skipping.`);
        return;
    }
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
    console.log(`  Copied dir: ${path.relative(root, dest)} (${entries.length} items)`);
}

console.log('Preparing PDF.js assets...');

// Core library files
const buildFiles = ['pdf.min.mjs', 'pdf.worker.min.mjs'];
for (const file of buildFiles) {
    const src = path.join(nodeModules, 'build', file);
    if (fs.existsSync(src)) {
        copyFile(src, path.join(media, file));
    } else {
        const alt = file.replace('.min', '');
        const altSrc = path.join(nodeModules, 'build', alt);
        if (fs.existsSync(altSrc)) {
            copyFile(altSrc, path.join(media, file));
        } else {
            console.warn(`  Warning: ${file} not found`);
        }
    }
}

// Viewer component (PDFViewer, EventBus, PDFLinkService, PDFFindController)
copyFile(
    path.join(nodeModules, 'web', 'pdf_viewer.mjs'),
    path.join(media, 'pdf_viewer.mjs')
);
copyFile(
    path.join(nodeModules, 'web', 'pdf_viewer.css'),
    path.join(media, 'pdf_viewer.css')
);

// CJK character maps
copyDir(path.join(nodeModules, 'cmaps'), path.join(media, 'cmaps'));

// Standard fonts
const fontsDir = path.join(nodeModules, 'standard_fonts');
if (fs.existsSync(fontsDir)) {
    copyDir(fontsDir, path.join(media, 'standard_fonts'));
}

console.log('Done!');
