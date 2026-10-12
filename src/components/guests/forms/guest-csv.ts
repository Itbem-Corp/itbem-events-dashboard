import { GUEST_PARTY_SIZE_MAX, GUEST_TEXT_LIMITS, tooLongMessage } from './guest-write-errors'

/**
 * Guest CSV import parsing (GST-2, GST-12, GST-13).
 *
 * - Decodes UTF-8 (with or without BOM), UTF-16 with BOM, and falls back to
 *   Windows-1252 when the bytes are not valid UTF-8 (Excel "CSV (delimitado por comas)").
 * - Detects `;`, `,` or tab as the delimiter and parses quoted fields, `""` escapes and
 *   quoted line breaks.
 * - Maps columns by header name, Spanish and English aliases, including the dashboard's
 *   own export headers. A file without a recognised header is read positionally, and its
 *   first row is kept as a guest: in the order of the downloadable template when rows have
 *   up to 7 columns, in the legacy order (with "mesa") when they have 8 or more (GST-86).
 * - The export prefixes `'` to values that start with = + - @ so spreadsheets do not run
 *   them as formulas; a re-import drops that prefix from phone numbers (GST-21).
 * - Party size: "Acompañantes" / "+1s" are the people who come WITH the guest, so the
 *   invitation allows 1 + acompañantes. "Asistentes" is already the total party.
 */

// The server accepts a party of up to 100 (invalid_party_size above that).
export const GUEST_PARTY_MAX = GUEST_PARTY_SIZE_MAX
export const GUEST_COMPANIONS_MAX = GUEST_PARTY_MAX - 1

export interface ParsedGuestRow {
  /** Line of the file the row came from (1-based, header included), for error messages. */
  line: number
  first_name: string
  last_name: string
  email: string
  phone: string
  companions: number
  order: number | ''
  role: string
}

export interface CsvRowIssue {
  line: number
  field: 'companions'
  /** Spanish message without the row prefix. */
  message: string
}

export interface GuestCsvResult {
  rows: ParsedGuestRow[]
  issues: CsvRowIssue[]
  headerDetected: boolean
  /** Header names present in the file that the import does not use (e.g. "Mesa"). */
  ignoredColumns: string[]
  /** Data rows found, before skipping blank ones. */
  dataRowCount: number
}

type Column =
  'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'companions' | 'party' | 'table' | 'order' | 'role'

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADER_ALIASES: Record<Column, string[]> = {
  first_name: ['nombre', 'nombres', 'first name', 'firstname', 'given name'],
  last_name: ['apellido', 'apellidos', 'last name', 'lastname', 'surname', 'family name'],
  full_name: ['nombre completo', 'full name', 'name', 'invitado'],
  email: ['correo', 'correo electronico', 'email', 'e mail', 'mail'],
  phone: ['telefono', 'tel', 'celular', 'movil', 'whatsapp', 'phone', 'phone number', 'mobile'],
  companions: ['acompanantes', 'acompanante', '+1s', '+1', 'plus ones', 'plus one', 'companions'],
  party: [
    'asistentes',
    'personas',
    'no personas',
    'numero de personas',
    'total personas',
    'total',
    'party size',
    'guests count',
    'guest count',
    'guests',
    'max guests',
    'maximo',
    'cupo',
  ],
  table: ['mesa', 'mesa asignada', 'table', 'table number', 'table name'],
  order: ['orden', 'order', 'orden publico'],
  role: ['rol', 'role', 'rol publico'],
}

const ALIAS_TO_COLUMN = new Map<string, Column>()
for (const [column, aliases] of Object.entries(HEADER_ALIASES) as Array<[Column, string[]]>) {
  for (const alias of aliases) ALIAS_TO_COLUMN.set(alias, column)
}

/** Positional order of the downloadable template (`downloadTemplate` in guest-batch-modal). */
const TEMPLATE_ORDER: Column[] = ['first_name', 'last_name', 'email', 'phone', 'companions', 'order', 'role']
/** Older template with a table column, still read when a header-less file has 8+ columns. */
const LEGACY_ORDER: Column[] = ['first_name', 'last_name', 'email', 'phone', 'companions', 'table', 'order', 'role']

/**
 * Undo the export's formula neutralisation on a phone number: `'+52 55 1234 5678` → `+52 55 1234 5678`.
 * Only a value that is a phone number once the quote is gone is touched.
 */
export function stripFormulaGuard(value: string): string {
  if (!value.startsWith("'")) return value
  const rest = value.slice(1)
  return /^[=+\-@]/.test(rest) && /^[+\-]?[\d\s().\-]+$/.test(rest) ? rest : value
}

