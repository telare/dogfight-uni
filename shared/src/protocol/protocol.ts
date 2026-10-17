/**
 * Dogfight Protocol — одне джерело правди для всіх повідомлень (Lab 06 M2)
 *
 * Архітектура:
 * 1. Zod-схеми визначають форму та обмеження кожного повідомлення
 * 2. TypeScript-типи виводяться з схем через z.infer (один запис — один тип)
 * 3. parseClientMessage() ніколи не кидає виняток — завжди повертає Result
 * 4. Всі switch по type/kind завершуються never-захисником від пропущених гілок
 */

import { z } from 'zod'

// ── Спільні примітиви ──────────────────────────────────────────────────────

const SeqSchema = z.number().int().nonnegative()
const TickSchema = z.number().int().nonnegative()
const EntityIdSchema = z.number().int().positive()

// ── Схеми вхідних повідомлень клієнта ─────────────────────────────────────

const JoinSchema = z.object({
  type: z.literal('join'),
  room: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(32).default('Pilot'),
})

const LeaveSchema = z.object({
  type: z.literal('leave'),
})

const InputSchema = z.object({
  type: z.literal('input'),
  seq: SeqSchema.default(0),
  tick: TickSchema.default(0),
  thrust: z.number().min(0).max(1).default(0),
  turn: z.number().min(-1).max(1).default(0),
  fire: z.boolean().default(false),
})

const ChatSchema = z.object({
  type: z.literal('chat'),
  text: z.string().trim().min(1).max(200),
})

const PingSchema = z.object({
  type: z.literal('ping'),
  clientTime: z.number().default(0),
})

const ConfigSchema = z.object({
  type: z.literal('config'),
  latencyMs: z.number().min(0).max(1000).default(0),
  jitterMs: z.number().min(0).max(200).default(0),
  dropRate: z.number().min(0).max(0.5).default(0),
  codec: z.enum(['binary', 'json']).default('binary'),
})

/** Discriminated union — одна схема для всіх вхідних повідомлень */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinSchema,
  LeaveSchema,
  InputSchema,
  ChatSchema,
  PingSchema,
  ConfigSchema,
])

/** Виведений TypeScript-тип — ONE source of truth */
export type ClientMessage = z.infer<typeof ClientMessageSchema>

// Вузькі типи для кожного виду повідомлень
export type JoinMessage = z.infer<typeof JoinSchema>
export type LeaveMessage = z.infer<typeof LeaveSchema>
export type InputMessage = z.infer<typeof InputSchema>
export type ChatMessage = z.infer<typeof ChatSchema>
export type PingMessage = z.infer<typeof PingSchema>
export type ConfigMessage = z.infer<typeof ConfigSchema>

// ── Схеми вхідного вводу (Input санітайзація) ─────────────────────────────

export const InputFrameSchema = z.object({
  seq: SeqSchema.default(0),
  tick: TickSchema.default(0),
  thrust: z.number().min(0).max(1).default(0),
  turn: z.number().min(-1).max(1).default(0),
  fire: z.boolean().default(false),
})

export type InputFrame = z.infer<typeof InputFrameSchema>

// ── ServerConfig через Zod ─────────────────────────────────────────────────

export const ServerConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_DIR: z.string().default('logs'),
  MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(32768),
  RATE_LIMIT_PER_SEC: z.coerce.number().int().positive().default(15),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  JOIN_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  BUFFERED_AMOUNT_THRESHOLD: z.coerce.number().int().positive().default(65536),
}) satisfies z.ZodType<ServerConfig>

export type ServerConfig = {
  PORT: number
  HOST: string
  NODE_ENV: 'development' | 'production' | 'test'
  LOG_DIR: string
  MAX_PAYLOAD_BYTES: number
  RATE_LIMIT_PER_SEC: number
  HEARTBEAT_INTERVAL_MS: number
  JOIN_TIMEOUT_MS: number
  BUFFERED_AMOUNT_THRESHOLD: number
}

// ── Result-тип для parseClientMessage ─────────────────────────────────────

export type ParseResult<T> =
  { success: true; data: T } | { success: false; error: string; code: number }

export const CloseCode = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
} as const satisfies Record<string, number>

export type CloseCodeValue = (typeof CloseCode)[keyof typeof CloseCode]

/**
 * Парсинг та валідація вхідного JSON-повідомлення клієнта.
 * Ніколи не кидає — повертає Result-тип.
 * Замінює Lab 04 validateClientMessage() у server/src/protocol.js.
 */
