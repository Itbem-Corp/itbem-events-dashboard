import { useCallback, useRef } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import { api } from "@/lib/api";
import { EventSection } from "@/models/EventSection";

export function useStudioSections(
  eventId: string | undefined,
  onRefreshPreview?: () => void
) {
  const { data, error, isLoading, mutate } = useSWR<EventSection[]>(
    eventId ? `/events/${eventId}/sections` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const sections = data
    ? [...data].sort((a, b) => a.order - b.order)
    : [];

  // ── Debounced preview refresh ──────────────────────────────────────────────
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPreview = useCallback(() => {
    if (!onRefreshPreview) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      onRefreshPreview();
    }, 1000);
  }, [onRefreshPreview]);

  const refreshPreviewNow = useCallback(() => {
    if (!onRefreshPreview) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    onRefreshPreview();
  }, [onRefreshPreview]);

  // ── Reorder guard ──────────────────────────────────────────────────────────
  const reorderInFlight = useRef(false);
  const previousSectionsRef = useRef<EventSection[] | null>(null);

  // ── handleReorder ──────────────────────────────────────────────────────────
  const handleReorder = useCallback(
    async (newOrder: EventSection[]) => {
      if (reorderInFlight.current) return;
      reorderInFlight.current = true;

      const updated = newOrder.map((s, i) => ({ ...s, order: i + 1 }));

      // Determine which sections actually changed order
      const changed = updated.filter((s) => {
        const original = sections.find((o) => o.id === s.id);
        return original && original.order !== s.order;
      });

      // Save previous state for rollback
      previousSectionsRef.current = sections;

      // Optimistic update
      mutate(updated, { revalidate: false });

      try {
        await Promise.all(
          changed.map((s) =>
            api.put(`/sections/${s.id}`, { ...s, order: s.order })
          )
        );
        mutate();
        refreshPreview();
      } catch {
        mutate(previousSectionsRef.current, { revalidate: true });
        toast.error("Error al reordenar");
      } finally {
        reorderInFlight.current = false;
      }
    },
    [sections, mutate, refreshPreview]
  );

  // ── handleToggleVisible ────────────────────────────────────────────────────
  const handleToggleVisible = useCallback(
    async (section: EventSection) => {
      const toggled = !section.is_visible;

      // Save previous state for rollback
      previousSectionsRef.current = sections;

      // Optimistic update
      const optimistic = sections.map((s) =>
        s.id === section.id ? { ...s, is_visible: toggled } : s
      );
      mutate(optimistic, { revalidate: false });

      try {
        await api.put(`/sections/${section.id}`, {
          ...section,
          is_visible: toggled,
        });
        mutate();
        refreshPreview();
      } catch {
        mutate(previousSectionsRef.current, { revalidate: true });
        toast.error("Error al cambiar visibilidad");
      }
    },
    [sections, mutate, refreshPreview]
  );

  // ── handleSaveConfig ───────────────────────────────────────────────────────
  const handleSaveConfig = useCallback(
    async (section: EventSection, config: Record<string, unknown>) => {
      try {
        await api.put(`/sections/${section.id}`, { ...section, config });
        mutate();
        refreshPreview();
        toast.success("Seccion guardada");
      } catch {
        toast.error("Error al guardar configuracion");
      }
    },
    [mutate, refreshPreview]
  );

  return {
    sections,
    isLoading,
    error,
    handleReorder,
    handleToggleVisible,
    handleSaveConfig,
    refreshPreview,
    refreshPreviewNow,
  };
}
