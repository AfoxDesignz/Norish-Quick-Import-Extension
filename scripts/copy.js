const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

function copyFile(srcPath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
}

// ensure dist exists
fs.mkdirSync(dist, { recursive: true });

// copy html files from src to dist
const files = fs.readdirSync(src);
for (const f of files) {
  if (f.endsWith('.html')) {
    copyFile(path.join(src, f), path.join(dist, f));
  }
}

// copy manifest.json
const manifestSrc = path.join(src, 'manifest.json');
if (fs.existsSync(manifestSrc)) {
  copyFile(manifestSrc, path.join(dist, 'manifest.json'));
}

// copy icons folder
const iconsSrc = path.join(src, 'icons');
const iconsDest = path.join(dist, 'icons');
if (fs.existsSync(iconsSrc)) {
  fs.mkdirSync(iconsDest, { recursive: true });
  const icons = fs.readdirSync(iconsSrc);
  for (const ic of icons) {
    const s = path.join(iconsSrc, ic);
    const d = path.join(iconsDest, ic);
    copyFile(s, d);
  }
}

console.log('Copied static files to dist/');
