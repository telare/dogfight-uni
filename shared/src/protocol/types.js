/**
 * Dogfight Protocol Definitions (Lab 05)
 * Спільні константи та типи повідомлень для клієнта і сервера.
 */

export const PROTOCOL_VERSION = 1

export const ClientMessageType = {
  JOIN: 'join',
  LEAVE: 'leave',
  INPUT: 'input',
  CHAT: 'chat',
  PING: 'ping',
  CONFIG: 'config',
}

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
}

export const BinaryMessageType = {
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
  CONFIG: 5,
}

export const EntityKindId = {
  SHIP: 1,
  BULLET: 2,
  ASTEROID: 3,
  PICKUP: 4,
}

export const EntityKindName = {
  [EntityKindId.SHIP]: 'ship',
  [EntityKindId.BULLET]: 'bullet',
  [EntityKindId.ASTEROID]: 'asteroid',
  [EntityKindId.PICKUP]: 'pickup',
}

export const PickupTypeId = {
  shield: 1,
  rapid: 2,
  homing: 3,
  heal: 4,
}

export const PickupTypeName = {
  1: 'shield',
  2: 'rapid',
  3: 'homing',
  4: 'heal',
}

export const CloseCode = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
}
