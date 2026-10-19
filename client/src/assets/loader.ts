import { z } from 'zod'
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
  status: number
  statusText: string
  url: string

  override name: string

  /**
   * @param {number} status
   * @param {string} statusText
   * @param {string} url
   */
  constructor(status: number, statusText: string, url: string) {
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
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNonRetryable(err: unknown) {
  if (!err) return false
  if (err instanceof Error && err.name === 'AbortError') return true
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
export async function withRetry<T>(
  fn: (context: { attempt: number; signal?: AbortSignal }) => Promise<T>,
  {
    attempts = 3,
    baseMs = 200,
    maxMs = 2000,
    signal,
    shouldRetry = (err) => !isNonRetryable(err),
  }: {
    attempts?: number
    baseMs?: number
    maxMs?: number
    signal?: AbortSignal
    shouldRetry?: (err: unknown) => boolean
  } = {},
): Promise<T> {
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
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null

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
 * @returns {Promise<unknown>}
 */
export async function fetchJson(
  url: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<unknown> {
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
export function loadImage(
  url: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Image load aborted', 'AbortError'))
    }

    const img = new Image()
    let cleanup: (() => void) | null = null

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
export async function loadAudio(
  ctx: AudioContext | null | undefined,
  url: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<AudioBuffer | null> {
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
  return await new Promise<AudioBuffer>((resolve, reject) => {
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
 * @param {(info: LoadProgress) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.sequential=false] - Чи завантажувати послідовно (для бенчмарку)
 * @returns {Promise<{ manifest: Object, spritesheet: HTMLImageElement, frames: Object, sounds: Record<string, AudioBuffer>, arenaConfig: Object }>}
 */

const FrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
})
const ManifestSchema = z.object({
  version: z.string().optional(),
  sprites: z
    .object({ sheet: z.string(), frames: z.record(z.string(), FrameSchema) })
    .optional(),
  sounds: z.record(z.string(), z.string()).optional(),
  arena: z.string().optional(),
})
const ArenaSchema = z
  .object({
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .catchall(z.unknown())
export type SpriteFrame = z.infer<typeof FrameSchema>
type Manifest = z.infer<typeof ManifestSchema>
export type AssetItem = {
  category: string
  key: string
  type?: 'image' | 'audio' | 'json'
  url: string
}
export interface LoadProgress {
  progress: number
  loaded: number
  total: number
  currentItem: string
  item: AssetItem | null
}
export interface LoadedAssets {
  manifest: Manifest
  spritesheet: HTMLImageElement | null
  frames: Record<string, SpriteFrame>
  sounds: Record<string, AudioBuffer | null>
  arenaConfig: z.infer<typeof ArenaSchema> | null
}
export async function loadAll(
  manifestOrUrl: string | Manifest,
  {
    ctx,
    onProgress,
    signal,
    sequential = false,
  }: {
    ctx?: AudioContext | null
    onProgress?: (info: LoadProgress) => void
    signal?: AbortSignal
    sequential?: boolean
  } = {},
): Promise<LoadedAssets> {
  const raw =
    typeof manifestOrUrl === 'string'
      ? await withRetry(() => fetchJson(manifestOrUrl, { signal }), { signal })
      : manifestOrUrl
  const manifest = ManifestSchema.parse(raw)
  const assets: LoadedAssets = {
    manifest,
    spritesheet: null,
    frames: manifest.sprites?.frames ?? {},
    sounds: {},
    arenaConfig: null,
  }
  const items: AssetItem[] = []
  if (manifest.sprites)
    items.push({
      category: 'sprites',
      key: 'sheet',
      type: 'image',
      url: manifest.sprites.sheet,
    })
  for (const [key, url] of Object.entries(manifest.sounds ?? {}))
    items.push({ category: 'sounds', key, type: 'audio', url })
  if (manifest.arena)
    items.push({
      category: 'arena',
      key: 'arena',
      type: 'json',
      url: manifest.arena,
    })
  let loaded = 0
  const progress = (item: AssetItem | null) =>
    onProgress?.({
      progress: items.length ? loaded / items.length : 1,
      loaded,
      total: items.length,
      currentItem: item ? `[${item.category}]: ${item.key}` : 'Loading...',
      item,
    })
  progress(null)
  const processItem = async (item: AssetItem) => {
    progress(item)
    if (item.type === 'image') {
      assets.spritesheet = await withRetry(
        () => loadImage(item.url, { signal }),
        { signal },
      ).catch((error: unknown) => {
        if (signal?.aborted) throw error
        console.warn('[loader] Image fallback', error)
        return null
      })
    } else if (item.type === 'audio') {
      assets.sounds[item.key] = await withRetry(
        () => loadAudio(ctx, item.url, { signal }),
        { signal },
      ).catch((error: unknown) => {
        if (signal?.aborted) throw error
        console.warn('[loader] Audio fallback', error)
        return null
      })
    } else if (item.type === 'json') {
      assets.arenaConfig = ArenaSchema.parse(
        await withRetry(() => fetchJson(item.url, { signal }), { signal }),
      )
    }
    loaded++
    progress(item)
  }
  if (sequential) {
    for (const item of items) await processItem(item)
  } else {
    await Promise.all(items.map(processItem))
  }
  return assets
}
