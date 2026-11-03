const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'Escape',
  'KeyK',
  'KeyH',
  'KeyP',
  'KeyF',
  'Digit1',
  'Digit2',
  'Digit3',
])

/**
 * Клавіатура як замикання (closure):
 * Змінні `down` і `pressed` інкапсульовані у лексичній області видимості createInput,
 * недоступні ззовні та захищені від сторонніх мутацій.
 *
 * Особливості:
 * - justPressed: клавіша натиснута з моменту попереднього виклику consume().
 * - e.repeat: ігнорується, щоб автоповтор ОС не генерував нові натискання.
 * - blur: очищає стан, якщо гравець переключився на інше вікно.
 * - destroy: знімає слухачі подій для уникнення витоків пам'яті.
 */
export function createInput(target: Window) {
  const down = new Set()
  const pressed = new Set()
  const touchDown = new Set<string>()
  const touchControls = document.createElement('div')
  touchControls.className = 'touch-controls'
  for (const [code, label] of [
    ['ArrowLeft', '↶'],
    ['ArrowUp', 'Thrust'],
    ['ArrowRight', '↷'],
    ['Space', 'Fire'],
    ['Escape', 'Lobby'],
  ]) {
    if (!code || !label) continue
    const button = document.createElement('button')
    button.textContent = label
    button.type = 'button'
    button.setAttribute('aria-label', label)
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      touchDown.add(code)
      pressed.add(code)
    })
    const release = () => {
      touchDown.delete(code)
      pressed.delete(code)
    }
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
    button.addEventListener('lostpointercapture', release)
    touchControls.append(button)
  }
  document.body.append(touchControls)

  function onKeyDown(e: KeyboardEvent) {
    if (
      e.target instanceof Element &&
      e.target.closest('input, textarea, [contenteditable]')
    )
      return
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault()
    }
    if (e.repeat) return

    if (!down.has(e.code)) {
      pressed.add(e.code)
    }
    down.add(e.code)
  }

  function onKeyUp(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault()
    }
    down.delete(e.code)
    pressed.delete(e.code)
  }

  function onBlur() {
    down.clear()
    pressed.clear()
    touchDown.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    isDown: (code: string) => down.has(code) || touchDown.has(code),
    justPressed: (code: string) => pressed.has(code),
    consume() {
      pressed.clear()
    },
    destroy() {
      touchControls.remove()
      touchDown.clear()
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      down.clear()
      pressed.clear()
    },
  }
}
