import { parseClientMessage, type ClientMessage } from 'shared'
export {
  PROTOCOL_VERSION,
  ClientMessageType,
  ServerMessageType,
  CloseCode,
} from 'shared'
type Validation =
  | { valid: true; msg: ClientMessage }
  | { valid: false; code: number; reason: string }
export function validateClientMessage(
  data: unknown,
  maxBytes = 32768,
): Validation {
  const result = parseClientMessage(data, maxBytes)
  return result.success
    ? { valid: true, msg: result.data }
    : { valid: false, code: result.code, reason: result.error }
}
