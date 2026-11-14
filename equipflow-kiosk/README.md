# EquipFlow kiosk firmware

ESP32 + RC522 + 1602 I2C LCD + three arcade buttons (YES / NO / NEXT) + buzzer (2N2222).
Done: hardware layer, kiosk state machine, real Wi-Fi/HTTP client, terms from the server,
staff enrollment mode, non-blocking requests, watchdogs.

## 1. Backend (once)

Assumed layout: `backend/` and `equipflow-kiosk/` side by side. Run from that parent folder.
There are TWO backend patches. Apply them in order; skip the first if you already applied it.

    # A) copy the changed files (final versions of everything; overwrites them, so only if you have
    #    not edited those files yourself since you sent me the zip)
    Windows:    xcopy /E /Y equipflow-kiosk\backend-changes\files\* backend\
    Mac/Linux:  cp -r equipflow-kiosk/backend-changes/files/. backend/

    # B) patches (keep your own edits)
    cd backend
    git apply ../equipflow-kiosk/backend-changes/kiosk-backend-changes.patch      # 1: login "blocked" + scan keeps session alive
    git apply ../equipflow-kiosk/backend-changes/kiosk-backend-changes-2.patch    # 2: terms, pending-users limit, tag normalizing

Then, from `backend/`:

    python -m pip install httpx2                                    # only if pytest complains about it
    pytest
    python -m scripts.create_kiosk "Library Kiosk"                  # prints the kiosk API key (once)
    uvicorn app.main:app --host 0.0.0.0 --port 8000                 # 0.0.0.0, NOT the default 127.0.0.1

Allow port 8000 through the computer's firewall; give that computer a fixed LAN address.

### Terms text
Edit `backend/kiosk_terms.txt` (plain text, no restart). Keep it short: about 28 characters fit per
LCD page and the kiosk shows at most 12 pages. The kiosk re-reads it every 10 minutes, and a stale copy
is refused when someone accepts it ("Terms updated, try again"), so nobody can accept old wording.

### Enrolling the FIRST admin
Enrollment mode on the kiosk is only for staff/admin, so the first admin tag is linked through the API:
open `http://localhost:8000/docs`, call `POST /api/kiosk/enroll` with the header `X-API-Key: <kiosk key>`
and body `{"sr_code": "<the admin's sr_code>", "user_uid": "<tag UID from hw_rfid>"}`.
The account must be waiting for a tag (`GET /api/kiosk/pending-users`). After that, staff enroll everyone at the kiosk.

## 2. Firmware

    cp include/secrets.example.h include/secrets.h      # fill in Wi-Fi, server address, kiosk key

Bring-up, one part at a time (run in a PlatformIO terminal; add `-t monitor` to watch the output):

    pio run -e hw_lcd    -t upload      # I2C address, text, scrolling
    pio run -e hw_rfid   -t upload      # version 0x91/0x92, tag UIDs
    pio run -e hw_button -t upload      # YES / NO / NEXT, one line per press
    pio run -e hw_buzzer -t upload      # all 5 tones
    pio run -e hw_net    -t upload      # Wi-Fi, heartbeat, terms, waiting accounts, tag lookups
    pio run -e hw_wdt    -t upload      # freezes on purpose: the board must restart by itself
    pio run -t upload                   # the full kiosk

No server yet? `pio run -e kiosk_mock -t upload` runs the same firmware against a built-in fake server
(edit `src/mock_data.h` with your tag UIDs).

## 3. Tests (no hardware, no server)

    pio test -e native

## Interaction

| Button | Does |
|---|---|
| YES | Borrow at the prompt. On the accept page, accept. In enrollment: pick the name. |
| NO | Cancel, decline, or (idle, logged in) log out. In enrollment: back / exit. |
| NEXT | Page through the terms. Staff/admin, logged in: open enrollment. In enrollment: next name. |

- Tap a user tag to log in. Tap an available item: "Borrow? YES / NO".
- Hardware items show the terms (from the server), page by page: `>` at the end of the bottom line means more,
  press NEXT. The last page is "Accept terms?": YES borrows, NO declines. Books need no terms.
- Tap a borrowed item: returned at once (no login needed). The fine, if any, is shown.
- A blocked user (unpaid fine / overdue) is told right after login and can still return items.
- The success tone plays only after the server confirms the save. A borrow with no answer is never
  retried: the kiosk checks the item's status and shows "Not confirmed" or "Not saved".

### Enrollment (staff / admin)
1. Staff taps their ID. The bottom line alternates with `NEXT = Enroll`. Press NEXT.
2. The list of accounts waiting for a tag appears (oldest first, at most 50): name on top, SR code and `1/12` below.
   NEXT = next name, YES = this one, NO = leave enrollment (staff are logged out).
3. "Tap new ID tag": the student taps THEIR new card. "Enrolled!" and the list continues.
   A card that already belongs to someone, or an item tag, is refused. NO goes back to the list.
4. No button or tag for 60 s ends enrollment.

## Network behaviour and recovery

- Requests run on their own task. While one is in flight, "Please wait" shows, the buzzer and the watchdog
  keep running, and button presses and tags are deliberately ignored (a borrow cannot be cancelled safely
  mid-flight). Connect 2.5 s, read 3.5 s, and a HARD limit of 5 s no matter what the network does.
- A request that hit the hard limit is finished and discarded in the background; meanwhile new requests
  fail fast ("No network") instead of piling up. If it is still stuck 30 s later, the board restarts.
- Watchdog: if the main loop does not check in for 10 s, the board restarts. After a freeze/crash the LCD says
  "Recovered from a freeze/crash". Wi-Fi offline for 3 minutes: the board restarts.
- After a slow call the kiosk re-reads the clock, so result screens and timeouts keep their full length.

## Wiring (edit `lib/kiosk_hw/src/Pins.h`)

| Part | Pin |
|---|---|
| RC522 SCK / MISO / MOSI / SS / RST | GPIO 18 / 19 / 23 / **5** / 27 (power: **3.3 V**) |
| 1602 I2C backpack SDA / SCL | GPIO 21 / 22 (address 0x27, power: 5 V) |
| Buttons YES / NO / NEXT | GPIO **4 / 32 / 33**; other leg of each to GND (internal pull-ups) |
| Buzzer | GPIO 25 -> ~1 kOhm -> 2N2222 base |

1602 level warning: the backpack runs on 5 V and pulls SDA/SCL up to 5 V, above the ESP32's 3.3 V pins.
Safer: remove the backpack's two pull-up resistors, or use an I2C level shifter.

## Layout

    lib/kiosk_core/   portable logic: state machine, REST client, JSON parser, mock server, tones, text
    lib/kiosk_hw/     ESP32 drivers: LCD, RC522, buzzer, Wi-Fi, HTTP transport, watchdog, Pins.h
    hwtests/          one bring-up sketch per part (+ Wi-Fi/server, + watchdog)
    test/             unit tests (Unity, native): util, kiosk, rest
    src/              firmware main + mock data
    include/          secrets.example.h (copy to secrets.h)
    backend-changes/  the two backend patches and the final changed backend files

Not done: recommendations (not possible on a 1602); editing the terms from the admin web app (today: a text file).
