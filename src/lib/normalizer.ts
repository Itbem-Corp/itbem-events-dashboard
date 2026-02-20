/**
 * normalizer.ts — converts PascalCase keys from the Go API to snake_case.
 * Used automatically by the Axios response interceptor in api.ts.
 */

export function toSnakeCase(str: string): string {
    return str
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase()
}

export function normalizeKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(normalizeKeys)
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
                toSnakeCase(k),
                normalizeKeys(v),
            ])
        )
    }
    return obj
}
