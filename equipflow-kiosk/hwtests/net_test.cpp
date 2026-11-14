// STEP 3 bring-up: Wi-Fi + server, with no kiosk logic. Watch the serial monitor.
//   1. connects to Wi-Fi and calls /heartbeat (checks address AND API key)
//   2. fetches the kiosk terms and the list of accounts waiting for an ID tag
//   3. tap any tag: prints exactly what the server says about it
// Needs include/secrets.h. If the heartbeat fails, read the message printed below it.
#include <Arduino.h>
#include "EspHttpTransport.h"
#include "RestApi.h"
#include "Text.h"
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
    http.begin();                                       // starts the request task
    Serial.printf("Connecting to %s ...\n", WIFI_SSID);
    wifi.begin(WIFI_SSID, WIFI_PASSWORD);
    if (!wifi.waitConnected(20000)) { Serial.println("Wi-Fi FAILED (check SSID/password; 2.4 GHz only)"); return; }
    Serial.printf("Wi-Fi OK, ESP32 address %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("Heartbeat to %s: %s\n", API_BASE_URL, describe(api.heartbeat()));

    TermsResp t = api.terms();
    Serial.printf("Terms: %s", describe(t.transport));
    if (t.transport == Transport::Ok) {
        Serial.printf(" version=%s\n", t.version.c_str());
        std::vector<std::string> rows = wrapText(t.text, 15, 24);
        for (size_t i = 0; i < rows.size(); i++) Serial.printf("  |%-15s|\n", rows[i].c_str());
    } else Serial.println();

    PendingResp p = api.pendingUsers(5);
    Serial.printf("Waiting for an ID tag: %s", describe(p.transport));
    if (p.transport == Transport::Ok) {
        Serial.printf(" (%d shown)\n", (int)p.users.size());
        for (size_t i = 0; i < p.users.size(); i++)
            Serial.printf("  %s  %s\n", p.users[i].srCode.c_str(), p.users[i].fullName.c_str());
    } else Serial.println();
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
