/**
 * Secondary line under a guest's name in the desktop list (dietary restriction,
 * RSVP note). It wraps anywhere and clamps to two lines instead of `truncate`
 * (nowrap): a no-wrap line's min-content width is its whole max-width, so a long
 * value forced the table wider than its card and pushed Editar/Eliminar out of
 * view (GST-N2). The full text stays in the tooltip.
 */
export function GuestCellNote({ text, prefix }: { text: string; prefix?: string }) {
  const full = prefix ? `${prefix}${text}` : text
  return (
    <p
      data-testid="guest-cell-note"
      className="mt-0.5 line-clamp-2 max-w-[16rem] text-xs [overflow-wrap:anywhere] whitespace-normal text-ink-muted"
      title={full}
    >
      {full}
    </p>
  )
}
