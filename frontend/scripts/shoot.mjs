#!/usr/bin/env node
// Screenshot app routes headlessly so you (or an agent) can see the UI.
// Usage: node scripts/shoot.mjs [--base http://localhost:5173] [--out dir] [--mobile] [--dark]
//        [--keys "g p,a"] /plan /today ...
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { chromium, devices } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? (args.splice(i, 1), true) : false
}
const base = opt('--base', process.env.BASE_URL ?? 'http://localhost:5173')
const out = opt('--out', 'screenshots')
const keys = opt('--keys', '')
const mobile = flag('--mobile')
const dark = flag('--dark')
const full = !flag('--viewport-only')
const paths = args.length ? args : ['/plan', '/today', '/review', '/history', '/initiatives']

mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  ...(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } }),
  colorScheme: dark ? 'dark' : 'light',
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

for (const path of paths) {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  for (const k of keys.split(',').filter(Boolean)) {
    for (const key of k.trim().split(' ')) await page.keyboard.press(key)
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(300)
  const name = `${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}${mobile ? '-mobile' : ''}${dark ? '-dark' : ''}.png`
  await page.screenshot({ path: join(out, name), fullPage: full })
  console.log(join(out, name))
}
if (errors.length) console.error('Page errors:\n' + errors.join('\n'))
await browser.close()
