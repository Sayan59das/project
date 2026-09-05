// Minimal in-memory localStorage shim for running the frontend's
// localStorage-backed data services (productService.ts, artworkService.ts,
// ...) under Node's built-in test runner, which has no browser globals.
// Only the subset those services actually call is implemented.
export class MemoryLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export function installMemoryLocalStorage(): MemoryLocalStorage {
  const shim = new MemoryLocalStorage();
  (globalThis as unknown as { localStorage: MemoryLocalStorage }).localStorage = shim;
  return shim;
}
