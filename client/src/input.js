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
export function createInput(target) {
  const down = new Set()
  const pressed = new Set()

  function onKeyDown(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault()
    }
    if (e.repeat) return

    if (!down.has(e.code)) {
      pressed.add(e.code)
    }
    down.add(e.code)
  }

  function onKeyUp(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault()
    }
    down.delete(e.code)
    pressed.delete(e.code)
  }

  function onBlur() {
    down.clear()
    pressed.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressed.has(code),
    consume() {
      pressed.clear()
    },
    destroy() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      down.clear()
      pressed.clear()
    },
  }
}
