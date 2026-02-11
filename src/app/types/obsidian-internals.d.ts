import 'obsidian'

interface PromisifiedIDBIndex {
    getAll(query?: IDBValidKey | IDBKeyRange): Promise<unknown[]>
    indexNames: DOMStringList
}

interface PromisifiedIDBObjectStore {
    getAll(): Promise<unknown[]>
    index(name: string): PromisifiedIDBIndex
    indexNames: DOMStringList
}

interface PromisifiedIDBTransaction {
    objectStore(name: string): PromisifiedIDBObjectStore
}

interface PromisifiedIDBDatabase {
    transaction(storeNames: string | string[], mode?: IDBTransactionMode): PromisifiedIDBTransaction
    objectStoreNames: DOMStringList
}

interface FileRecoveryPlugin {
    db: PromisifiedIDBDatabase
}

interface InternalPlugin {
    enabled: boolean
}

interface InternalPlugins {
    getEnabledPluginById(id: 'file-recovery'): FileRecoveryPlugin | null
    getEnabledPluginById(id: string): InternalPlugin | null
}

declare module 'obsidian' {
    interface App {
        internalPlugins: InternalPlugins
    }
}
