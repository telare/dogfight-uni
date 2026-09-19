/**
 * Dogfight — Модуль завантаження ассетів (Asset Pipeline)
 * Лабораторна робота 3: Promises, async/await та екран завантаження
 *
 * Особливості реалізації:
 * 1. loadImage / loadAudio / loadJson з підтримкою AbortSignal для негайного переривання.
 * 2. fetchJson валідує response.ok і викидає HttpError.
 * 3. withRetry реалізує експоненційний backoff + випадковий jitter, і НІКОЛИ не повторює помилки 4xx.
 * 4. loadAll виконує паралельне завантаження через Promise.all з детальним відстеженням прогресу
 *    та підтримкою послідовного режиму для бенчмарків.
 */

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} statusText
   * @param {string} url
   */
  constructor(status, statusText, url) {
    super(`HTTP ${status} (${statusText || 'Error'}) loading ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.url = url
  }
}

/**
 * Перевірка, чи є помилка непоправною для повторних спроб:
 * - 4xx помилки (404 Not Found, 403 Forbidden тощо) — не є транзієнтними, повтор марний
 * - AbortError — користувач або таймаут свідомо скасували операцію
 *
 * @param {Error|any} err
 * @returns {boolean}
 */
export function isNonRetryable(err) {
  if (!err) return false
  if (err.name === 'AbortError') return true
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
    return true
  }
  return false
}

/**
 * Обертка для виконання асинхронної операції з експоненційним бекоффом та джиттером.
 *
 * @template T
 * @param {(context: { attempt: number, signal?: AbortSignal }) => Promise<T>} fn
 * @param {Object} [options]
 * @param {number} [options.attempts=3] - Максимальна кількість спроб
 * @param {number} [options.baseMs=200] - Базовий інтервал затримки у мілісекундах
 * @param {number} [options.maxMs=2000] - Максимальний інтервал затримки
 * @param {AbortSignal} [options.signal] - Сигнал скасування
 * @param {(err: Error) => boolean} [options.shouldRetry] - Функція фільтрації повтору
 * @returns {Promise<T>}
 */
export async function withRetry(
  fn,
  {
    attempts = 3,
    baseMs = 200,
    maxMs = 2000,
    signal,
    shouldRetry = (err) => !isNonRetryable(err),
  } = {},
) {
  let attempt = 0
  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Operation aborted', 'AbortError')
    }

    try {
      return await fn({ attempt, signal })
    } catch (err) {
      attempt++
      if (attempt >= attempts || !shouldRetry(err)) {
        throw err
      }

      // Розрахунок затримки: експоненційне зростання + випадковий джиттер (уникнення thundering herd)
      const expDelay = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1))
      const jitter = Math.random() * (baseMs * 0.5)
      const delayMs = expDelay + jitter

      // Скасовний таймер через AbortSignal
      await new Promise((resolve, reject) => {
        let timer = null

        const onAbort = () => {
          if (timer) clearTimeout(timer)
          reject(new DOMException('Retry delay aborted', 'AbortError'))
        }

        if (signal?.aborted) {
          onAbort()
          return
        }

        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, delayMs)

        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
}

/**
 * Безпечне отримання JSON з валідацією response.ok.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, url)
  }
  return await response.json()
}

/**
 * Завантаження зображення через обгортку HTMLImageElement у Promise.
 * Підтримує AbortSignal для очищення ресурсів та скасування.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Image load aborted', 'AbortError'))
    }

    const img = new Image()
    let cleanup = null

    const onAbort = () => {
      cleanup?.()
      // Анулювання джерела для зупинки мережевого завантаження у рушії браузера
      img.src = ''
      reject(new DOMException('Image load aborted', 'AbortError'))
    }

    const onLoad = () => {
      cleanup?.()
      resolve(img)
    }

    const onError = () => {
      cleanup?.()
      reject(new Error(`Failed to load image: ${url}`))
    }

    cleanup = () => {
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }

    img.addEventListener('load', onLoad)
    img.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })

    img.src = url
  })
}

/**
 * Завантаження та декодування аудіофайлу у Web Audio AudioBuffer.
 *
 * @param {AudioContext} ctx - Контекст Web Audio
 * @param {string} url - Шлях до аудіофайлу
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<AudioBuffer>}
 */
export async function loadAudio(ctx, url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, url)
  }

  const arrayBuffer = await response.arrayBuffer()
  if (signal?.aborted) {
    throw new DOMException('Audio load aborted', 'AbortError')
  }

  if (!ctx) {
    return null
  }

  // Декодування сирих байтів у PCM AudioBuffer
  return await new Promise((resolve, reject) => {
    try {
      const res = ctx.decodeAudioData(
        arrayBuffer.slice(0),
        (buffer) => resolve(buffer),
        (err) => reject(err || new Error(`Failed to decode audio: ${url}`)),
      )
      if (res && typeof res.then === 'function') {
        res.then(resolve).catch(reject)
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Одночасне або послідовне завантаження всіх ігрових ассетів із маніфесту.
 *
 * @param {string|Object} manifestOrUrl - Об'єкт маніфесту або URL до manifest.json
 * @param {Object} [options]
 * @param {AudioContext} [options.ctx]
 * @param {(info: { progress: number, loaded: number, total: number, currentItem: string, item: any }) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.sequential=false] - Чи завантажувати послідовно (для бенчмарку)
 * @returns {Promise<{ manifest: Object, spritesheet: HTMLImageElement, frames: Object, sounds: Record<string, AudioBuffer>, arenaConfig: Object }>}
 */
export async function loadAll(
  manifestOrUrl,
  { ctx, onProgress, signal, sequential = false } = {},
) {
  let manifest = manifestOrUrl
  if (typeof manifestOrUrl === 'string') {
    onProgress?.({
      progress: 0,
      loaded: 0,
      total: 1,
      currentItem: `Маніфест: ${manifestOrUrl}`,
      item: { category: 'manifest', key: 'manifest', url: manifestOrUrl },
    })
    manifest = await withRetry(() => fetchJson(manifestOrUrl, { signal }), {
      signal,
    })
  }

  // Збирання списку ассетів
  const items = []

  if (manifest.sprites?.sheet) {
    items.push({
      category: 'sprites',
      key: 'sheet',
      type: 'image',
      url: manifest.sprites.sheet,
    })
  }

  if (manifest.sounds) {
    for (const [key, url] of Object.entries(manifest.sounds)) {
      items.push({
        category: 'sounds',
        key,
        type: 'audio',
        url,
      })
    }
  }

  if (manifest.arena) {
    items.push({
      category: 'arena',
      key: 'arena',
      type: 'json',
      url: manifest.arena,
    })
  }

  const total = items.length
  let loaded = 0

  onProgress?.({
    progress: 0,
    loaded: 0,
    total,
    currentItem: 'Початок завантаження...',
    item: null,
  })

  // Функція завантаження окремого ассету з прогресом
  const processItem = async (item) => {
    onProgress?.({
      progress: loaded / total,
      loaded,
      total,
      currentItem: `Завантаження [${item.category}]: ${item.key}`,
      item,
    })

    let result = null
    if (item.type === 'image') {
      try {
        result = await withRetry(() => loadImage(item.url, { signal }), {
          signal,
        })
      } catch (err) {
        console.warn(`[loader] Фолбек для зображення ${item.key}:`, err)
        result = null
      }
    } else if (item.type === 'audio') {
      try {
        result = await withRetry(() => loadAudio(ctx, item.url, { signal }), {
          signal,
        })
      } catch (err) {
        console.warn(`[loader] Фолбек для аудіо ${item.key}:`, err)
        result = null
      }
    } else if (item.type === 'json') {
      result = await withRetry(() => fetchJson(item.url, { signal }), {
        signal,
      })
    }

    loaded++
    onProgress?.({
      progress: loaded / total,
      loaded,
      total,
      currentItem: `Готово [${item.category}]: ${item.key}`,
      item,
    })

    return { item, result }
  }

  let results = []

  if (sequential) {
    // Послідовне завантаження через послідовний await у циклі
    for (const item of items) {
      results.push(await processItem(item))
    }
  } else {
    // Паралельне завантаження через Promise.all (з обгортками для відліку прогресу)
    const tasks = items.map((item) => processItem(item))
    results = await Promise.all(tasks)
  }

  const loadedAssets = {
    manifest,
    spritesheet: null,
    frames: manifest.sprites?.frames || {},
    sounds: {},
    arenaConfig: null,
  }

  for (const { item, result } of results) {
    if (item.type === 'image') {
      loadedAssets.spritesheet = result
    } else if (item.type === 'audio') {
      loadedAssets.sounds[item.key] = result
    } else if (item.type === 'json') {
      loadedAssets.arenaConfig = result
    }
  }

  return loadedAssets
}
