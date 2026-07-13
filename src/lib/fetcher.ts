import { api } from "@/lib/api";
import { readApiData } from "@/lib/api-envelope";

// Este helper conecta SWR con nuestra instancia de Axios
// Recibe la URL (ej: '/clients') y devuelve solo la data limpia
export const fetcher = <T = unknown>(url: string): Promise<T> =>
  api.get(url).then((res) => readApiData<T>(res.data));
