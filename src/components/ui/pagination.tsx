'use client'

import { motion } from 'motion/react'
import { Button } from '@/components/button'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid'

interface PaginationProps {
    total: number
    page: number
    pageSize: number
    onPageChange: (page: number) => void
}

export function Pagination({ total, page, pageSize, onPageChange }: PaginationProps) {
    if (total <= pageSize) return null

    const totalPages = Math.ceil(total / pageSize)
    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, total)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="mt-6 flex items-center justify-between gap-4 border-t border-white/5 pt-4"
        >
            <span className="text-xs text-zinc-500">
                Mostrando {from}–{to} de {total}
            </span>

            <div className="flex items-center gap-2">
                <Button
                    plain
                    onClick={() => onPageChange(page - 1)}
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
                    disabled={page >= totalPages}
                    aria-label="Página siguiente"
                    className="flex items-center gap-1 text-sm"
                >
                    Siguiente
                    <ChevronRightIcon className="size-4" />
                </Button>
            </div>
        </motion.div>
    )
}