export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const body = hasUtf8Bom ? bytes.subarray(3) : bytes
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    // Not valid UTF-8: Excel on Windows saves "CSV (delimitado por comas)" as Windows-1252.
    return new TextDecoder('windows-1252').decode(body)
  }
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  let best = ','
  for (const candidate of [';', '\t']) {
    if (counts[candidate] > counts[best]) best = candidate
  }
  return best
}

/** RFC 4180 style parser: quoted fields, `""` escapes, quoted line breaks, CRLF or LF. */
export function parseCsvRecords(text: string, delimiter: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1

  const endRecord = () => {
    cells.push(field)
    records.push({ line: recordLine, cells })
    cells = []
    field = ''
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(field)
      field = ''
    } else if (ch === '\r') {
      // Handled with the following \n; a lone \r also ends the record.
      if (text[i + 1] !== '\n') {
        endRecord()
        line++
        recordLine = line
      }
    } else if (ch === '\n') {
      endRecord()
      line++
      recordLine = line
    } else {
      field += ch
    }
  }
  if (field !== '' || cells.length > 0) endRecord()
  return records
}

function mapHeader(cells: string[]): Array<Column | null> | null {
  const mapped = cells.map((cell) => ALIAS_TO_COLUMN.get(normalizeHeader(cell)) ?? null)
  const known = mapped.filter(Boolean) as Column[]
  const hasName = known.some((column) => column === 'first_name' || column === 'full_name')
  // A header names the guest, or at least two known columns.
  return hasName || new Set(known).size >= 2 ? mapped : null
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^[+-]?\d+$/.test(trimmed)) return NaN
  return Number(trimmed)
}

export function parsePublicOrder(value: string): number | '' {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const number = Number(trimmed)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : ''
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidGuestEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

export function parseGuestCsv(text: string): GuestCsvResult {
  const delimiter = detectDelimiter(text)
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ''), delimiter)
  const issues: CsvRowIssue[] = []
  if (records.length === 0) return { rows: [], issues, headerDetected: false, ignoredColumns: [], dataRowCount: 0 }

  const header = mapHeader(records[0].cells)
  const headerDetected = header !== null
  // A loop, not Math.max(...spread): a large file has more records than the
  // engine accepts as call arguments, and this runs before any row cap.
  let widest = 0
  if (!header) for (const record of records) if (record.cells.length > widest) widest = record.cells.length
  const columns = header ?? (widest >= LEGACY_ORDER.length ? LEGACY_ORDER : TEMPLATE_ORDER)
  const dataRecords = headerDetected ? records.slice(1) : records
  const ignoredColumns = headerDetected
    ? records[0].cells.filter((cell, index) => cell.trim() && (columns[index] === null || columns[index] === 'table'))
    : []
  const hasColumn = (column: Column) => columns.includes(column)

  const rows: ParsedGuestRow[] = []
  let dataRowCount = 0
  for (const record of dataRecords) {
    if (record.cells.every((cell) => !cell.trim())) continue
    dataRowCount++
    const value = (column: Column) => {
      const index = columns.indexOf(column)
      return index >= 0 ? (record.cells[index] ?? '').trim() : ''
    }

    let firstName = value('first_name')
    let lastName = value('last_name')
    if (!hasColumn('last_name')) {
      // A single name column ("Nombre" in the RSVP export, or "Nombre completo"): split it.
      const full = (firstName || value('full_name')).replace(/\s+/g, ' ')
      const space = full.indexOf(' ')
      firstName = space > 0 ? full.slice(0, space) : full
      lastName = space > 0 ? full.slice(space + 1) : ''
    } else if (!firstName) {
      firstName = value('full_name')
    }

    // Party size: 1 + acompañantes, or the "Asistentes" total when that is all the file has.
    let companions = 0
    const companionsRaw = value('companions')
    const partyRaw = value('party')
    if (companionsRaw) {
      const parsed = parseInteger(companionsRaw)
      if (parsed === null || Number.isNaN(parsed) || parsed < 0 || parsed > GUEST_COMPANIONS_MAX) {
        issues.push({
          line: record.line,
          field: 'companions',
          message: `Acompañantes debe ser un número entre 0 y ${GUEST_COMPANIONS_MAX} (el archivo dice "${companionsRaw}")`,
        })
      } else {
        companions = parsed
      }
    } else if (partyRaw) {
      const parsed = parseInteger(partyRaw)
      if (parsed === null || Number.isNaN(parsed) || parsed < 0 || parsed > GUEST_PARTY_MAX) {
        issues.push({
          line: record.line,
          field: 'companions',
          message: `Asistentes debe ser un número entre 1 y ${GUEST_PARTY_MAX} (el archivo dice "${partyRaw}")`,
        })
      } else {
        // A declined guest exports 0 attendees; the invitation still needs room for the guest.
        companions = Math.max(parsed, 1) - 1
      }
    }

    const orderRaw = value('order')
    const explicitRole = value('role')
    const order = parsePublicOrder(orderRaw)
    let role = explicitRole
    // Legacy templates put the role in the order column.
    if (!role && order === '' && orderRaw) role = orderRaw

    rows.push({
      line: record.line,
      first_name: firstName,
      last_name: lastName,
      email: value('email'),
      phone: stripFormulaGuard(value('phone')),
      companions,
      order,
      role,
    })
  }

  return { rows, issues, headerDetected, ignoredColumns, dataRowCount }
}

