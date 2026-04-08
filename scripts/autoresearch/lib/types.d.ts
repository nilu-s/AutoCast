// Type declarations for better-sqlite3
// Minimal type declarations since @types/better-sqlite3 is not installing

declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string, options?: object);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }

  class Statement {
    run(params?: Record<string, any>): { changes: number; lastInsertRowid: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  export = Database;
  export { Database, Statement };
}
