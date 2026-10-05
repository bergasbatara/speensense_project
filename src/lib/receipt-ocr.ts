import type { Worker } from 'tesseract.js'
import { MAX_RECEIPT_TEXT } from './quick-entry'
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

export async function recognizeReceipt(file: File, signal: AbortSignal, progress: (message: string) => void): Promise<string> {
  if (file.size > MAX_RECEIPT_BYTES) throw new Error('Receipt photo must be 10 MB or smaller.')
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP receipt photo.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be decoded. Choose a valid PNG, JPEG, or WebP photo.') })
  const pixels = bitmap.width * bitmap.height
  bitmap.close()
  if (pixels > 12_000_000) throw new Error('Photo must be at most 12 megapixels. Crop it to the receipt and try again.')
  signal.throwIfAborted()
  let worker: Worker | undefined
  let timedOut = false
  let rejectStop: (reason: Error) => void = () => undefined
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject })
  const stop = () => { void worker?.terminate(); rejectStop(new Error(timedOut ? 'Receipt reading timed out. Try a smaller, clearer photo or paste receipt text.' : 'Receipt reading cancelled.')) }
  signal.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(() => { timedOut = true; stop() }, 90_000)
  const run = async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js')
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js', corePath: `${location.origin}/ocr`, langPath: `${location.origin}/ocr`,
      workerBlobURL: false, cacheMethod: 'none',
      logger: ({ status, progress: fraction }) => { if (!signal.aborted && !timedOut) progress(`${status} — ${Math.round(fraction * 100)}%`) },
      errorHandler: () => rejectStop(new Error('Receipt reading failed. Try a clearer photo or paste receipt text.')),
    })
    if (signal.aborted || timedOut) { await worker.terminate(); throw new Error('Receipt reading cancelled.') }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const { data } = await worker.recognize(file)
    if (!data.text.trim()) throw new Error('No receipt text found. Try a clearer photo or paste the receipt text.')
    if (data.text.length > MAX_RECEIPT_TEXT) throw new Error('Receipt text is too long. Crop the photo and try again.')
    return data.text
  }
  try { return await Promise.race([run(), stopped]) }
  finally { clearTimeout(timer); signal.removeEventListener('abort', stop); await worker?.terminate() }
}
