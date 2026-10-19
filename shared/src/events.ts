/** Event names determine the payload accepted by listeners and emitters. */
export class Bus<E extends Record<string, unknown>> {
  #listeners: { [K in keyof E]?: Set<(payload: E[K]) => void> } = {}

  on<K extends keyof E>(name: K, fn: (payload: E[K]) => void): () => void {
    let listeners = this.#listeners[name]
    if (!listeners) {
      listeners = new Set()
      this.#listeners[name] = listeners
    }
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    for (const listener of this.#listeners[name] ?? []) listener(payload)
  }

  clear(): void {
    this.#listeners = {}
  }
}