/** Row checks shared by the CSV import and the manual grid, in Spanish. */
export interface GuestRowProblems {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
}

function tooLong(value: string, max: number): boolean {
  return Array.from(value.trim()).length > max
}

export function guestRowProblems(row: {
  first_name: string
  last_name: string
  email: string
  phone?: string
}): GuestRowProblems {
  const problems: GuestRowProblems = {}
  if (!row.first_name.trim()) problems.first_name = 'El nombre es obligatorio'
  else if (row.first_name.trim().length < 2) problems.first_name = 'Mínimo 2 caracteres'
  else if (tooLong(row.first_name, GUEST_TEXT_LIMITS.first_name))
    problems.first_name = tooLongMessage(GUEST_TEXT_LIMITS.first_name)
  if (!row.last_name.trim()) problems.last_name = 'El apellido es obligatorio'
  else if (row.last_name.trim().length < 2) problems.last_name = 'Mínimo 2 caracteres'
  else if (tooLong(row.last_name, GUEST_TEXT_LIMITS.last_name))
    problems.last_name = tooLongMessage(GUEST_TEXT_LIMITS.last_name)
  if (tooLong(row.email, GUEST_TEXT_LIMITS.email)) problems.email = tooLongMessage(GUEST_TEXT_LIMITS.email)
  else if (row.email.trim() && !isValidGuestEmail(row.email)) problems.email = 'Correo inválido'
  if (row.phone && tooLong(row.phone, GUEST_TEXT_LIMITS.phone))
    problems.phone = `Teléfono: ${tooLongMessage(GUEST_TEXT_LIMITS.phone).toLowerCase()}`
  return problems
}

export function partySizeFromCompanions(companions: number): number {
  const safe = Number.isFinite(companions) ? Math.trunc(companions) : 0
  return Math.min(Math.max(safe, 0), GUEST_COMPANIONS_MAX) + 1
}

/** Why an import row looks like a guest that is already in the event, or earlier in the file. */
export interface GuestDuplicate {
  reason: 'email' | 'phone' | 'name'
  /** 'event' = already a guest of the event; 'file' = repeats an earlier row of the import. */
  source: 'event' | 'file'
}

interface DuplicateCandidate {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

function duplicateKeys(guest: DuplicateCandidate): Array<[GuestDuplicate['reason'], string]> {
  const keys: Array<[GuestDuplicate['reason'], string]> = []
  const email = (guest.email ?? '').trim().toLowerCase()
  if (email) keys.push(['email', email])
  const digits = (guest.phone ?? '').replace(/\D/g, '')
  // Short fragments ("55", an extension) would match unrelated guests.
  if (digits.length >= 7) keys.push(['phone', digits])
  const name = normalizeHeader(`${guest.first_name ?? ''} ${guest.last_name ?? ''}`)
  if (name) keys.push(['name', name])
  return keys
}

/**
 * Rows that match an existing guest of the event (same e-mail, phone digits or full name,
 * ignoring case and accents) or an earlier row of the same import (GST-21). Keys are row indexes.
 */
export function findDuplicateGuestRows(
  rows: DuplicateCandidate[],
  existing: DuplicateCandidate[]
): Map<number, GuestDuplicate> {
  const known = new Map<string, GuestDuplicate['source']>()
  for (const guest of existing) {
    for (const [reason, key] of duplicateKeys(guest)) known.set(`${reason}:${key}`, 'event')
  }
  const result = new Map<number, GuestDuplicate>()
  rows.forEach((row, index) => {
    const keys = duplicateKeys(row)
    for (const [reason, key] of keys) {
      const source = known.get(`${reason}:${key}`)
      if (source) {
        result.set(index, { reason, source })
        break
      }
    }
    for (const [reason, key] of keys) {
      if (!known.has(`${reason}:${key}`)) known.set(`${reason}:${key}`, 'file')
    }
  })
  return result
}
