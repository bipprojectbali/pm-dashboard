// Client-side PDF generator: captures each .page-section as a high-DPR PNG
// and packs one section per A4 page into a jsPDF document. Acts like a
// screenshot — the page's live theme (dark or light) is preserved as-is.

export async function generateReportPdf(
  rootEl: HTMLElement,
  filename: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { toPng } = await import('html-to-image')
  const { default: jsPDF } = await import('jspdf')

  const sections = Array.from(rootEl.querySelectorAll<HTMLElement>('.page-section'))
  if (sections.length === 0) throw new Error('No .page-section elements found')

  const bodyBg = getComputedStyle(document.body).backgroundColor || '#ffffff'
  const pageFill = rgbStringToArray(bodyBg) ?? [255, 255, 255]

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const gap = 4
  const contentW = pageW - 2 * margin
  const contentH = pageH - 2 * margin

  const fillPage = () => {
    pdf.setFillColor(pageFill[0], pageFill[1], pageFill[2])
    pdf.rect(0, 0, pageW, pageH, 'F')
  }

  let pageStarted = false
  let yCursor = margin

  for (let i = 0; i < sections.length; i++) {
    const el = sections[i]
    el.getBoundingClientRect()

    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: bodyBg,
      cacheBust: true,
      skipAutoScale: true,
      style: { margin: '0', boxShadow: 'none' },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true
        return node.getAttribute('data-html2canvas-ignore') !== 'true'
      },
    })

    const dim = await loadImageSize(dataUrl)
    const aspect = dim.h / dim.w
    let wDraw = contentW
    let hDraw = wDraw * aspect

    // Section taller than a full page — scale to fit height, center horizontally,
    // and force it onto its own fresh page.
    if (hDraw > contentH) {
      const scale = contentH / hDraw
      wDraw = wDraw * scale
      hDraw = contentH
      if (pageStarted) pdf.addPage()
      fillPage()
      pageStarted = true
      pdf.addImage(dataUrl, 'PNG', margin + (contentW - wDraw) / 2, margin, wDraw, hDraw, undefined, 'FAST')
      yCursor = margin + contentH + gap
      onProgress?.(i + 1, sections.length)
      continue
    }

    const spacing = pageStarted && yCursor > margin ? gap : 0
    const needsNewPage = !pageStarted || yCursor + spacing + hDraw > margin + contentH

    if (needsNewPage) {
      if (pageStarted) pdf.addPage()
      fillPage()
      pageStarted = true
      yCursor = margin
    } else {
      yCursor += spacing
    }

    pdf.addImage(dataUrl, 'PNG', margin, yCursor, wDraw, hDraw, undefined, 'FAST')
    yCursor += hDraw
    onProgress?.(i + 1, sections.length)
  }

  pdf.save(filename)
}

function loadImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

function rgbStringToArray(s: string): [number, number, number] | null {
  const m = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}
