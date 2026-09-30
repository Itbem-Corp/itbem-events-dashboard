import { AgentWorkspace } from '@/features/automation/agent-workspace'
import type { DeliveryWorkItem } from '@/features/automation/delivery-types'
import '@/styles/tailwind.css'
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'

const now = '2026-09-20T18:00:00Z'
const original: DeliveryWorkItem = {
  id: 'synthetic-work',
  project_id: 'synthetic-project',
  title: 'Una confirmación, sin duplicados',
  description: 'Normalizar las confirmaciones de asistencia',
  expected_outcome: 'Preservar el orden sin duplicados',
  state: 'implementation',
  agent_progress: 'blocked',
  automation_epoch: 1,
  blocked_reason: 'El agente necesita una aclaración: ¿conservamos la primera confirmación cuando el correo se repite?',
  created_at: now,
  updated_at: now,
  messages: [
    {
      id: 'm1',
      phase: 'implementation',
      author_type: 'agent',
      body: 'Encontré correos repetidos con diferencias de mayúsculas. Necesito confirmar qué entrada conservar antes de continuar.',
      created_at: now,
    },
  ],
  automation_tasks: [
    {
      id: 't1',
      operation: 'delivery.implementation',
      status: 'failed',
      created_at: now,
      error_message: 'Agent requested assistance: preserve first or last?',
    },
  ],
}
export function Preview() {
  const [item, setItem] = useState(original)
  const [offline, setOffline] = useState(false)
  const [failSend, setFailSend] = useState(false)
  const [inspection, setInspection] = useState('')
  const events = [
    {
      id: 'plan',
      at: now,
      title: 'Plan aprobado',
      detail: 'Alcance y criterios revisados por una persona.',
      nodeLabel: 'Plan',
      tone: 'complete' as const,
      trackKey: 'plan',
    },
    {
      id: 'implementation',
      at: now,
      title: item.automation_tasks?.[0]?.status === 'running' ? 'Verificando el cambio' : 'Aclaración pendiente',
      detail: item.blocked_reason || 'Pruebas ejecutándose en el repositorio aislado.',
      nodeLabel: 'Implementación',
      tone: item.automation_tasks?.[0]?.status === 'running' ? ('active' as const) : ('attention' as const),
      trackKey: 'implementation',
      taskId: 't1',
    },
  ]
  return (
    <main
      className="mx-auto max-w-6xl px-4 py-7 sm:px-8"
      style={{ '--tenant-accent': '#6366f1' } as React.CSSProperties}
    >
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-ink-secondary">
        PREVIEW AISLADO · Datos sintéticos · Componentes reales del dashboard · No ejecuta agentes ni cambia cuentas
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-muted uppercase">ITBEM / Delivery</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{item.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Bloqueado', 'Trabajando', 'Sin conexión', 'Fallar envío', 'Tema'].map((label) => (
            <button
              key={label}
              className="min-h-10 rounded-xl border border-border-subtle px-3 text-xs text-ink"
              onClick={() => {
                if (label === 'Tema') {
                  document.documentElement.classList.toggle('dark')
                  return
                }
                if (label === 'Sin conexión') {
                  setOffline(!offline)
                  return
                }
                if (label === 'Fallar envío') {
                  setFailSend(!failSend)
                  return
                }
                setItem(
                  label === 'Bloqueado'
                    ? original
                    : {
                        ...original,
                        blocked_reason: '',
                        agent_progress: 'queued',
                        automation_tasks: [
                          {
                            id: 't1',
                            operation: 'delivery.implementation',
                            status: 'running',
                            progress_step: 'validating',
                            progress_call: 2,
                            created_at: now,
                          },
                        ],
                      }
                )
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <AgentWorkspace
        item={item}
        streamStatus={offline ? 'offline' : 'live'}
        onInspect={() => setInspection('Inspector: intento t1 · evidencia sintética')}
        onReview={() => setInspection('Gate humano: revisión de alcance y evidencia')}
        onStop={() =>
          setItem({
            ...item,
            automation_tasks: item.automation_tasks?.map((task) => ({ ...task, status: 'cancel_requested' })),
          })
        }
        onSend={async (body, resume, id) => {
          if (failSend) throw new Error('synthetic network error')
          setItem({
            ...item,
            agent_progress: resume ? 'queued' : item.agent_progress,
            blocked_reason: resume ? '' : item.blocked_reason,
            messages: [
              ...(item.messages ?? []),
              {
                id,
                body,
                phase: item.state,
                author_type: 'human',
                created_at: new Date().toISOString(),
                resume_requested: resume,
              },
            ],
          })
        }}
      />
      {inspection ? (
        <p role="status" className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-ink">
          {inspection}
        </p>
      ) : null}
    </main>
  )
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<Preview />)
