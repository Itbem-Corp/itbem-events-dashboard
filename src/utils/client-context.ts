import type { Client } from '@/models/Client'

export function isRootClient(client: Client | null | undefined) {
    return client?.client_type?.code === 'PLATFORM'
}
