// Collects warnings. Repeated messages are counted, not repeated.
export class Warnings {
  private readonly map = new Map<string, { message: string; count: number }>();

  add(key: string, message: string): void {
    const old = this.map.get(key);
    if (old) old.count++;
    else this.map.set(key, { message, count: 1 });
  }

  /** Adds all warnings of another list, with their counts. */
  addFrom(other: Warnings): void {
    for (const [key, w] of other.map) {
      const old = this.map.get(key);
      if (old) old.count += w.count;
      else this.map.set(key, { ...w });
    }
  }

  list(): { message: string; count: number }[] {
    return [...this.map.values()];
  }

  get size(): number {
    return this.map.size;
  }
}
