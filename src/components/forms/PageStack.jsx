import { useEffect, useRef, useState } from 'react'

/**
 * The pages of a form, one under the other, each with its boxes laid over it.
 *
 * Boxes are positioned in PERCENT of their page, so they sit in the same place
 * at any width — the template editor on a monitor, the client's phone, the PDF.
 * `renderOverlay(pageIndex, pageWidthPx)` returns the boxes for one page; the
 * width lets a box size its text to the page it is on.
 */
export default function PageStack({ pages, renderOverlay, className = '', pageRef }) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {pages.map((p, i) => (
        <Page key={i} index={i} page={p} renderOverlay={renderOverlay} pageRef={pageRef} />
      ))}
    </div>
  )
}

function Page({ index, page, renderOverlay, pageRef }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={(el) => {
        ref.current = el
        pageRef?.(index, el)
      }}
      data-page={index}
      // Paper stays paper in night mode — exact colours, untouched by the remap.
      className="relative w-full overflow-hidden rounded-sm bg-[#ffffff] shadow-[0_2px_18px_-6px_rgba(15,23,42,0.35)] ring-1 ring-[#e2e8f0]"
      style={{ aspectRatio: `${page.w} / ${page.h}` }}
    >
      {page.url ? (
        <img
          src={page.url}
          alt={`עמוד ${index + 1}`}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-[#f1f5f9]" />
      )}
      {width > 0 && renderOverlay?.(index, width)}
      <span className="pointer-events-none absolute bottom-1.5 start-2 rounded bg-[#ffffff]/80 px-1.5 text-[10px] font-bold text-[#94a3b8]">
        {index + 1}
      </span>
    </div>
  )
}

/** Where a box sits on its page, as CSS. */
export const boxStyle = (f) => ({
  left: `${f.x * 100}%`,
  top: `${f.y * 100}%`,
  width: `${f.w * 100}%`,
  height: `${f.h * 100}%`,
})
