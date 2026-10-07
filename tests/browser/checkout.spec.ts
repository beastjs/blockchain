import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function fillAddress(page: Page) {
  for (const [label, value] of Object.entries({ 'Email address': 'alex@example.com', 'First name': 'Alex', 'Last name': 'Morgan', 'Street address': '123 Market Street', City: 'San Francisco', 'State / province': 'California', 'Postal code': '94103' })) {
    await page.getByLabel(label, { exact: true }).fill(value)
  }
}

test('direct route, navigation history and cart edits persist', async ({ page }) => {
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible()
  await expect(page.getByTestId('checkout-total')).toHaveText('$261.36')
  await page.getByRole('button', { name: 'Increase Studio headphones quantity', exact: true }).click()
  await expect(page.getByTestId('checkout-total')).toHaveText('$422.28')
  await page.reload()
  await expect(page.getByTestId('checkout-total')).toHaveText('$422.28')
  await page.getByRole('button', { name: 'Decrease Studio headphones quantity', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Decrease Studio headphones quantity', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Remove Everyday USB-C cable', exact: true }).click()
  await expect(page.getByTestId('checkout-total')).toHaveText('$235.44')
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page).toHaveURL('/')
  await page.goBack()
  await expect(page).toHaveURL('/checkout')
  await expect(page.getByTestId('checkout-total')).toHaveText('$235.44')
  await page.getByRole('button', { name: 'Networks', exact: true }).click()
  await expect(page).toHaveURL('/networks')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Choose your next move.' })).toBeVisible()
})

test('promo and shipping update totals, required details precede demo confirmation', async ({ page }) => {
  await page.goto('/checkout')
  await page.getByLabel('Have a promo code?').fill('invalid')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('That code isn’t available')
  await page.getByLabel('Have a promo code?').fill('block10')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByTestId('checkout-total')).toHaveText('$235.22')
  await page.getByRole('radio', { name: 'Express delivery' }).check()
  await expect(page.getByTestId('checkout-total')).toHaveText('$250.22')
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await fillAddress(page)
  await page.getByLabel('First name', { exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByLabel('First name', { exact: true }).fill('Alex')
  await page.getByRole('radio', { name: 'Pay with crypto' }).check()
  await expect(page.getByText('250.22 USDC on Ethereum')).toBeVisible()
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  const review = page.getByRole('dialog')
  await expect(review).toContainText('Alex Morgan')
  await expect(review).toContainText('Demo USDC · Ethereum')
  await expect(review).toContainText('$250.22')
  await page.keyboard.press('Escape')
  await expect(review).not.toBeVisible()
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  await expect(review).toContainText('Demo Visa ···· 4242')
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Looking good, Alex.' })).toBeVisible()
  await expect(page.getByText('Your demo order is complete. No payment was taken and no items will be shipped.')).toBeVisible()
  await expect(page.getByText('$250.22 · 3 items')).toBeVisible()
  await page.getByRole('button', { name: 'Start a new cart', exact: true }).click()
  await expect(page.getByTestId('checkout-total')).toHaveText('$261.36')
})

test('empty carts can be restored and invalid stored carts are recovered', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('block.checkout.cart.v1', '[{"id":"headphones","quantity":-1}]'))
  await page.goto('/checkout/')
  await expect(page.locator('.checkout-item')).toHaveCount(3)
  for (const name of ['Studio headphones', 'Elevated laptop stand', 'Everyday USB-C cable']) {
    await page.getByRole('button', { name: `Remove ${name}`, exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Room for something good.' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore the collection', exact: true }).click()
  await expect(page.locator('.checkout-item')).toHaveCount(3)
})

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`checkout fits ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByRole('radio', { name: 'Express delivery' }).check()
    await expect(page.getByTestId('checkout-total')).toHaveText('$276.36')
    await page.getByRole('radio', { name: 'Standard delivery' }).check()
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: `artifacts/checkout-${width}.png`, fullPage: true })
  })
}
