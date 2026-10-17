/**
 * ============================================================================
 * DOGFIGHT REALTIME BINARY PROTOCOL SPECIFICATION v1.0 (Lab 05)
 * ============================================================================
 *
 * ENDIANNESS:
 * - Всі числові поля кодуються у Little-Endian (LE, молодший байт перший).
 * - У DataView це відповідає параметру `littleEndian = true` у кожному виклику:
 *   view.setUint32(offset, value, true), view.getFloat32(offset, true) тощо.
 *
 * СТРУКТУРИ ПОВІДОМЛЕНЬ:
 *
 * 1. INPUT MESSAGE (Клієнт -> Сервер) [Розмір: 14 байт]
 *    [0]      type: Uint8 (1 = BinaryMessageType.INPUT)
 *    [1]      version: Uint8 (1 = PROTOCOL_VERSION)
 *    [2..5]   seq: Uint32 LE (монотонний порядковий номер вводу)
 *    [6..9]   tick: Uint32 LE (розрахунковий серверний тік клієнта)
 *    [10]     flags: Uint8 (bit 0 = thrust, bit 1 = fire)
 *    [11..12] turn: Int16 LE (квантування: turn * 1000, діапазон [-1000..1000])
 *    [13]     reserved: Uint8 (вирівнювання = 0)
 *
 * 2. SNAPSHOT MESSAGE (Сервер -> Клієнт) [Розмір: 16 байт заголовка + 24 байт на сутність]
 *    Заголовок:
 *    [0]      type: Uint8 (2 = BinaryMessageType.SNAPSHOT)
 *    [1]      version: Uint8 (1 = PROTOCOL_VERSION)
 *    [2..5]   tick: Uint32 LE (авторитетний серверний тік)
 *    [6..9]   serverTime: Uint32 LE (мітка часу в мс за модулем 2^32)
 *    [10..13] ackSeq: Uint32 LE (останній підтверджений ввід клієнта)
 *    [14..15] entityCount: Uint16 LE (кількість сутностей у кадрі)
 *
 *    Кожна сутність (фіксований запис 24 байти):
 *    [0..1]   id: Uint16 LE (числовий id сутності 1..65535)
 *    [2]      kind: Uint8 (1=ship, 2=bullet, 3=asteroid, 4=pickup)
 *    [3]      flags: Uint8 (для ship: bit0=thrust, bit1=shield; для asteroid: tier; для pickup: typeId; для bullet: homing)
 *    [4..7]   x: Float32 LE (координата X в арені)
 *    [8..11]  y: Float32 LE (координата Y в арені)
 *    [12..15] vx: Float32 LE (швидкість X)
 *    [16..19] vy: Float32 LE (швидкість Y)
 *    [20..21] angle: Int16 LE (квантування: round(angle * 1000), крок ~0.057°)
 *    [22]     hp: Uint8 (0..100)
 *    [23]     shield: Uint8 (0..100)
 *
 * 3. PING MESSAGE [Розмір: 10 байт]
 *    [0]      type: Uint8 (3 = BinaryMessageType.PING)
 *    [1]      version: Uint8 (1)
 *    [2..9]   clientTime: Float64 LE (високоточний час performance.now())
 *
 * 4. PONG MESSAGE [Розмір: 18 байт]
 *    [0]      type: Uint8 (4 = BinaryMessageType.PONG)
 *    [1]      version: Uint8 (1)
 *    [2..9]   clientTime: Float64 LE
 *    [10..17] serverTime: Float64 LE
 *
 * 5. CONFIG MESSAGE [Розмір: 8 байт]
 *    [0]      type: Uint8 (5 = BinaryMessageType.CONFIG)
 *    [1]      version: Uint8 (1)
 *    [2..3]   latencyMs: Uint16 LE
 *    [4]      jitterMs: Uint8
 *    [5]      dropRatePercent: Uint8
 *    [6]      codec: Uint8 (0 = binary, 1 = json)
 *    [7]      reserved: Uint8
 * ============================================================================
 */

export const BINARY_SPEC = {
  VERSION: 1,
  INPUT_SIZE: 14,
  SNAPSHOT_HEADER_SIZE: 16,
  ENTITY_RECORD_SIZE: 24,
  PING_SIZE: 10,
  PONG_SIZE: 18,
  CONFIG_SIZE: 8,
  LITTLE_ENDIAN: true,
  ANGLE_QUANTIZATION_FACTOR: 1000,
  TURN_QUANTIZATION_FACTOR: 1000,
}
