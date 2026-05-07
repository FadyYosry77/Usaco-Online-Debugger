export class EventBus {
    listeners = new Set();
    emit(type, payload) {
        const event = { type, payload };
        for (const listener of this.listeners) {
            listener(event);
        }
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
//# sourceMappingURL=EventBus.js.map