export function parseClientMessage(
  rawData: unknown,
  maxBytes = 32768,
): ParseResult<ClientMessage> {
  // 1. Перевірка розміру
  let text = ''
  if (typeof rawData === 'string') {
    const byteLen =
      typeof Buffer !== 'undefined'
        ? Buffer.byteLength(rawData)
        : new TextEncoder().encode(rawData).length
    if (byteLen > maxBytes) {
      return {
        success: false,
        error: `Message size ${byteLen} exceeds maximum ${maxBytes}`,
        code: CloseCode.MESSAGE_TOO_BIG,
      }
    }
    text = rawData
  } else if (
    rawData instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawData))
  ) {
    const buf = rawData as Uint8Array
    if (buf.byteLength > maxBytes) {
      return {
        success: false,
        error: `Message size ${buf.byteLength} exceeds maximum ${maxBytes}`,
        code: CloseCode.MESSAGE_TOO_BIG,
      }
    }
    text = new TextDecoder().decode(buf)
  } else {
    return {
      success: false,
      error: 'Unsupported payload type',
      code: CloseCode.PROTOCOL_ERROR,
    }
  }

  // 2. Парсинг JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err: unknown) {
    return {
      success: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      code: CloseCode.PROTOCOL_ERROR,
    }
  }

  // 3. Валідація через Zod
  const result = ClientMessageSchema.safeParse(parsed)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    const errorMsg = firstIssue
      ? `${firstIssue.path.join('.') || 'root'}: ${firstIssue.message}`
      : result.error.message
    return {
      success: false,
      error: errorMsg,
      code: CloseCode.PROTOCOL_ERROR,
    }
  }

  return { success: true, data: result.data }
}

/**
 * Парсинг InputFrame (від бінарного декодера або JSON) з санітайзацією
 */
export function parseInputFrame(raw: unknown): ParseResult<InputFrame> {
  const result = InputFrameSchema.safeParse(raw)
  if (!result.success) {
    return {
      success: false,
      error: result.error.message,
      code: CloseCode.PROTOCOL_ERROR,
    }
  }
  return { success: true, data: result.data }
}

/**
 * Парсинг та валідація ServerConfig з process.env
 */
export function parseServerConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const result = ServerConfigSchema.safeParse(env)
  if (!result.success) {
    console.warn('[Config] Validation warnings:', result.error.format())
  }
  // Використовуємо parse (з дефолтами) замість safeParse щоб отримати повні дефолти
  return ServerConfigSchema.parse(env)
}

// ── Константи протоколу (як const satisfies) ─────────────────────────────

export const PROTOCOL_VERSION = 1 satisfies number

export const ClientMessageType = {
  JOIN: 'join',
  LEAVE: 'leave',
  INPUT: 'input',
  CHAT: 'chat',
  PING: 'ping',
  CONFIG: 'config',
} as const satisfies Record<string, string>

export const ServerMessageType = {
  WELCOME: 'welcome',
  ROSTER: 'roster',
  SNAPSHOT: 'snapshot',
  CHAT: 'chat',
  JOINED: 'joined',
  LEFT: 'left',
  PONG: 'pong',
  ERROR: 'error',
  EVENT: 'event',
} as const satisfies Record<string, string>

export const BinaryMessageType = {
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
  CONFIG: 5,
} as const satisfies Record<string, number>

export type BinaryMessageTypeValue =
  (typeof BinaryMessageType)[keyof typeof BinaryMessageType]

export const EntityKindId = {
  SHIP: 1,
  BULLET: 2,
  ASTEROID: 3,
  PICKUP: 4,
} as const satisfies Record<string, number>

export const EntityKindName = {
  [EntityKindId.SHIP]: 'ship',
  [EntityKindId.BULLET]: 'bullet',
  [EntityKindId.ASTEROID]: 'asteroid',
  [EntityKindId.PICKUP]: 'pickup',
} as const satisfies Record<number, string>

export const PickupTypeId = {
  shield: 1,
  rapid: 2,
  homing: 3,
  heal: 4,
} as const satisfies Record<string, number>

export const PickupTypeName = {
  1: 'shield',
  2: 'rapid',
  3: 'homing',
  4: 'heal',
} as const satisfies Record<number, string>

// ── Typed event bus (Generic EventBus, Lab 06 M3) ─────────────────────────

/** Типізована шина подій — K розширює keyof E, E[K] — тип payload для K */
export class TypedEventBus<E extends Record<string, unknown>> {
  #listeners = new Map<keyof E, Set<(payload: E[keyof E]) => void>>()

  on<K extends keyof E>(name: K, fn: (payload: E[K]) => void): () => void {
    if (!this.#listeners.has(name)) {
      this.#listeners.set(name, new Set())
    }
    // as justified: we need E[K] cast to work with the generic map
    this.#listeners.get(name)!.add(fn as (payload: E[keyof E]) => void)
    return () =>
      this.#listeners.get(name)?.delete(fn as (payload: E[keyof E]) => void)
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const handlers = this.#listeners.get(name)
    if (handlers) {
      for (const fn of handlers) {
        fn(payload as E[keyof E])
      }
    }
  }

  off<K extends keyof E>(name: K, fn: (payload: E[K]) => void): void {
    this.#listeners.get(name)?.delete(fn as (payload: E[keyof E]) => void)
  }
}

/** Типи подій клієнтської гри */
export interface GameEvents {
  fired: { shooterId: number; isHoming: boolean }
  hit: { targetId: number; damage: number; targetKind: 'ship' | 'asteroid' }
  exploded: { entityId: number; kind: string }
  score: { score: number; delta: number }
  respawn: { shipId: number }
  collected: { shipId: number; pickupType: string }
  connected: { playerId: string; shipId: number }
  disconnected: { reason: string }
}
