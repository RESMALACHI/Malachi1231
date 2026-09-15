// A template PDF as page images — made once, when the office uploads it.
//
// Every screen after that (the editor, the agent's filler, the client's signing
// page) shows these images, so a client on a phone downloads a few pictures and
// never a PDF engine. The original PDF is kept too: the SIGNED copy is stamped
// onto it, so the contract text in the final document is the office's own
// vector PDF, untouched.
//
// pdf.js is loaded only here, on demand — it is large and only the template
// manager ever needs it.

const TARGET_WIDTH = 1500 // px — sharp on a phone at 2x zoom, still light

export async function renderPdfPages(file, { onProgress } = {}) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages = []

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const base = page.getViewport({ scale: 1 }) // PDF points
    const scale = TARGET_WIDTH / base.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // intent 'print': the display intent paces rendering on requestAnimationFrame,
    // which stops in a background tab — an upload the manager switched away
    // from would hang forever at "preparing page 1".
    await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
    pages.push({ w: base.width, h: base.height, blob })
    onProgress?.(n, doc.numPages)
  }
  return pages
}
