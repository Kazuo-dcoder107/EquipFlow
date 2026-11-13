// Copy this file to include/secrets.h and fill it in. secrets.h is git-ignored: never commit it.
#pragma once

#define WIFI_SSID      "your-wifi-name"          // 2.4 GHz network (the ESP32 has no 5 GHz)
#define WIFI_PASSWORD  "your-wifi-password"

// The computer running uvicorn: its LAN address and port, NO trailing slash.
// uvicorn must listen on the LAN:  uvicorn app.main:app --host 0.0.0.0 --port 8000
#define API_BASE_URL   "http://192.168.1.50:8000"

// Printed by:  python -m scripts.create_kiosk "Library Kiosk"
#define KIOSK_API_KEY  "paste-the-32-character-key-here"
