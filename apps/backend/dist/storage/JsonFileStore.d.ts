export declare class JsonFileStore<T> {
    private readonly filePath;
    private readonly defaultValue;
    constructor(filePath: string, defaultValue: T);
    read(): Promise<T>;
    write(value: T): Promise<void>;
    update(updater: (current: T) => T | Promise<T>): Promise<T>;
}
