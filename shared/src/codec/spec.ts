/**
 * ============================================================================
 * DOGFIGHT REALTIME BINARY PROTOCOL SPECIFICATION v1.0 (Lab 05 & 06)
 * ============================================================================
 *
 * ENDIANNESS: Little-Endian everywhere
 */

// Const assertion preserves immutable layout literals, including little-endian true.
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
} as const
