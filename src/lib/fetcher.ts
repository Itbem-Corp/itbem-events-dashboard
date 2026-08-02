import { api } from "@/lib/api";
import { readApiData } from "@/lib/api-envelope";
import { requestPathFromKey, type ScopedFetcherKey } from '@/lib/request-context'

// Este helper conecta SWR con nuestra instancia de Axios
// Recibe la URL (ej: '/clients') y devuelve solo la data limpia
export const fetcher = <T = unknown>(key: string | ScopedFetcherKey): Promise<T> =>
  api.get(requestPathFromKey(key)).then((res) => readApiData<T>(res.data));
