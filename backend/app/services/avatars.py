"""Profile photos: validate an upload and turn it into one small, safe, square JPEG.

Whatever the person sends (a phone photo, a PNG with transparency, a rotated picture),
what gets stored is always a 256x256 JPEG with no embedded metadata (so no GPS location).
The web site already shrinks pictures before uploading; this is the server re-checking,
because a client can never be trusted.
"""
import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 2 * 1024 * 1024        # what the API accepts (the site sends ~20 KB)
MAX_PIXELS = 40_000_000                    # refuse huge images before decoding them
SIZE = 256
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class AvatarError(ValueError):
    """The upload cannot be used; the message is safe to show to the person."""


def process_avatar(data: bytes) -> bytes:
    if not data:
        raise AvatarError("The file is empty.")
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in ALLOWED_FORMATS:
            raise AvatarError("Please use a JPG, PNG or WebP picture.")
        if image.width * image.height > MAX_PIXELS:
            raise AvatarError("That picture is too large. Please use a smaller one.")
        image.load()  # decode now, so a damaged file fails here
    except AvatarError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise AvatarError("That file is not a valid picture.")

    image = ImageOps.exif_transpose(image)           # respect the phone's rotation
    image = ImageOps.fit(image.convert("RGBA"), (SIZE, SIZE), Image.LANCZOS)  # centre-crop square
    flat = Image.new("RGB", image.size, (255, 255, 255))  # transparency becomes white
    flat.paste(image, mask=image.getchannel("A"))

    out = io.BytesIO()
    flat.save(out, "JPEG", quality=85, optimize=True)  # no exif= argument: metadata is dropped
    return out.getvalue()
