import { defineConfig } from '@playwright/test'

// The e2e specs target an already-running stack (see TESTING.md); they do not start servers.
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/.kilo/**', '**/node_modules/**'],
  reporter: 'list',
})
