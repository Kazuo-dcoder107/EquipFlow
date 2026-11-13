// STEP 3 bring-up: Wi-Fi + server, with no kiosk logic. Watch the serial monitor.
//   1. connects to Wi-Fi and calls /heartbeat (checks address AND API key)
//   2. tap any tag: prints exactly what the server says about it
// Needs include/secrets.h. If the heartbeat fails, read the message printed below it.
#include <Arduino.h>
#include "EspHttpTransport.h"
#include "RestApi.h"
#include "RfidReader.h"
#include "WifiLink.h"
#include "secrets.h"

static EspHttpTransport http(API_BASE_URL, KIOSK_API_KEY);
static RestApi api(http);
static WifiLink wifi;
static RfidReader rfid;

static const char* describe(Transport t) {
    switch (t) {
        case Transport::Ok:           return "OK";
        case Transport::Timeout:      return "TIMEOUT (server not answering: wrong IP, or firewall?)";
        case Transport::NetError:     return "NETWORK ERROR (Wi-Fi down, or connection refused: uvicorn not on --host 0.0.0.0?)";
        case Transport::Unauthorized: return "UNAUTHORIZED (wrong KIOSK_API_KEY)";
        case Transport::ServerError:  return "SERVER ERROR (HTTP 5xx/422, or the reply was not JSON)";
    }
    return "?";
}

void setup() {
    Serial.begin(115200);
    delay(300);
    rfid.begin();
    Serial.printf("Connecting to %s ...\n", WIFI_SSID);
    wifi.begin(WIFI_SSID, WIFI_PASSWORD);
    if (!wifi.waitConnected(20000)) { Serial.println("Wi-Fi FAILED (check SSID/password; 2.4 GHz only)"); return; }
    Serial.printf("Wi-Fi OK, ESP32 address %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("Heartbeat to %s: %s\n", API_BASE_URL, describe(api.heartbeat()));
    Serial.println("Tap a tag...");
}

void loop() {
    wifi.update(millis());
    std::string uid;
    if (!rfid.poll(uid)) { delay(50); return; }

    ScanResp r = api.scan(uid);
    Serial.printf("UID %s -> %s\n", uid.c_str(), describe(r.transport));
    if (r.transport == Transport::Ok)
        Serial.printf("  ok=%d code=%s kind=%s name=%s status=%s type=%s agreement=%d\n", r.ok, r.code.c_str(),
                      r.kind.c_str(), r.name.c_str(), r.status.c_str(), r.type.c_str(), r.requiresAgreement);
}
