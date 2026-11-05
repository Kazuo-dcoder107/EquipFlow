import { describe, expect, it, vi } from 'vitest'
import { AVATAR_SIZE, prepareAvatar, squareCrop } from './image'

describe('squareCrop', () => {
  it('takes the middle of a wide picture', () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 })
  })
  it('takes the middle of a tall picture', () => {
    expect(squareCrop(300, 900)).toEqual({ sx: 0, sy: 300, side: 300 })
  })
  it('leaves a square picture alone', () => {
    expect(squareCrop(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 })
  })
})

describe('prepareAvatar checks before doing any work', () => {
  const file = (name, type) => new File(['data'], name, { type })

  it('refuses things that are not JPG, PNG or WebP pictures', async () => {
    for (const bad of [file('a.gif', 'image/gif'), file('a.pdf', 'application/pdf'), file('a.txt', 'text/plain')]) {
      await expect(prepareAvatar(bad)).rejects.toThrow('JPG, PNG or WebP')
    }
  })

  it('refuses a picture over 15 MB', async () => {
    const huge = file('big.jpg', 'image/jpeg')
    Object.defineProperty(huge, 'size', { value: 16 * 1024 * 1024 })
    await expect(prepareAvatar(huge)).rejects.toThrow('under 15 MB')
  })

  it('reports a file it cannot read as a picture', async () => {
    // a browser that cannot decode the file: no createImageBitmap, and <img> fires "error"
    vi.stubGlobal('createImageBitmap', undefined)
    window.createImageBitmap = undefined
    vi.stubGlobal('Image', class { set src(_) { setTimeout(() => this.onerror?.(), 0) } })
    await expect(prepareAvatar(file('broken.jpg', 'image/jpeg'))).rejects.toThrow('could not be read')
  })

  it('draws the centre square of the picture onto a 256 pixel canvas and returns a JPEG', async () => {
    const source = { width: 400, height: 200, close: vi.fn() }
    window.createImageBitmap = vi.fn(async () => source)
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '', imageSmoothingQuality: '' }
    let toBlobArgs
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type, quality) {
      toBlobArgs = { type, quality, width: this.width, height: this.height }
      callback(new Blob(['jpeg'], { type }))
    })

    const picture = await prepareAvatar(file('wide.png', 'image/png'))

    expect(context.drawImage).toHaveBeenCalledWith(source, 100, 0, 200, 200, 0, 0, 256, 256) // middle 200x200 -> 256x256
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 256, 256)                            // white behind transparent areas
    expect(toBlobArgs).toEqual({ type: 'image/jpeg', quality: 0.85, width: 256, height: 256 })
    expect(picture.type).toBe('image/jpeg')
    expect(source.close).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('reports a failure to produce the picture', async () => {
    window.createImageBitmap = vi.fn(async () => ({ width: 10, height: 10 }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, drawImage() {} })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
    await expect(prepareAvatar(file('a.png', 'image/png'))).rejects.toThrow('Could not prepare')
    vi.restoreAllMocks()
  })

  it('makes a 256 pixel square', () => {
    expect(AVATAR_SIZE).toBe(256)
  })
})
