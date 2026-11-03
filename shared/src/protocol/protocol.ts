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

export const SeqSchema = z.number().int().min(0).max(0xffffffff).brand<'Seq'>()
export const TickSchema = z
  .number()
  .int()
  .min(0)
  .max(0xffffffff)
  .brand<'Tick'>()
export const EntityIdSchema = z
  .number()
  .int()
  .positive()
  .max(0xffff)
  .brand<'EntityId'>()

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
  seq: SeqSchema.prefault(0),
  tick: TickSchema.prefault(0),
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
  seq: SeqSchema.prefault(0),
  tick: TickSchema.prefault(0),
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
  INPUT_RATE_LIMIT_PER_SEC: z.coerce.number().int().min(60).default(120),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  JOIN_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  BUFFERED_AMOUNT_THRESHOLD: z.coerce.number().int().positive().default(65536),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  BUILD_SHA: z
    .string()
    .regex(/^[a-zA-Z0-9._-]{1,64}$/)
    .default('dev'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((v) => z.url().parse(v.trim()))
        .map((v) => {
          const url = new URL(v)
          if (!['http:', 'https:'].includes(url.protocol) || url.origin !== v)
            throw new Error(
              'Origins must be exact HTTP(S) origins without paths',
            )
          return v
        }),
    ),
  TRUSTED_PROXY_IPS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => z.union([z.ipv4(), z.ipv6()]).parse(v)),
    ),
  ALLOW_MISSING_ORIGIN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((s) => s === 'true'),
  ENABLE_DIAGNOSTICS: z
    .enum(['true', 'false'])
    .optional()
    .transform((s) => (s === undefined ? undefined : s === 'true')),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().positive().default(16),
  MAX_ROOMS: z.coerce.number().int().min(3).default(32),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().positive().max(128).default(32),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(9000).default(5000),
})

export type ServerConfig = z.infer<typeof ServerConfigSchema>

// ── Result-тип для parseClientMessage ─────────────────────────────────────

export type ParseResult<T> =
  { success: true; data: T } | { success: false; error: string; code: number }

// Const assertion keeps close-code literals available to consumers.
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
    const buf = rawData
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

// Const assertion preserves message discriminants for exhaustive dispatch.
export const ClientMessageType = {
  JOIN: 'join',
  LEAVE: 'leave',
  INPUT: 'input',
  CHAT: 'chat',
  PING: 'ping',
  CONFIG: 'config',
} as const satisfies Record<string, string>

// Const assertion preserves server message discriminants for exhaustive dispatch.
export const ServerMessageType = {
  SHUTDOWN: 'shutdown',
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
} satisfies Record<string, 1 | 2 | 3 | 4 | 5>

export type BinaryMessageTypeValue =
  (typeof BinaryMessageType)[keyof typeof BinaryMessageType]

export const EntityKindId = {
  SHIP: 1,
  BULLET: 2,
  ASTEROID: 3,
  PICKUP: 4,
} satisfies Record<string, 1 | 2 | 3 | 4>

export const EntityKindName = {
  [EntityKindId.SHIP]: 'ship',
  [EntityKindId.BULLET]: 'bullet',
  [EntityKindId.ASTEROID]: 'asteroid',
  [EntityKindId.PICKUP]: 'pickup',
} satisfies Record<number, 'ship' | 'bullet' | 'asteroid' | 'pickup'>

export const PickupTypeId = {
  shield: 1,
  rapid: 2,
  homing: 3,
  heal: 4,
} satisfies Record<string, 1 | 2 | 3 | 4>

export const PickupTypeName = {
  1: 'shield',
  2: 'rapid',
  3: 'homing',
  4: 'heal',
} satisfies Record<number, 'shield' | 'rapid' | 'homing' | 'heal'>

export type EntityId = z.infer<typeof EntityIdSchema>
export type Tick = z.infer<typeof TickSchema>
export type Seq = z.infer<typeof SeqSchema>
export const asEntityId = (n: number): EntityId => EntityIdSchema.parse(n)
export const asTick = (n: number): Tick => TickSchema.parse(n)
export const asSeq = (n: number): Seq => SeqSchema.parse(n)

