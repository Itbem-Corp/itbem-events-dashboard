export class BlobUrlLruCache {
  private readonly entries = new Map<string, string>()

  constructor(
    private readonly maxEntries: number,
    private readonly revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)
  ) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key)
    if (!value) return undefined

    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: string): void {
    const previous = this.entries.get(key)
    if (previous === value) {
      this.get(key)
      return
    }
    if (previous) this.revoke(previous)

    this.entries.delete(key)
    this.entries.set(key, value)

    while (this.entries.size > Math.max(0, this.maxEntries)) {
      const oldest = this.entries.entries().next().value as [string, string] | undefined
      if (!oldest) break
      this.entries.delete(oldest[0])
      this.revoke(oldest[1])
    }
  }

  clear(): void {
    for (const value of this.entries.values()) this.revoke(value)
    this.entries.clear()
  }
}
