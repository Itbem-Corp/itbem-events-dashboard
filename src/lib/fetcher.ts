import { api } from "@/lib/api";

// Este helper conecta SWR con nuestra instancia de Axios
// Recibe la URL (ej: '/clients') y devuelve solo la data limpia
export const fetcher = (url: string) => api.get(url).then(res => res.data?.data ?? res.data)