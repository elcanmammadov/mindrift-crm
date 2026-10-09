// Copies the offline OCR engine (tesseract.js worker + wasm core + aze/eng language data)
// into public/tesseract so camera OCR works without internet access or an API key.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const out = path.resolve('public/tesseract');
fs.mkdirSync(path.join(out, 'lang'), { recursive: true });

const files = [
  [path.join(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'].map((f) => [path.join(pkgDir('tesseract.js-core'), f), f]),
  ...['aze', 'eng'].map((l) => [path.join(pkgDir(`@tesseract.js-data/${l}`), `4.0.0_best_int/${l}.traineddata.gz`), `lang/${l}.traineddata.gz`]),
];
for (const [from, to] of files) {
  const dest = path.join(out, to);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(from).size) fs.copyFileSync(from, dest);
}
console.log(`OCR assets ready in ${path.relative(process.cwd(), out)}`);
