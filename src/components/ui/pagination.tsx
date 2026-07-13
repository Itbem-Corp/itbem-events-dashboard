'use client'

import { Button } from '@/components/button'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageIntent?: (page: number) => void
}

export function Pagination({ total, page, pageSize, onPageChange, onPageIntent }: PaginationProps) {
  if (total <= pageSize) return null

  const totalPages = Math.ceil(total / pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-4 sm:flex-row">
      <span role="status" aria-live="polite" className="text-xs text-zinc-500">
        Mostrando {from}–{to} de {total}
      </span>

      <div className="flex items-center gap-2">
        <Button
          plain
          onClick={() => onPageChange(page - 1)}
          onFocus={() => page > 1 && onPageIntent?.(page - 1)}
          onPointerDown={() => page > 1 && onPageIntent?.(page - 1)}
          onPointerEnter={() => page > 1 && onPageIntent?.(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className="flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="size-4" />
          Anterior
        </Button>

        <span className="px-2 text-xs text-zinc-500">
          {page} / {totalPages}
        </span>

        <Button
          plain
          onClick={() => onPageChange(page + 1)}
          onFocus={() => page < totalPages && onPageIntent?.(page + 1)}
          onPointerDown={() => page < totalPages && onPageIntent?.(page + 1)}
          onPointerEnter={() => page < totalPages && onPageIntent?.(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
          className="flex items-center gap-1 text-sm"
        >
          Siguiente
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
