import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AssignBottomSheet } from '@/components/events/seating/assign-bottom-sheet'
import { SeatingPlanV2 } from '@/components/events/seating/seating-plan-v2'
import { TableFormModal } from '@/components/events/seating/table-form-modal'
import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

const mocks = vi.hoisted(() => ({
  workspace: { tables: [] as unknown[], guests: [] as unknown[] },
  mutate: vi.fn(),
  put: vi.fn(),
}))

vi.mock('swr', () => ({
  default: () => ({
    data: mocks.workspace,
    isLoading: false,
    isValidating: false,
    error: undefined,
    mutate: mocks.mutate,
  }),
}))

vi.mock('@/lib/api', () => ({ api: { put: mocks.put } }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { toast } from 'sonner'

const now = '2026-10-01T00:00:00Z'

function table(overrides: Partial<Table> = {}): Table {
  return {
    id: 'T1',
    event_id: 'e',
    name: 'Mesa 1',
    capacity: 8,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g-1',
    event_id: 'e',
    first_name: 'Ana',
    last_name: 'Garcia',
    guests_count: 1,
    status_id: 's',
    table_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function openMoveSheet(name: RegExp) {
  const chip = screen.getAllByText(name)[0].closest('div')!.parentElement!
  fireEvent.click(within(chip).getByRole('button', { name: 'Mover invitado' }))
}

describe('SeatingPlanV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutate.mockResolvedValue(undefined)
  })

  it('refuses a mobile move that would exceed the table capacity (SEAT-1)', () => {
    mocks.workspace = {
      tables: [table({ id: 'T1', name: 'Mesa 1', capacity: 8 })],
      guests: [
        guest({ id: 'g-seated', first_name: 'Sentado', guests_count: 6, table_id: 'T1' }),
        guest({ id: 'g-party', first_name: 'Familia', guests_count: 4 }),
      ],
    }
    render(<SeatingPlanV2 eventId="e" />)

    openMoveSheet(/Familia/)
    const option = screen.getByRole('button', { name: /Mesa 1.*Sin lugar suficiente/ })
    expect(option).toBeDisabled()
    expect(within(option).getByText('Sin lugar suficiente: quedan 2, se necesitan 4')).toBeInTheDocument()
  })

  it('skips declined guests in auto-assign and in the unassigned list (SEAT-6)', () => {
    mocks.workspace = {
      tables: [table({ id: 'T1', capacity: 8 })],
      guests: [
        guest({ id: 'g-ok', first_name: 'Confirmada', rsvp_status: 'confirmed', guests_count: 2 }),
        guest({ id: 'g-no', first_name: 'Declinada', rsvp_status: 'declined' }),
      ],
    }
    const onUnsaved = vi.fn()
    render(<SeatingPlanV2 eventId="e" onUnsavedChangesChange={onUnsaved} />)

    expect(screen.queryByText(/Declinada/)).not.toBeInTheDocument()
    expect(screen.getByText('1 invitado declinó la invitación y no necesita mesa.')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))

    expect(screen.getAllByRole('button', { name: /Guardar cambios \(1\)/ }).length).toBeGreaterThan(0)
    expect(onUnsaved).toHaveBeenLastCalledWith(true)
  })

  it('keeps the mobile save bar above the floating tab bar (GST-N3)', () => {
    mocks.workspace = {
      tables: [table({ id: 'T1', capacity: 8 })],
      guests: [guest({ id: 'g-ok', first_name: 'Confirmada', rsvp_status: 'confirmed' })],
    }
    render(<SeatingPlanV2 eventId="e" />)
    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))

    const bar = screen.getByTestId('seating-mobile-save-bar')
    expect(bar.className).toMatch(/bottom-\[var\(--app-mobile-nav-offset,0px\)\]/)
    expect(bar.className).not.toMatch(/bottom-0/)
  })

  it('warns before unload while there are unsaved changes (SEAT-5)', () => {
    mocks.workspace = {
      tables: [table({ id: 'T1' })],
      guests: [guest({ id: 'g-1', first_name: 'Ana' })],
    }
    render(<SeatingPlanV2 eventId="e" />)

    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)

    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(true)
  })

  it('shows the Spanish capacity message and highlights the table on a 409 (SEAT-1)', async () => {
    mocks.workspace = {
      tables: [table({ id: 'T1', name: 'Mesa Novios', capacity: 8 })],
      guests: [guest({ id: 'g-1', first_name: 'Ana' })],
    }
    mocks.put.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          status: 409,
          code: 'table_over_capacity',
          error: 'table_over_capacity',
          message: 'La mesa «Mesa Novios» (10 de 8 lugares) no tiene lugar suficiente.',
          table_ids: ['T1'],
          data: { table_ids: ['T1'], tables: [{ table_id: 'T1', name: 'Mesa Novios', capacity: 8, seats: 10 }] },
        },
      },
    })
    render(<SeatingPlanV2 eventId="e" />)

    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))
    fireEvent.click(screen.getAllByRole('button', { name: /Guardar cambios/ })[0])

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'La mesa «Mesa Novios» (10 de 8 lugares) no tiene lugar suficiente. Mueve invitados o aumenta la capacidad.'
      )
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Supera su capacidad')
  })

  it('builds the capacity message from data.tables when the 409 has no message (SEAT-1)', async () => {
    mocks.workspace = {
      tables: [table({ id: 'T1', name: 'Mesa Novios', capacity: 8 })],
      guests: [guest({ id: 'g-1', first_name: 'Ana' })],
    }
    mocks.put.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          error: 'table_over_capacity',
          data: { tables: [{ table_id: 'T1', name: 'X', capacity: 8, seats: 9 }] },
        },
      },
    })
    render(<SeatingPlanV2 eventId="e" />)

    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))
    fireEvent.click(screen.getAllByRole('button', { name: /Guardar cambios/ })[0])

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'No se guardó: no hay lugar suficiente en «Mesa Novios» (9 de 8 lugares). Mueve invitados o aumenta la capacidad.'
      )
    })
  })

  it('reloads the workspace and shows the server message on seating_plan_stale (SEAT-4)', async () => {
    mocks.workspace = { tables: [table({ id: 'T1' })], guests: [guest({ id: 'g-1', first_name: 'Ana' })] }
    const message =
      'Algunos invitados o mesas cambiaron mientras editabas. Recarga el plan de mesas e inténtalo de nuevo.'
    mocks.put.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'seating_plan_stale', error: 'seating_plan_stale', message } },
    })
    render(<SeatingPlanV2 eventId="e" />)

    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))
    fireEvent.click(screen.getAllByRole('button', { name: /Guardar cambios/ })[0])

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(message, { id: 'seating-plan-stale' }))
    expect(mocks.mutate).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('refreshes the workspace instead of a generic error when a stale draft is refused (SEAT-4)', async () => {
    const t1 = table({ id: 'T1' })
    mocks.workspace = { tables: [t1], guests: [guest({ id: 'g-1', first_name: 'Ana' })] }
    mocks.put.mockRejectedValueOnce({
      response: { status: 400, data: { message: 'one or more guests do not belong to event' } },
    })
    // The fresh workspace no longer has the guest that was moved.
    mocks.mutate.mockResolvedValueOnce({ tables: [t1], guests: [] })
    render(<SeatingPlanV2 eventId="e" />)

    fireEvent.click(screen.getByTitle('Asignar invitados sin mesa automáticamente'))
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Guardar cambios/ })[0])
    })

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('AssignBottomSheet', () => {
  it('keeps the current table usable and blocks tables without room for the whole party', () => {
    render(
      <AssignBottomSheet
        isOpen
        onClose={vi.fn()}
        guest={guest({ guests_count: 3 })}
        currentTableId={null}
        tables={[table({ id: 'A', name: 'Mesa A', capacity: 4 }), table({ id: 'B', name: 'Mesa B', capacity: 4 })]}
        tableOccupancy={
          new Map([
            ['A', 2],
            ['B', 1],
          ])
        }
        onAssign={vi.fn()}
        onCreateTable={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /Mesa A/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Mesa B/ })).toBeEnabled()
  })

  it('renders outside the page wrapper and scrolls so "Crear nueva mesa" stays reachable (GST-N3)', () => {
    const { container } = render(
      <div className="page-transition">
        <AssignBottomSheet
          isOpen
          onClose={vi.fn()}
          guest={guest()}
          currentTableId={null}
          tables={Array.from({ length: 12 }, (_, i) => table({ id: `T${i}`, name: `Mesa ${i}` }))}
          tableOccupancy={new Map()}
          onAssign={vi.fn()}
          onCreateTable={vi.fn()}
        />
      </div>
    )
    const sheet = screen.getByRole('dialog')
    // Portaled to body: a transformed ancestor cannot become its containing block or stacking context.
    expect(container.contains(sheet)).toBe(false)
    expect(sheet.className).toMatch(/max-h-\[min\(80dvh/)
    const create = screen.getByRole('button', { name: /Crear nueva mesa/ })
    const scroller = create.parentElement as HTMLElement
    expect(scroller.className).toMatch(/overflow-y-auto/)
    expect(scroller.className).toMatch(/safe-area-inset-bottom/)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })
})

describe('TableFormModal', () => {
  it('refuses a capacity below the seats already taken (SEAT-1)', async () => {
    const onSubmit = vi.fn()
    render(
      <TableFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} table={table({ capacity: 8 })} minCapacity={6} />
    )
    fireEvent.change(screen.getByLabelText('Capacidad (asistentes)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Ya hay 6 lugares ocupados en esta mesa. Mueve invitados antes de bajar la capacidad.')
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
