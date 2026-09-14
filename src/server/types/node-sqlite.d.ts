// Minimal types for Node 24's built-in SQLite module; @types/node 20 predates it.
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean; timeout?: number })
    exec(sql: string): void
    prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined }
    close(): void
  }
}
