import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

// ESM-Kompatibilität für Pfade
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Zielverzeichnis für das ZIP definieren
const outputDir = path.join(__dirname, 'dist-zip');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Version aus dist/manifest.json oder package.json auslesen
let version = '';
try {
  const manifestPath = path.join(__dirname, 'dist', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    version = manifest.version || '';
  }
} catch (e) {
  // Ignorieren und Fallback nutzen
}

if (!version) {
  try {
    const packagePath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      version = pkg.version || '';
    }
  } catch (e) {
    // Ignorieren
  }
}

const zipFilename = version ? `leanprompts-v${version}.zip` : 'leanprompts-extension.zip';
const outputPath = path.join(outputDir, zipFilename);
const output = fs.createWriteStream(outputPath);
const archive = new ZipArchive({
  zlib: { level: 9 } // Höchste Kompressionsstufe
});

output.on('close', () => {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`\x1b[32m✔ ZIP erfolgreich erstellt: ${outputPath} (${sizeInMB} MB)\x1b[0m`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Inhalt von "dist/" packen und unerwünschte Dateien/Ordner ausschließen
archive.glob('**/*', {
  cwd: 'dist/',
  ignore: [
    '.vite',          // Ignoriert den internen Vite-Metadatenordner
    '.vite/**',       // Ignoriert alle Inhalte im Vite-Metadatenordner
    '**/.DS_Store',   // Ignoriert macOS-Systemdateien
    '**/Thumbs.db'    // Ignoriert Windows-Systemdateien
  ]
});

// Archivierung abschließen
archive.finalize();
