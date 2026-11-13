#pragma once
#include <string>
#include "ApiTypes.h"

struct HttpResponse {
    Transport transport = Transport::Ok;   // anything but Ok: no HTTP response was received
    int status = 0;                        // HTTP status code when transport == Ok
    std::string body;
};

// One HTTP round trip to the kiosk server. The ESP32 implementation lives in kiosk_hw;
// tests use a scripted fake. `path` starts with "/" (e.g. "/api/kiosk/scan/04A1B2C3").
// `body` is null for GET; POSTs always pass a body (possibly empty).
class IHttpTransport {
public:
    virtual ~IHttpTransport() {}
    virtual HttpResponse request(const char* method, const std::string& path, const std::string* body) = 0;
};
