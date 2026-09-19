/**
 * Ініціалізація Canvas з урахуванням devicePixelRatio.
 * Запобігає розмиттю графіки на HiDPI/Retina екранах, масштабуючи внутрішній
 * буфер canvas до фізичних пікселів, зберігаючи CSS-розміри у логічних пікселях.
 */
export function createCanvas(canvas, { onResize } = {}) {
  const ctx = canvas.getContext('2d')
  const size = { w: 0, h: 0 }

  function resize() {
    const dpr = window.devicePixelRatio || 1
    size.w = window.innerWidth
    size.h = window.innerHeight

    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    onResize?.(size, ctx)
  }

  window.addEventListener('resize', resize)
  resize()

  return {
    ctx,
    size,
    destroy() {
      window.removeEventListener('resize', resize)
    },
  }
}
