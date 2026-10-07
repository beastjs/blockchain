export const PRODUCTS = [
  { id: 'headphones', name: 'Studio headphones', detail: 'Graphite / Wireless', price: 14900, image: '/products/headphones.svg', category: 'SOUND, WITHOUT LIMITS' },
  { id: 'stand', name: 'Elevated laptop stand', detail: 'Space gray / Aluminum', price: 6900, image: '/products/stand.svg', category: 'A BETTER POINT OF VIEW' },
  { id: 'cable', name: 'Everyday USB-C cable', detail: 'Slate / 2 meters', price: 2400, image: '/products/cable.svg', category: 'STAY CONNECTED' },
] as const

export type CartItem = { id: string; quantity: number }
export type Delivery = 'standard' | 'express'
export const initialCart = (): CartItem[] => PRODUCTS.map(product => ({ id: product.id, quantity: 1 }))
export const formatPrice = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function checkoutTotals(cart: CartItem[], delivery: Delivery, discounted: boolean) {
  const subtotal = cart.reduce((sum, item) => sum + (PRODUCTS.find(product => product.id === item.id)?.price ?? 0) * item.quantity, 0)
  const discount = discounted ? Math.round(subtotal * 0.1) : 0
  const shipping = subtotal === 0 ? 0 : delivery === 'express' ? 1500 : subtotal - discount >= 20000 ? 0 : 800
  const tax = Math.round((subtotal - discount) * 0.08)
  return { subtotal, discount, shipping, tax, total: subtotal - discount + shipping + tax }
}

export function readCart(): CartItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('block.checkout.cart.v1') ?? 'null')
    if (Array.isArray(saved) && saved.length <= PRODUCTS.length && saved.every(item => item && typeof item === 'object' && PRODUCTS.some(product => product.id === item.id) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10) && new Set(saved.map(item => item.id)).size === saved.length) return saved
  } catch { /* Use the example cart if storage is unavailable or invalid. */ }
  return initialCart()
}

export function persistCart(cart: CartItem[]) {
  try { localStorage.setItem('block.checkout.cart.v1', JSON.stringify(cart)) } catch { /* Cart remains available for this session. */ }
}
