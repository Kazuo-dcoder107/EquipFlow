#pragma once
#include <string>
#include "HttpTransport.h"

// Plain-HTTP transport on the ESP32's HTTPClient (the backend runs on uvicorn over HTTP on the LAN).
// Blocks for at most connectTimeoutMs + readTimeoutMs per request. Sends the X-API-Key header.
class EspHttpTransport : public IHttpTransport {
public:
    // baseUrl like "http://192.168.1.50:8000" (no trailing slash)
    EspHttpTransport(const char* baseUrl, const char* apiKey,
                     int connectTimeoutMs = 3000, int readTimeoutMs = 5000)
        : base_(baseUrl), key_(apiKey), connectMs_(connectTimeoutMs), readMs_(readTimeoutMs) {}

    HttpResponse request(const char* method, const std::string& path, const std::string* body) override;

private:
    std::string base_, key_;
    int connectMs_, readMs_;
};
