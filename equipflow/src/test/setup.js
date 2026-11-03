import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Each test starts with an empty browser storage and no leftover rendered pages.
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})
