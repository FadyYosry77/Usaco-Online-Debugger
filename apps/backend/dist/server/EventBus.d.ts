import type { AnyBackendEvent, EventMap, EventName } from "@usaco-helper/shared-types";
type Listener = (event: AnyBackendEvent) => void;
export declare class EventBus {
    private readonly listeners;
    emit<K extends EventName>(type: K, payload: EventMap[K]): void;
    subscribe(listener: Listener): () => void;
}
export {};
