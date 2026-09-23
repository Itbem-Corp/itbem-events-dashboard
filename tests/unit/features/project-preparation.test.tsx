import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectPreparation } from '@/features/automation/project-preparation'

describe('project preparation', () => {
  it('keeps unknown server preparation explicit', () => {
    render(<ProjectPreparation preparation={undefined} onConfigure={vi.fn()} onRequest={vi.fn()} initiallyOpen />)
    expect(screen.getByText(/Preparación pendiente de verificar/)).toHaveTextContent('esto no significa que el proyecto esté listo')
  })
  it('routes preparation and a new request separately without starting work', () => {
    const configure = vi.fn()
    const request = vi.fn()
    render(<ProjectPreparation preparation={{ version: 1, checks: [{ key: 'runtime', title: 'Capacidad', state: 'unknown', detail: 'Revalidar al iniciar' }] }} onConfigure={configure} onRequest={request} initiallyOpen />)
    expect(screen.getByText('Por comprobar')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Siguiente acción de preparación' })).toHaveTextContent('Comprobar capacidad')
    expect(screen.getByRole('progressbar', { name: 'Requisitos listos' })).toHaveAttribute('aria-valuenow', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Preparar fuentes y configuración' }))
    expect(configure).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Describir un encargo' }))
    expect(request).toHaveBeenCalledOnce()
  })
  it('prioritizes describing the work item when acceptance and budget are the unresolved inputs', () => {
    render(<ProjectPreparation preparation={{ version: 1, checks: [
      { key: 'objective', title: 'Objetivo', state: 'ready', detail: 'Listo' },
      { key: 'repositories', title: 'Repositorios', state: 'ready', detail: 'Listo' },
      { key: 'runtime', title: 'Capacidad', state: 'ready', detail: 'Listo' },
      { key: 'acceptance', title: 'Aceptación', state: 'unknown', detail: 'Se define por encargo' },
      { key: 'budget', title: 'Presupuesto', state: 'unknown', detail: 'Se reserva por encargo' },
      { key: 'remote_sync', title: 'Remoto', state: 'unknown', detail: 'Se revalida' },
      { key: 'sandbox', title: 'Aislamiento', state: 'ready', detail: 'Listo' },
    ] }} onConfigure={vi.fn()} onRequest={vi.fn()} initiallyOpen />)
    expect(screen.getByRole('status', { name: 'Siguiente acción de preparación' })).toHaveTextContent('Describir un encargo')
    expect(screen.getByRole('button', { name: 'Describir un encargo' })).toHaveClass('bg-ink')
    expect(screen.getByRole('button', { name: 'Preparar fuentes y configuración' })).toHaveClass('border')
  })
  it('does not treat an empty preparation diagnostic as ready', () => {
    render(<ProjectPreparation preparation={{ version: 1, checks: [] }} onConfigure={vi.fn()} onRequest={vi.fn()} initiallyOpen />)
    expect(screen.getByText('Comprobar requisitos')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Siguiente acción de preparación' })).toHaveTextContent('no ha enviado requisitos verificables')
    expect(screen.getByRole('progressbar', { name: 'Requisitos listos' })).toHaveAttribute('aria-valuenow', '0')
  })
})
