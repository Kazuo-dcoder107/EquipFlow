#pragma once
#include <WiFi.h>
#include <cstdint>
#include <string>

// Station-mode Wi-Fi that keeps itself connected. Call update() every loop().
class WifiLink {
public:
    void begin(const char* ssid, const char* password);
    void update(uint32_t now);                 // retries every 15 s while disconnected
    bool connected() const { return WiFi.status() == WL_CONNECTED; }
    bool waitConnected(uint32_t timeoutMs);    // blocking; for boot only
private:
    std::string ssid_, password_;
    uint32_t lastAttempt_ = 0;
};
