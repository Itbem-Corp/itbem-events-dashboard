'use client'

import { memo } from 'react'
import { motion } from 'motion/react'

const listVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

export function AnimatedList({
    children,
    className,
}: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <motion.div
            variants={listVariants}
            initial="hidden"
            animate="visible"
            className={className}
        >
            {children}
        </motion.div>
    )
}

// memo prevents re-triggering the entrance animation when parent state changes
// (e.g. a modal opening/closing, search input updating)
export const AnimatedListItem = memo(function AnimatedListItem({
    children,
    className,
}: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <motion.div variants={itemVariants} className={className}>
            {children}
        </motion.div>
    )
})
