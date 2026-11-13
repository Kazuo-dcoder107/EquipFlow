#include "WifiLink.h"
#include <Arduino.h>

void WifiLink::begin(const char* ssid, const char* password) {
    ssid_ = ssid;
    password_ = password;
    WiFi.persistent(false);              // do not wear out flash re-saving credentials
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);                // no modem sleep: lower and steadier latency
    WiFi.setAutoReconnect(true);
    WiFi.begin(ssid_.c_str(), password_.c_str());
    lastAttempt_ = millis();
}

void WifiLink::update(uint32_t now) {
    if (connected()) return;
    if ((uint32_t)(now - lastAttempt_) >= 15000) {
        lastAttempt_ = now;
        WiFi.disconnect();
        WiFi.begin(ssid_.c_str(), password_.c_str());
    }
}

bool WifiLink::waitConnected(uint32_t timeoutMs) {
    uint32_t start = millis();
    while (!connected() && (uint32_t)(millis() - start) < timeoutMs) delay(100);
    return connected();
}
