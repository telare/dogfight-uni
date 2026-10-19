/** Templates own these elements; fail at initialization if a selector drifts. */
export function query<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
