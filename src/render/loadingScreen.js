/**
 * Dogfight — Екран завантаження ассетів (Loading Screen) на Canvas (Lab 03)
 *
 * Малює реальний індикатор прогресу (0-100%), статус поточного файлу,
 * що завантажується, та неонову стилізацію.
 */

export function renderLoadingScreen(
  ctx,
  width,
  height,
  {
    progress = 0,
    loaded = 0,
    total = 0,
    currentItem = 'Ініціалізація підсистем...',
    error = null,
  } = {},
) {
  ctx.save()

  // 1. Темний космічний фон
  ctx.fillStyle = '#07090e'
  ctx.fillRect(0, 0, width, height)

  // 2. Фонова сітка
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)'
  ctx.lineWidth = 1
  const step = 48
  ctx.beginPath()
  for (let x = 0; x < width; x += step) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
  }
  for (let y = 0; y < height; y += step) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
  }
  ctx.stroke()

  const centerX = width / 2
  const centerY = height / 2

  // 3. Центральна рамка
  const boxW = Math.min(540, width - 40)
  const boxH = 260
  const boxX = centerX - boxW / 2
  const boxY = centerY - boxH / 2

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
  if (ctx.roundRect) {
    ctx.roundRect(boxX, boxY, boxW, boxH, 12)
  } else {
    ctx.rect(boxX, boxY, boxW, boxH)
  }
  ctx.fill()

  ctx.strokeStyle = error ? '#ef4444' : 'rgba(56, 189, 248, 0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 4. Заголовок
  ctx.textAlign = 'center'
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.fillStyle = '#38bdf8'
  ctx.fillText('LAB 03 // ASSET PIPELINE & PROMISES', centerX, boxY + 40)

  ctx.font = 'bold 22px ui-monospace, sans-serif'
  ctx.fillStyle = '#f8fafc'
  ctx.fillText('ЗАВАНТАЖЕННЯ РЕСУРСІВ ГРИ', centerX, boxY + 72)

  // 5. Прогрес-бар
  const barW = boxW - 64
  const barH = 14
  const barX = centerX - barW / 2
  const barY = boxY + 112

  // Підкладка бару
  ctx.fillStyle = '#1e293b'
  if (ctx.roundRect) {
    ctx.roundRect(barX, barY, barW, barH, 7)
  } else {
    ctx.rect(barX, barY, barW, barH)
  }
  ctx.fill()

  // Заповнення бару
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const fillW = Math.max(0, barW * clampedProgress)
  if (fillW > 0) {
    const gradient = ctx.createLinearGradient(barX, 0, barX + fillW, 0)
    gradient.addColorStop(0, '#0284c7')
    gradient.addColorStop(1, '#38bdf8')
    ctx.fillStyle = gradient

    ctx.shadowColor = '#38bdf8'
    ctx.shadowBlur = 10
    if (ctx.roundRect) {
      ctx.roundRect(barX, barY, fillW, barH, 7)
    } else {
      ctx.rect(barX, barY, fillW, barH)
    }
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 6. Текстовий статус прогресу
  ctx.font = 'bold 13px ui-monospace, monospace'
  ctx.fillStyle = '#38bdf8'
  ctx.textAlign = 'left'
  ctx.fillText(`${Math.round(clampedProgress * 100)}%`, barX, barY + barH + 26)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Файли: ${loaded} / ${total}`, barX + barW, barY + barH + 26)

  // 7. Поточний файл або помилка
  ctx.textAlign = 'center'
  ctx.font = '12px ui-monospace, monospace'
  if (error) {
    ctx.fillStyle = '#ef4444'
    ctx.fillText(
      `Помилка: ${error.message || error}`,
      centerX,
      barY + barH + 60,
    )
  } else {
    ctx.fillStyle = '#cbd5e1'
    const shortItem =
      currentItem.length > 50 ? '...' + currentItem.slice(-47) : currentItem
    ctx.fillText(shortItem, centerX, barY + barH + 60)
  }

  ctx.restore()
}
