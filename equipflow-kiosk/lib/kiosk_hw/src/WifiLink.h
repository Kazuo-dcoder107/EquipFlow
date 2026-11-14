#pragma once
#include <WiFi.h>
#include <cstdint>
#include <string>

// Station-mode Wi-Fi that keeps itself connected. Call update() every loop().
class WifiLink {
public:
    void begin(const char* ssid, const char* password);
    void update(uint32_t now);                 // retries every 15 s; restarts the board after 3 min offline
    bool connected() const { return WiFi.status() == WL_CONNECTED; }
    bool waitConnected(uint32_t timeoutMs);    // blocking; for boot only
private:
    std::string ssid_, password_;
    uint32_t lastAttempt_ = 0;
    uint32_t lastUp_ = 0;                      // last time we were connected
};
