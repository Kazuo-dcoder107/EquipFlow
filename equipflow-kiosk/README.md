# EquipFlow kiosk firmware

ESP32 + RC522 + 1602 I2C LCD + three arcade buttons (YES / NO / NEXT) + buzzer (2N2222).
Steps 1-3 are done: hardware layer, kiosk state machine, and the real Wi-Fi/HTTP client.

## 1. Backend (once)

Assumed layout: `backend/` and `equipflow-kiosk/` side by side in one parent folder.
Run these from that parent folder.

Apply the two backend changes (pick ONE way):

    # A) copy the 4 changed files (overwrites them: only if you have not edited them since you sent me the zip)
    Windows:    xcopy /E /Y equipflow-kiosk\backend-changes\files\* backend\
    Mac/Linux:  cp -r equipflow-kiosk/backend-changes/files/. backend/

    # B) apply the patch (keeps any other edits you made)
    cd backend
    git apply ../equipflow-kiosk/backend-changes/kiosk-backend-changes.patch     # or: patch -p1 < (same file)

Then, from `backend/`:

    pytest                                                          # should all pass
    python -m scripts.create_kiosk "Library Kiosk"                  # prints the kiosk API key
    uvicorn app.main:app --host 0.0.0.0 --port 8000                 # 0.0.0.0, NOT the default 127.0.0.1

The patch adds `borrowing_blocked` to the login reply and makes `/scan` count as session activity.
The firmware also works against an unpatched backend (it then learns about a block only at borrow time).
Allow port 8000 through the computer's firewall, and give that computer a fixed LAN address.

## 2. Firmware

    cp include/secrets.example.h include/secrets.h      # then fill in Wi-Fi, server address, kiosk key

Bring-up order, one part at a time (each prints to the serial monitor, `pio device monitor`):

    pio run -e hw_lcd    -t upload      # I2C address, text, scrolling
    pio run -e hw_rfid   -t upload      # version 0x91/0x92, tag UIDs
    pio run -e hw_button -t upload      # YES / NO / NEXT, one line per press
    pio run -e hw_buzzer -t upload      # all 5 tones
    pio run -e hw_net    -t upload      # Wi-Fi, heartbeat (address + key), tap a tag: the server's answer
    pio run -t upload                   # the full kiosk

`hw_net` explains failures in words (wrong key, wrong IP/firewall, uvicorn not on 0.0.0.0).
No server yet? `pio run -e kiosk_mock -t upload` runs the same firmware against a built-in fake server
(edit `src/mock_data.h` with your tag UIDs).

## 3. Tests (no hardware, no server)

    pio test -e native

## Wiring (edit `lib/kiosk_hw/src/Pins.h`)

| Part | Pin |
|---|---|
| RC522 SCK / MISO / MOSI / SS / RST | GPIO 18 / 19 / 23 / **5** / 27 (power: **3.3 V**) |
| 1602 I2C backpack SDA / SCL | GPIO 21 / 22 (address 0x27, power: 5 V) |
| Buttons YES / NO / NEXT | GPIO **4 / 32 / 33**; other leg of each to GND (internal pull-ups) |
| Buzzer | GPIO 25 -> ~1 kOhm -> 2N2222 base |

1602 level warning: the backpack runs on 5 V and pulls SDA/SCL up to 5 V, above the ESP32's 3.3 V pins.
Safer: remove the backpack's two pull-up resistors, or use an I2C level shifter.

## Interaction

| Button | Does |
|---|---|
| YES | Borrow at the prompt. On the last terms page, accept. |
| NO | Cancel, decline, or (idle, logged in) log out. |
| NEXT | Page through the terms; after the accept page it wraps to the first. |

- Tap a user tag to log in. Tap an available item: "Borrow? YES / NO". Hardware items show the terms first.
- Tap a borrowed item: returned at once (no login needed). The fine, if any, is shown.
- A blocked user (unpaid fine / overdue) is told right after login and can still return items.
- The success tone plays only after the server confirms the save. A borrow with no answer is never
  retried: the kiosk checks the item's status and shows "Not confirmed" or "Not saved".
- "Please wait" shows while the server is being called (up to 3 s to connect + 5 s to answer).

## Layout

    lib/kiosk_core/   portable logic: state machine, REST client, JSON parser, mock server, tones, text
    lib/kiosk_hw/     ESP32 drivers: LCD, RC522, buzzer, Wi-Fi, HTTP transport, Pins.h
    hwtests/          one bring-up sketch per part (+ Wi-Fi/server)
    test/             unit tests (Unity, native): util, kiosk, rest
    src/              firmware main + mock data
    include/          secrets.example.h (copy to secrets.h)

Not yet done: enrollment mode, terms text from the API, watchdog and non-blocking requests (step 4),
reconnect polish (step 5). Recommendations are not possible on a 1602.
