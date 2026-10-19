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

test('theme preference applies everywhere and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/today')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.keyboard.press('g')
  await page.keyboard.press('s')
  await expect(page).toHaveURL(/\/settings/)
  const theme = page.getByRole('radiogroup', { name: 'Theme' })
  await theme.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 17, 32)')

  // Saved on the server, so a reload (and every other page) stays dark.
  await page.reload()
  await page.goto('/history')
  await expect(html).toHaveAttribute('data-theme', 'dark')

  // ⇧T cycles dark → system, which follows the OS.
  await page.keyboard.press('Shift+T')
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html).toHaveAttribute('data-theme', 'dark')
})

test('reminder settings save', async ({ page }) => {
  await page.goto('/settings')
  const reminders = page.getByRole('region', { name: 'Reminders' })
  await reminders.getByRole('switch', { name: 'Highlight nudge' }).click()
  await reminders.getByRole('button', { name: 'Sat' }).click()
  await page.reload()
  await expect(reminders.getByRole('switch', { name: 'Highlight nudge' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(reminders.getByRole('button', { name: 'Sat' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('region', { name: 'AI agents' })).toContainText('/mcp')
})

test('roles group initiatives and routines are offered on the plan', async ({ page }) => {
  await page.goto('/initiatives')
  await expect(page.getByRole('region', { name: 'Q2 Effectiveness' })).toContainText(
    'Write the book',
  )

  // ⇧R: manage roles; start from a suggestion.
  await page.keyboard.press('Shift+R')
  const roles = page.getByRole('dialog', { name: 'Roles' })
  await roles.getByRole('button', { name: 'Parent' }).click()
  await expect(roles.getByLabel('Rename Parent')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(roles).toBeHidden()

  await page.keyboard.press('n')
  const form = page.getByRole('dialog')
  await form.getByLabel('Title').fill("Kids' soccer")
  await form.getByLabel('Role').selectOption('Parent')
  await page.keyboard.press('Alt+1')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(form).toBeHidden()

  // f cycles the role filter: All roles → Parent.
  await page.keyboard.press('f')
  const filter = page.getByRole('radiogroup', { name: 'Filter by role' })
  await expect(filter.getByRole('radio', { name: 'Parent' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('region', { name: 'Q1 Necessity' })).toContainText("Kids' soccer")
  await expect(page.getByRole('region', { name: 'Q2 Effectiveness' })).not.toContainText(
    'Write the book',
  )

  // r: a routine that's due every day, so it's due today.
  await page.keyboard.press('r')
  const routine = page.getByRole('dialog', { name: 'New routine' })
  await page.keyboard.type('soccer')
  await page.keyboard.press('Enter')
  await routine.getByLabel('What').fill('Soccer practice')
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    await routine.getByRole('button', { name: day }).click()
  }
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(routine).toBeHidden()
  await expect(page.getByRole('region', { name: 'Routines' })).toContainText('Every day')

  // The plan offers it; r adds it.
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  const due = page.getByRole('region', { name: 'Routines due' })
  await expect(due).toContainText('Soccer practice')
  await page.keyboard.press('r')
  await expect(page.getByRole('region', { name: "Today's plan" })).toContainText('Soccer practice')
  await expect(due).toBeHidden()
})
