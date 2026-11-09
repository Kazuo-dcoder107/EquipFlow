// The admin site must stay a plain website. Only the borrower site ("equipflow") is a PWA, so these
// checks fail loudly if someone adds PWA pieces here by mistake.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(jsx?|html)$/.test(name) && !name.includes('noPwa') ? [path] : []
  })
}

describe('the admin site is not a PWA', () => {
  it('does not depend on a PWA plugin', () => {
    const { dependencies = {}, devDependencies = {} } = JSON.parse(read('package.json'))
    const names = Object.keys({ ...dependencies, ...devDependencies })
    expect(names.filter((n) => /pwa|workbox/i.test(n))).toEqual([])
  })

  it('does not configure one in vite.config.js', () => {
    const config = read('vite.config.js').replace(/\/\/.*$/gm, '') // ignore the comments that explain this
    expect(config).not.toMatch(/pwa|workbox|manifest/i)
  })

  it('has no manifest link, install icons or service worker file', () => {
    expect(read('index.html')).not.toMatch(/rel=["']manifest["']|apple-touch-icon/)
    for (const file of ['public/manifest.webmanifest', 'public/manifest.json', 'public/sw.js', 'public/icons']) {
      expect(existsSync(join(process.cwd(), file)), file).toBe(false)
    }
  })

  it('never registers a service worker or offers an install prompt', () => {
    const offenders = sourceFiles('src').filter((file) => /serviceWorker\.register|beforeinstallprompt/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('asks search engines to stay away from it', () => {
    expect(read('index.html')).toMatch(/name="robots" content="noindex/)
  })
})
