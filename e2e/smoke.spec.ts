import { test, expect } from '@playwright/test'

test('host app renders navbar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('FF Tools')).toBeVisible()
  await expect(page.getByText('Dynasty Value Tracker')).toBeVisible()
})

