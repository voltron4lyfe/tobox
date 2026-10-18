import { expect, test, type Page } from '@playwright/test'

// One continuous scenario: the whole plan → track → review → history loop, driven by keyboard.
test.describe.configure({ mode: 'serial' })

async function createInitiative(page: Page, title: string, quadrantKey: string) {
  await page.keyboard.press('n')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await page.keyboard.press(`Alt+${quadrantKey}`)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog).toBeHidden()
}

test('plan, track, and review a day using the keyboard', async ({ page }) => {
  await page.goto('/initiatives')
  await expect(page.getByRole('region', { name: 'Q2 Effectiveness' })).toBeVisible()
  await createInitiative(page, 'Write the book', '2')
  await createInitiative(page, 'Email', '3')
  await expect(page.getByRole('region', { name: 'Q2 Effectiveness' })).toContainText(
    'Write the book',
  )
  await expect(page.getByRole('region', { name: 'Q3 Distraction' })).toContainText('Email')

  // Morning: plan the day.
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page).toHaveURL(/\/plan/)
  const plan = page.getByRole('region', { name: "Today's plan" })
  await expect(plan).toBeVisible()
  await expect(page.getByRole('button', { name: 'Write the book' })).toBeVisible()
  await page.keyboard.press('a')
  await page.keyboard.type('write')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Draft chapter one')
  await page.keyboard.press('Enter')
  await expect(plan).toContainText('Draft chapter one')
  await expect(plan).toContainText('Highlight')

  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page).toHaveURL(/\/today/)

  // During the day: quick-log against the highlight (default target) and an unplanned initiative.
  await page.keyboard.press('l')
  await page.keyboard.type('outlined the intro 45m')
  await page.keyboard.press('Enter')
  const log = page.getByRole('region', { name: 'Log' })
  await expect(log).toContainText('outlined the intro')
  await expect(log).toContainText('45m')

  await page.keyboard.type('triage #email 15m')
  await page.keyboard.press('Enter')
  await expect(log).toContainText('triage')
  await expect(log).toContainText('unplanned')

  // Log & complete the highlight.
  await page.keyboard.type('finished draft #1 30m')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('region', { name: 'Highlight' })).toContainText('Reopen')

  // Evening: review.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('g')
  await page.keyboard.press('r')
  await expect(page.getByRole('region', { name: 'Verdict' })).toContainText(
    'Yes. You finished your Highlight.',
  )
  await page.keyboard.press('4')
  await expect(page.getByRole('radio', { name: '4' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('link', { name: /Reviewed/ })).toBeVisible()

  // History reflects the day.
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await expect(page.getByText('Highlight hit rate')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('100%')
})

test('shortcut help and command palette open @mobile', async ({ page }) => {
  await page.goto('/today')
  await expect(page.getByRole('region', { name: 'Log' })).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await page.keyboard.type('initiatives')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/initiatives/)
})
