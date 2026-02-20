import { describe, it, expect } from 'vitest'
import { toSnakeCase, normalizeKeys } from '@/lib/normalizer'

describe('toSnakeCase', () => {
    it('converts simple PascalCase to snake_case', () => {
        expect(toSnakeCase('FirstName')).toBe('first_name')
        expect(toSnakeCase('LastName')).toBe('last_name')
    })

    it('converts camelCase to snake_case', () => {
        expect(toSnakeCase('cognitoSub')).toBe('cognito_sub')
        expect(toSnakeCase('isActive')).toBe('is_active')
    })

    it('handles consecutive uppercase letters (acronyms)', () => {
        expect(toSnakeCase('HTMLParser')).toBe('html_parser')
        expect(toSnakeCase('APIKey')).toBe('api_key')
    })

    it('returns already snake_case strings unchanged', () => {
        expect(toSnakeCase('first_name')).toBe('first_name')
        expect(toSnakeCase('is_active')).toBe('is_active')
    })

    it('converts single word correctly', () => {
        expect(toSnakeCase('Email')).toBe('email')
        expect(toSnakeCase('Id')).toBe('id')
    })
})

describe('normalizeKeys', () => {
    it('normalizes keys of a flat object', () => {
        const result = normalizeKeys({ FirstName: 'John', LastName: 'Doe' })
        expect(result).toEqual({ first_name: 'John', last_name: 'Doe' })
    })

    it('passes through null', () => {
        expect(normalizeKeys(null)).toBeNull()
    })

    it('passes through primitives', () => {
        expect(normalizeKeys(42)).toBe(42)
        expect(normalizeKeys('hello')).toBe('hello')
        expect(normalizeKeys(true)).toBe(true)
    })

    it('normalizes keys recursively in nested objects', () => {
        const result = normalizeKeys({
            UserData: {
                FirstName: 'Jane',
                Address: { StreetName: 'Main St' },
            },
        })
        expect(result).toEqual({
            user_data: {
                first_name: 'Jane',
                address: { street_name: 'Main St' },
            },
        })
    })

    it('normalizes keys in arrays of objects', () => {
        const result = normalizeKeys([
            { EventName: 'Party', IsActive: true },
            { EventName: 'Concert', IsActive: false },
        ])
        expect(result).toEqual([
            { event_name: 'Party', is_active: true },
            { event_name: 'Concert', is_active: false },
        ])
    })

    it('handles arrays nested inside objects', () => {
        const result = normalizeKeys({
            EventList: [{ EventId: 1 }, { EventId: 2 }],
        })
        expect(result).toEqual({
            event_list: [{ event_id: 1 }, { event_id: 2 }],
        })
    })
})