const entityBase = z.object({
  id: EntityIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  angle: z.number().finite(),
  radius: z.number().positive().optional(),
  alive: z.boolean().default(true),
  hp: z.number().min(0).max(255).optional(),
  shield: z.number().min(0).max(255).optional(),
})
export const EntitySchema = z.discriminatedUnion('kind', [
  entityBase.extend({
    kind: z.literal('ship'),
    playerId: z.string().nullable().optional(),
    name: z.string().optional(),
    thrust: z.number().min(0).max(1).optional(),
    score: z.number().optional(),
  }),
  entityBase.extend({
    kind: z.literal('bullet'),
    ownerId: EntityIdSchema.nullable().optional(),
    damage: z.number().optional(),
    ttl: z.number().optional(),
    isHoming: z.union([z.number().min(0).max(1), z.boolean()]).optional(),
  }),
  entityBase.extend({
    kind: z.literal('asteroid'),
    tier: z.union([z.literal(1), z.literal(2)]).optional(),
    rotSpeed: z.number().optional(),
  }),
  entityBase.extend({
    kind: z.literal('pickup'),
    type: z.enum(['shield', 'rapid', 'homing', 'heal']).optional(),
    ttl: z.number().optional(),
  }),
])
export type EntityData = Readonly<z.infer<typeof EntitySchema>>
export type ShipData = Extract<EntityData, { kind: 'ship' }>
export type BulletData = Extract<EntityData, { kind: 'bullet' }>
export type AsteroidData = Extract<EntityData, { kind: 'asteroid' }>
export type PickupData = Extract<EntityData, { kind: 'pickup' }>
export const SnapshotSchema = z
  .object({
    type: z.literal('snapshot').default('snapshot'),
    tick: TickSchema,
    serverTime: z.number().finite(),
    ackSeq: SeqSchema,
    entities: z.array(EntitySchema.readonly()).readonly(),
  })
  .readonly()
export type SnapshotData = z.infer<typeof SnapshotSchema>
export type SnapshotState = Omit<SnapshotData, 'type'>
const player = z.object({
  id: z.string(),
  name: z.string(),
  shipId: EntityIdSchema.optional(),
})
export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  difficulty: z.string().default('Normal'),
  arena: z.string().default('standard'),
  players: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  createdAt: z.number().optional(),
  stats: z.unknown().optional(),
})
export type RoomData = z.infer<typeof RoomSchema>
export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('shutdown'), message: z.string().max(200) }),
  z.object({
    type: z.literal('welcome'),
    playerId: z.string(),
    shipId: EntityIdSchema,
    seed: z.number(),
    tickRate: z.number().optional(),
    arena: z.object({ width: z.number(), height: z.number() }).optional(),
    room: RoomSchema.pick({
      id: true,
      name: true,
      difficulty: true,
      arena: true,
    }),
    roster: z.array(player),
    config: z
      .object({
        latencyMs: z.number(),
        jitterMs: z.number(),
        dropRate: z.number(),
      })
      .optional(),
  }),
  z.object({ type: z.literal('roster'), players: z.array(player) }),
  SnapshotSchema,
  z.object({
    type: z.literal('chat'),
    from: z.string(),
    playerId: z.string().optional(),
    text: z.string(),
    t: z.number().optional(),
  }),
  z.object({
    type: z.literal('joined'),
    player,
    roster: z.array(player).optional(),
  }),
  z.object({
    type: z.literal('left'),
    playerId: z.string(),
    name: z.string().optional(),
    roster: z.array(player).optional(),
  }),
  z.object({
    type: z.literal('pong'),
    clientTime: z.number().finite(),
    serverTime: z.number().finite(),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({
    type: z.literal('event'),
    event: z.string(),
    detail: z.unknown().optional(),
  }),
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>
export function parseServerMessage(data: unknown): ParseResult<ServerMessage> {
  const result = ServerMessageSchema.safeParse(data)
  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        error: result.error.message,
        code: CloseCode.PROTOCOL_ERROR,
      }
}
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`)
}
export const CreateRoomSchema = z.object({
  name: z.string().trim().min(1).max(32),
  difficulty: z.string().default('Normal'),
  arena: z.string().default('standard'),
  maxPlayers: z.coerce.number().int().min(1).max(128).default(8),
})
