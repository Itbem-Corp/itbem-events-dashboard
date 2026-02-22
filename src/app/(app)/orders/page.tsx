'use client'

import { Heading } from '@/components/heading'
import { PageTransition } from '@/components/ui/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { ShoppingBagIcon, CreditCardIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { motion } from 'motion/react'

export default function OrdersPage() {
  return (
    <PageTransition>
      <div className="flex items-end justify-between gap-4">
        <Heading>Órdenes</Heading>
      </div>

      {/* Feature overview cards */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: ShoppingBagIcon,
            title: 'Gestión de órdenes',
            description: 'Visualiza y administra todas las órdenes de boletos y productos de tus eventos.',
          },
          {
            icon: CreditCardIcon,
            title: 'Pagos integrados',
            description: 'Conexión con pasarelas de pago para procesar transacciones de forma segura.',
          },
          {
            icon: ChartBarIcon,
            title: 'Reportes de ventas',
            description: 'Analiza ingresos, reembolsos y métricas de conversión por evento.',
          },
        ].map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            className="rounded-xl border border-white/10 bg-zinc-900/50 p-6"
          >
            <card.icon className="size-8 text-zinc-600 mb-4" />
            <h3 className="text-sm font-semibold text-zinc-200">{card.title}</h3>
            <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{card.description}</p>
          </motion.div>
        ))}
      </div>

      {/* Coming soon state */}
      <div className="mt-8">
        <EmptyState
          icon={ShoppingBagIcon}
          title="Módulo de pagos en desarrollo"
          description="El módulo de órdenes estará disponible cuando se integre el procesador de pagos. Las órdenes existentes se importarán automáticamente."
        />
      </div>
    </PageTransition>
  )
}
