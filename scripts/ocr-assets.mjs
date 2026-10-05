import { cp, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const target = new URL('../public/ocr/', import.meta.url)
await mkdir(target, { recursive: true })
const core = dirname(require.resolve('tesseract.js-core/package.json'))
for (const file of await readdir(core)) {
  if (file.endsWith('.wasm.js') || file.endsWith('.wasm') || file === 'LICENSE') await cp(join(core, file), new URL(file, target))
}
const tess = dirname(require.resolve('tesseract.js/package.json'))
await cp(join(tess, 'dist/worker.min.js'), new URL('worker.min.js', target))
await cp(join(tess, 'dist/worker.min.js.LICENSE.txt'), new URL('worker.LICENSE.txt', target))
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'))
await cp(join(eng, '4.0.0_best_int/eng.traineddata.gz'), new URL('eng.traineddata.gz', target))
