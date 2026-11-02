/** Opt-in, bounded User Timing entries; observers still receive cleared spans. */
let enabled = false
export function enableTiming(value = true): void {
  enabled = value
}
export function timed<T>(name: string, operation: () => T): T {
  if (!enabled) return operation()
  const mark = `${name}:start`
  performance.mark(mark)
  try {
    return operation()
  } finally {
    performance.measure(name, mark)
    performance.clearMarks(mark)
    performance.clearMeasures(name)
  }
}
