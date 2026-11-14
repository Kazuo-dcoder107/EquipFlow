"""Profile photos stored in the database: processing, endpoints, privacy."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.security import hash_password
from app.services.avatars import MAX_UPLOAD_BYTES, AvatarError, process_avatar

PW = "password123"


@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    pw = hash_password(PW)
    with Session() as s:
        s.add_all([
            User(sr_code="admin", full_name="Admin", email="admin@example.com", role=UserRole.admin,
                 status=UserStatus.active, password_hash=pw),
            User(sr_code="S1", full_name="Stu Dent", email="s1@example.com", status=UserStatus.active, password_hash=pw),
            User(sr_code="S2", full_name="Sam Two", email="s2@example.com", status=UserStatus.active, password_hash=pw),
        ])
        s.commit()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    c = TestClient(app)
    yield c, Session
    app.dependency_overrides.clear()


def login(c, sr="S1"):
    path = "/api/auth/admin/login" if sr == "admin" else "/api/auth/login"
    token = c.post(path, data={"username": sr, "password": PW}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def picture(fmt="PNG", size=(600, 400), color=(200, 30, 30), mode="RGB", **save):
    buffer = io.BytesIO()
    Image.new(mode, size, color).save(buffer, fmt, **save)
    return buffer.getvalue()


def upload(c, headers, data, name="me.png", mime="image/png"):
    return c.put("/api/me/avatar", headers=headers, files={"file": (name, data, mime)})


def decode(data):
    return Image.open(io.BytesIO(data))


# ---- processing ------------------------------------------------------------------------

def test_any_picture_becomes_a_256_square_jpeg():
    for fmt, mode, color in [("PNG", "RGB", (10, 20, 30)), ("JPEG", "RGB", (10, 20, 30)),
                             ("WEBP", "RGB", (10, 20, 30)), ("PNG", "RGBA", (10, 20, 30, 255))]:
        out = decode(process_avatar(picture(fmt, (900, 300), color, mode)))
        assert (out.format, out.size) == ("JPEG", (256, 256)), fmt


def test_it_crops_from_the_centre_and_flattens_transparency():
    wide = Image.new("RGB", (400, 200), (220, 0, 0))               # red edges...
    wide.paste(Image.new("RGB", (200, 200), (0, 160, 0)), (100, 0))  # ...green middle square
    buffer = io.BytesIO(); wide.save(buffer, "PNG")
    out = decode(process_avatar(buffer.getvalue()))
    for corner in [(2, 2), (253, 2), (2, 253), (253, 253)]:
        r, g, b = out.getpixel(corner)
        assert g > 120 and r < 80, "the red edges should have been cropped away"

    clear = decode(process_avatar(picture("PNG", (50, 50), (0, 0, 0, 0), "RGBA")))
    assert min(clear.getpixel((128, 128))) > 240   # fully transparent -> white


def test_metadata_is_stripped_and_rotation_is_applied():
    source = Image.new("RGB", (200, 200), (0, 0, 255))              # blue picture...
    source.paste(Image.new("RGB", (100, 200), (255, 0, 0)), (0, 0))  # ...with a red LEFT half
    exif = Image.Exif()
    exif[0x0112] = 6                                                 # "turn 90 degrees clockwise"
    exif[0x010F] = "SecretPhoneBrand"
    buffer = io.BytesIO(); source.save(buffer, "JPEG", exif=exif)

    out = decode(process_avatar(buffer.getvalue()))
    assert len(out.getexif()) == 0                                   # the metadata is gone
    # turned clockwise, the red left half becomes the TOP half (unturned it would stay on the left)
    assert out.getpixel((60, 10))[0] > 150 and out.getpixel((60, 10))[2] < 100
    assert out.getpixel((60, 245))[2] > 150 and out.getpixel((60, 245))[0] < 100


@pytest.mark.parametrize(
    "data,message",
    [
        (b"", "empty"),
        (b"just some text, not a picture", "not a valid picture"),
        (picture("PNG")[:40], "not a valid picture"),
        (picture("GIF", mode="P", color=1), "JPG, PNG or WebP"),
        (picture("BMP"), "JPG, PNG or WebP"),
    ],
    ids=["empty", "text", "truncated-png", "gif", "bmp"]
)
def test_bad_uploads_are_refused_with_a_readable_message(data, message):
    with pytest.raises(AvatarError, match=message):
        process_avatar(data)


def test_huge_pictures_are_refused_before_decoding():
    big = Image.new("1", (12000, 12000))          # 144 megapixels, tiny when compressed
    buffer = io.BytesIO(); big.save(buffer, "PNG")
    assert len(buffer.getvalue()) < MAX_UPLOAD_BYTES
    with pytest.raises(AvatarError, match="too large"):
        process_avatar(buffer.getvalue())


# ---- endpoints -------------------------------------------------------------------------

def test_upload_then_download_roundtrip(env):
    c, Session = env
    h = login(c)
    assert c.get("/api/auth/me", headers=h).json()["has_avatar"] is False
    assert c.get("/api/me/avatar", headers=h).status_code == 404

    r = upload(c, h, picture("PNG", (800, 500)))
    assert r.status_code == 200
    body = r.json()
    assert body["has_avatar"] is True and isinstance(body["avatar_version"], int)

    got = c.get("/api/me/avatar", headers=h)
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg"
    assert "private" in got.headers["cache-control"]
    assert decode(got.content).size == (256, 256)
    assert len(got.content) < 60_000

    with Session() as s:      # it really is stored in the users table
        stored = s.scalar(select(User.avatar).where(User.sr_code == "S1"))
        assert stored == got.content
    assert c.get("/api/auth/me", headers=h).json()["avatar_version"] == body["avatar_version"]


def test_replacing_changes_the_version_and_the_picture(env):
    c, Session = env
    h = login(c)
    upload(c, h, picture("PNG", color=(255, 0, 0)))
    first = c.get("/api/me/avatar", headers=h).content
    with Session() as s:   # pretend the first photo is older, so the version must change
        u = s.query(User).filter_by(sr_code="S1").one()
        u.avatar_updated_at = u.avatar_updated_at.replace(year=2020); s.commit()
    old_version = c.get("/api/auth/me", headers=h).json()["avatar_version"]

    upload(c, h, picture("PNG", color=(0, 0, 255)))
    assert c.get("/api/auth/me", headers=h).json()["avatar_version"] > old_version
    assert c.get("/api/me/avatar", headers=h).content != first


def test_delete_returns_to_the_default_and_is_repeatable(env):
    c, _ = env
    h = login(c)
    upload(c, h, picture())
    r = c.delete("/api/me/avatar", headers=h)
    assert r.status_code == 200 and r.json()["has_avatar"] is False and r.json()["avatar_version"] is None
    assert c.get("/api/me/avatar", headers=h).status_code == 404
    assert c.delete("/api/me/avatar", headers=h).status_code == 200


def test_bad_uploads_over_http(env):
    c, _ = env
    h = login(c)
    r = upload(c, h, b"not an image", "evil.png")
    assert r.status_code == 422 and "not a valid picture" in r.json()["detail"]
    r = upload(c, h, b"x" * (MAX_UPLOAD_BYTES + 10))
    assert r.status_code == 413 and "2 MB" in r.json()["detail"]
    assert c.put("/api/me/avatar", headers=h).status_code == 422          # no file at all
    assert c.get("/api/auth/me", headers=h).json()["has_avatar"] is False  # nothing was saved


def test_photos_are_private_to_their_owner_and_need_a_login(env):
    c, _ = env
    s1, s2 = login(c, "S1"), login(c, "S2")
    upload(c, s1, picture())
    assert c.get("/api/me/avatar").status_code == 401
    assert c.put("/api/me/avatar", files={"file": ("a.png", picture(), "image/png")}).status_code == 401
    assert c.delete("/api/me/avatar").status_code == 401
    assert c.get("/api/me/avatar", headers=s2).status_code == 404     # S2 never sees S1's photo
    assert c.get("/api/auth/me", headers=s2).json()["has_avatar"] is False


def test_user_lists_say_who_has_a_photo_but_never_carry_the_bytes(env):
    c, _ = env
    upload(c, login(c, "S1"), picture())
    admin = login(c, "admin")
    listing = c.get("/api/users", headers=admin)
    assert listing.status_code == 200
    by_code = {u["sr_code"]: u for u in listing.json()["items"]}
    assert by_code["S1"]["has_avatar"] is True and by_code["S2"]["has_avatar"] is False
    assert "avatar" not in by_code["S1"] and len(listing.content) < 3000


def test_photo_loading_is_deferred(env):
    c, Session = env
    upload(c, login(c, "S1"), picture())
    with Session() as s:
        user = s.query(User).filter_by(sr_code="S1").one()
        assert "avatar" not in user.__dict__            # not loaded with the rest of the row
        assert user.avatar_updated_at is not None
