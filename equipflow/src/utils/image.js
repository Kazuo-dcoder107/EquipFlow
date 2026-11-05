// Gets a picked picture ready for upload: a 256x256 square JPEG of about 20 KB, cut from the
// middle of the original. Done in the browser so a 6 MB phone photo does not travel over the
// network. (The server checks and re-processes it again anyway.)

export const AVATAR_SIZE = 256
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_INPUT_BYTES = 15 * 1024 * 1024

/** The biggest centred square inside a width x height picture. */
export function squareCrop(width, height) {
  const side = Math.min(width, height)
  return { sx: (width - side) / 2, sy: (height - side) / 2, side }
}

// Decode a file into something we can draw on a canvas. `createImageBitmap` also applies the
// phone's rotation; old browsers fall back to a plain <img>.
async function decode(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to the <img> way
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    image.src = url
  })
}

export async function prepareAvatar(file) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP picture.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('That picture is too large. Please choose one under 15 MB.')

  let source
  try {
    source = await decode(file)
  } catch {
    throw new Error('That file could not be read as a picture.')
  }

  const { sx, sy, side } = squareCrop(source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff' // transparent areas become white, like the server does
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  source.close?.()

  const picture = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!picture) throw new Error('Could not prepare that picture. Please try another one.')
  return picture
}
