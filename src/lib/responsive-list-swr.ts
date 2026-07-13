export const RESPONSIVE_LIST_DEDUPING_INTERVAL_MS = 15_000

/**
 * Lists render cached data immediately, then refresh once in the background.
 * Focus revalidation stays disabled because route intent/mount already performs
 * the freshness check and focus changes are common while operating an event.
 */
export const responsiveListSwrOptions = {
  dedupingInterval: RESPONSIVE_LIST_DEDUPING_INTERVAL_MS,
  revalidateIfStale: true,
  revalidateOnFocus: false,
} as const
