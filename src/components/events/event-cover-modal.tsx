'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { EventCoverUpload } from '@/components/events/event-cover-upload'
import type { Event } from '@/models/Event'

interface EventCoverModalProps {
  event: Event
  onClose: () => void
  onChanged: () => void
}

export function EventCoverModal({ event, onClose, onChanged }: EventCoverModalProps) {
  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Administrar portada</DialogTitle>
      <DialogDescription>
        Usa una imagen horizontal de alta calidad. Se mostrará en el dashboard y en la experiencia pública.
      </DialogDescription>

      <DialogBody>
        <EventCoverUpload event={event} onChanged={onChanged} />
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
