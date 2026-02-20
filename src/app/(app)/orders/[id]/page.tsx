'use client'

import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { Square2StackIcon } from '@heroicons/react/20/solid'
import { EmptyState } from '@/components/ui/empty-state'
import { PageTransition } from '@/components/ui/page-transition'

export default function OrderDetailPage() {
    return (
        <PageTransition>
            <div className="max-lg:hidden">
                <Link href="/orders" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500">
                    <ChevronLeftIcon className="size-4 fill-zinc-500" />
                    Órdenes
                </Link>
            </div>

            <div className="mt-4 flex items-center gap-4">
                <Heading>Detalle de orden</Heading>
            </div>

            <div className="mt-12">
                <EmptyState
                    icon={Square2StackIcon}
                    title="Módulo en desarrollo"
                    description="El detalle de órdenes estará disponible cuando se conecte el módulo de pagos."
                />
            </div>
        </PageTransition>
    )
}
