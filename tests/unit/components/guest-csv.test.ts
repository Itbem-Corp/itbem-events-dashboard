import { describe, expect, it } from 'vitest'

import {
  decodeCsvBytes,
  detectDelimiter,
  findDuplicateGuestRows,
  stripFormulaGuard,
  guestRowProblems,
  parseGuestCsv,
  partySizeFromCompanions,
} from '@/components/guests/forms/guest-csv'

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

describe('guest CSV import parsing', () => {
  it('reads acompañantes as people besides the guest (GST-2)', () => {
    const result = parseGuestCsv('nombre,apellido,correo,telefono,acompanantes\nAna,Garcia,ana@example.com,,1\n')
    expect(result.rows[0]).toMatchObject({ first_name: 'Ana', companions: 1, line: 2 })
    expect(partySizeFromCompanions(result.rows[0].companions)).toBe(2)
  })

  it('maps the dashboard export by header name and ignores the table column (GST-12)', () => {
    const csv =
      '\uFEFFNombre,Apellido,Email,Teléfono,Mesa,Asistentes,Acompañantes,Estado,Restricciones,Notas RSVP,Notas internas\n' +
      'Ana,Peña,ana@example.com,+52 55 1,Mesa 3,3,2,CONFIRMED,,,\n'
    const result = parseGuestCsv(csv)
    expect(result.headerDetected).toBe(true)
    expect(result.rows[0]).toMatchObject({
      first_name: 'Ana',
      last_name: 'Peña',
      email: 'ana@example.com',
      phone: '+52 55 1',
      companions: 2,
    })
    expect(result.ignoredColumns).toContain('Mesa')
  })

  it('uses Asistentes as the total party when there is no companions column', () => {
    const result = parseGuestCsv('Nombre;Apellido;Asistentes\nAna;Garcia;4\nLuis;Perez;0\n')
    expect(result.rows.map((row) => row.companions)).toEqual([3, 0])
  })

  it('splits a single full-name column like the RSVP export', () => {
    const result = parseGuestCsv(
      'Nombre,Email,Teléfono,Estado,Canal,+1s\nAna María López,ana@example.com,,PENDING,,1\n'
    )
    expect(result.rows[0]).toMatchObject({ first_name: 'Ana', last_name: 'María López', companions: 1 })
  })

  it('detects semicolon delimiters from Excel es-ES', () => {
    expect(detectDelimiter('nombre;apellido;correo\nAna;Garcia;a@b.co')).toBe(';')
    const result = parseGuestCsv('nombre;apellido;correo\nAna;Garcia;ana@example.com\n')
    expect(result.rows[0]).toMatchObject({ first_name: 'Ana', last_name: 'Garcia', email: 'ana@example.com' })
  })

  it('keeps the first row of a file without a header, using the template order', () => {
    const result = parseGuestCsv('Ana,Garcia,ana@example.com,,2\nLuis,Perez,,,0\n')
    expect(result.headerDetected).toBe(false)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ first_name: 'Ana', companions: 2, line: 1 })
  })

  it('reads a header-less file in the order of the downloadable template (GST-86)', () => {
    const result = parseGuestCsv(
      'Nico,QA Sin,nico@example.com,5511112222,1,3,graduate\nOlga,QA Sin,,,0,,\n'
    )
    expect(result.headerDetected).toBe(false)
    expect(result.rows[0]).toMatchObject({ first_name: 'Nico', companions: 1, order: 3, role: 'graduate' })
    expect(result.rows[1]).toMatchObject({ first_name: 'Olga', order: '', role: '' })
  })

  it('still reads the legacy 8-column header-less order with a table column', () => {
    const result = parseGuestCsv('Ana,Garcia,ana@example.com,,1,Mesa 2,4,host\n')
    expect(result.rows[0]).toMatchObject({ first_name: 'Ana', companions: 1, order: 4, role: 'host' })
  })

  it("drops the export's formula guard from phone numbers only (GST-21)", () => {
    expect(stripFormulaGuard("'+52 55 9999 0000")).toBe('+52 55 9999 0000')
    expect(stripFormulaGuard("'=HYPERLINK(1)")).toBe("'=HYPERLINK(1)")
    expect(stripFormulaGuard("'5511112222")).toBe("'5511112222")
    const csv = "Nombre,Apellido,Email,Teléfono\nAna,García,ana@example.com,'+52 55 9999 0000\n"
    expect(parseGuestCsv(csv).rows[0].phone).toBe('+52 55 9999 0000')
  })

  it('finds rows repeated against the event and inside the file (GST-21)', () => {
    const duplicates = findDuplicateGuestRows(
      [
        { first_name: 'Ana', last_name: 'Garcia', email: 'otra@example.com', phone: '' },
        { first_name: 'Beto', last_name: 'Ruiz', email: '', phone: '+52 (55) 1234-5678' },
        { first_name: 'Caro', last_name: 'Diaz', email: 'caro@example.com', phone: '' },
        { first_name: 'Carolina', last_name: 'Otra', email: 'CARO@example.com', phone: '' },
        { first_name: 'Dani', last_name: 'Nuevo', email: '', phone: '55' },
      ],
      [
        { first_name: 'Ána', last_name: 'García', email: 'ana@example.com', phone: null },
        { first_name: 'X', last_name: 'Y', email: null, phone: "'+52 55 1234 5678" },
        { first_name: 'Z', last_name: 'W', email: null, phone: '55' },
      ]
    )
    expect(Object.fromEntries(duplicates)).toEqual({
      0: { reason: 'name', source: 'event' },
      1: { reason: 'phone', source: 'event' },
      3: { reason: 'email', source: 'file' },
    })
  })

  it('handles quoted delimiters, escaped quotes and quoted line breaks', () => {
    const result = parseGuestCsv(
      'nombre,apellido,rol\r\n"Ana, la jefa","O""Brien","host"\r\n"Luis","Pérez\nSegundo",\r\n'
    )
    expect(result.rows[0]).toMatchObject({ first_name: 'Ana, la jefa', last_name: 'O"Brien', role: 'host' })
    expect(result.rows[1]).toMatchObject({ first_name: 'Luis', last_name: 'Pérez\nSegundo', line: 3 })
  })

  it('reports an invalid companions value with its file line', () => {
    const result = parseGuestCsv('nombre,apellido,acompanantes\nAna,Garcia,dos\n')
    expect(result.issues).toEqual([
      {
        line: 2,
        field: 'companions',
        message: expect.stringContaining('Acompañantes debe ser un número entre 0 y 99'),
      },
    ])
  })

  it('checks required names and email format in Spanish (GST-13)', () => {
    expect(guestRowProblems({ first_name: '', last_name: 'Garcia', email: 'no-es-correo' })).toEqual({
      first_name: 'El nombre es obligatorio',
      email: 'Correo inválido',
    })
    expect(guestRowProblems({ first_name: 'Ana', last_name: 'Garcia', email: '' })).toEqual({})
  })
})

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 with and without BOM', () => {
    expect(decodeCsvBytes(bytes(0xef, 0xbb, 0xbf, 0x50, 0x65, 0xc3, 0xb1, 0x61))).toBe('Peña')
    expect(decodeCsvBytes(bytes(0x50, 0x65, 0xc3, 0xb1, 0x61))).toBe('Peña')
  })

  it('falls back to Windows-1252 when the bytes are not valid UTF-8', () => {
    expect(decodeCsvBytes(bytes(0x50, 0x65, 0xf1, 0x61))).toBe('Peña')
  })

  it('decodes UTF-16 LE files with BOM', () => {
    expect(decodeCsvBytes(bytes(0xff, 0xfe, 0x41, 0x00, 0xf1, 0x00))).toBe('Añ')
  })

  it('parses a file with more records than the engine accepts as call arguments', () => {
    // Headerless, so the column layout is chosen from the widest record.
    const text = Array.from({ length: 300_000 }, (_, i) => `Invitado ${i}`).join('\n')
    const parsed = parseGuestCsv(text)
    expect(parsed.headerDetected).toBe(false)
    expect(parsed.dataRowCount).toBe(300_000)
  })
})
