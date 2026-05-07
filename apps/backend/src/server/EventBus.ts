import type { AnyBackendEvent, BackendEvent, EventMap, EventName } from "@usaco-helper/shared-types";

type Listener = (event: AnyBackendEvent) => void;

export class EventBus {
  private readonly listeners = new Set<Listener>();

  emit<K extends EventName>(type: K, payload: EventMap[K]): void {
    const event = { type, payload } as BackendEvent<K> as AnyBackendEvent;
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
