// Collects warnings. Repeated messages are counted, not repeated.
export class Warnings {
  private readonly map = new Map<string, { message: string; count: number }>();

  add(key: string, message: string): void {
    const old = this.map.get(key);
    if (old) old.count++;
    else this.map.set(key, { message, count: 1 });
  }

  list(): { message: string; count: number }[] {
    return [...this.map.values()];
  }

  get size(): number {
    return this.map.size;
  }
}
