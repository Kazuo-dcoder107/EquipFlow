// EquipFlow kiosk firmware (ESP32 + RC522 + 1602 LCD + 3 arcade buttons + buzzer).
//   env:kiosk       talks to the real backend over Wi-Fi/HTTP (needs include/secrets.h)
//   env:kiosk_mock  runs against the built-in fake server, no Wi-Fi needed (offline demo)
#include <Arduino.h>
#include "Buttons.h"
#include "Buzzer.h"
#include "Kiosk.h"
#include "LcdDisplay.h"
#include "Pins.h"
#include "RfidReader.h"

#ifdef USE_MOCK_API
#include "MockApi.h"
#include "mock_data.h"
static MockApi api;
#else
#if !__has_include("secrets.h")
#error "Copy include/secrets.example.h to include/secrets.h and fill in your Wi-Fi, server address and kiosk key."
#endif
#include "secrets.h"
#include "EspHttpTransport.h"
#include "RestApi.h"
#include "WifiLink.h"
static EspHttpTransport http(API_BASE_URL, KIOSK_API_KEY);
static RestApi api(http);
static WifiLink wifi;
#endif

static LcdDisplay lcd;
static Buzzer buzzer;
static RfidReader rfid;
static PressDetector pressYes, pressNo, pressNext;
static Kiosk kiosk(api, lcd, buzzer);

#ifndef USE_MOCK_API
// Show a boot message for `ms`, keeping the buzzer sequencer running.
static void bootMessage(const char* l1, const char* l2, Tone tone, uint32_t ms) {
    lcd.show(l1, l2);
    if (tone != Tone::None) buzzer.play(tone);
    uint32_t start = millis();
    while ((uint32_t)(millis() - start) < ms) { buzzer.update(); delay(5); }
}

static void connectAndCheck() {
    lcd.show("EquipFlow", "Connecting WiFi");
    wifi.begin(WIFI_SSID, WIFI_PASSWORD);
    if (!wifi.waitConnected(15000)) {
        bootMessage("No WiFi", "Will keep trying", Tone::NetFail, 2000);
        return;                                        // the kiosk still starts; taps say "No network"
    }
    lcd.show("WiFi connected", "Checking server");
    switch (api.heartbeat()) {
        case Transport::Ok:           bootMessage("Server OK", "", Tone::Login, 1000); break;
        case Transport::Unauthorized: bootMessage("Bad API key", "Check secrets.h", Tone::Error, 3000); break;
        default:                      bootMessage("Server offline", "Check address", Tone::NetFail, 3000); break;
    }
}
#endif

void setup() {
    Serial.begin(115200);
    pinMode(PIN_BUTTON_YES,  INPUT_PULLUP);
    pinMode(PIN_BUTTON_NO,   INPUT_PULLUP);
    pinMode(PIN_BUTTON_NEXT, INPUT_PULLUP);
    lcd.begin();
    buzzer.begin();
    rfid.begin();
#ifdef USE_MOCK_API
    seedMockData(api);
    Serial.println("Kiosk ready (MOCK API)");
#else
    connectAndCheck();
    Serial.println("Kiosk ready");
#endif
    kiosk.begin(millis());
}

void loop() {
    uint32_t now = millis();

#ifndef USE_MOCK_API
    wifi.update(now);

    // Tell the server we are alive, but only while idle: a request can block for a few seconds.
    static uint32_t lastBeat = 0;
    if (kiosk.state() == Kiosk::State::Idle && wifi.connected() && (uint32_t)(now - lastBeat) >= 30000) {
        lastBeat = now;
        api.heartbeat();
    }
#endif

    std::string uid;
    if (rfid.poll(uid)) {
        Serial.printf("Tag: %s\n", uid.c_str());
        kiosk.onTag(uid, millis());
    }

    now = millis();
    if (pressYes.update(digitalRead(PIN_BUTTON_YES) == LOW, now))   kiosk.onButton(Button::Yes, now);
    if (pressNo.update(digitalRead(PIN_BUTTON_NO) == LOW, now))     kiosk.onButton(Button::No, now);
    if (pressNext.update(digitalRead(PIN_BUTTON_NEXT) == LOW, now)) kiosk.onButton(Button::Next, now);

    kiosk.tick(now);
    buzzer.update();
}
