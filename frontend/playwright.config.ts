import { defineConfig, devices } from '@playwright/test'

// E2E runs against an isolated backend (fresh SQLite file) and a production build served by
// `vite preview` on alternate ports, so it never touches your dev data and avoids dev-server
// dependency-optimisation reloads.
const API_PORT = 8001
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: `rm -f data/e2e.db* && uv run alembic upgrade head && uv run uvicorn tobox.main:app --port ${API_PORT}`,
      cwd: '../backend',
      env: { TOBOX_DATABASE_URL: 'sqlite:///./data/e2e.db' },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite build --logLevel warn && npx vite preview --port ${WEB_PORT} --strictPort`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
})
