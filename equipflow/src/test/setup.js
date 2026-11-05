import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { clearAvatarCache } from '../hooks/useAvatar'

// jsdom has no object URLs (how downloaded photos are shown), so give it harmless ones.
URL.createObjectURL ??= () => 'blob:test'
URL.revokeObjectURL ??= () => {}

// Each test starts with an empty browser storage and no leftover rendered pages.
afterEach(() => {
  cleanup()
  clearAvatarCache()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  vi.unstubAllGlobals()
})
