import { describe, expect, test } from 'bun:test'
import { checkoutTotals, initialCart } from '../../src/lib/checkout'

describe('checkout pricing', () => {
  test('calculates the example order in cents', () => {
    expect(checkoutTotals(initialCart(), 'standard', false)).toEqual({ subtotal: 24200, discount: 0, shipping: 0, tax: 1936, total: 26136 })
  })
  test('discounts merchandise before tax and the free-shipping threshold', () => {
    expect(checkoutTotals([{ id: 'stand', quantity: 3 }], 'standard', true)).toEqual({ subtotal: 20700, discount: 2070, shipping: 800, tax: 1490, total: 20920 })
    expect(checkoutTotals(initialCart(), 'standard', true).total).toBe(23522)
  })
  test('charges express delivery even above the free-shipping threshold', () => {
    expect(checkoutTotals(initialCart(), 'express', true).total).toBe(25022)
  })
  test('has no shipping or tax charges for an empty cart', () => {
    expect(checkoutTotals([], 'express', true)).toEqual({ subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 })
  })
})
