'use client'

import { Heading } from '@/components/heading'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/table'

export default function OrdersPage() {
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Órdenes</Heading>
      </div>
      <Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader>Número de orden</TableHeader>
            <TableHeader>Fecha de compra</TableHeader>
            <TableHeader>Cliente</TableHeader>
            <TableHeader>Evento</TableHeader>
            <TableHeader className="text-right">Monto</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <tr>
            <td colSpan={5} className="py-16 text-center text-sm text-zinc-400">
              El módulo de órdenes estará disponible próximamente.
            </td>
          </tr>
        </TableBody>
      </Table>
    </>
  )
}
