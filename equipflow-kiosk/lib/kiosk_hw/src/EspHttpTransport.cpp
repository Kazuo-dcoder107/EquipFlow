#include "EspHttpTransport.h"
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <cstring>

HttpResponse EspHttpTransport::request(const char* method, const std::string& path, const std::string* body) {
    HttpResponse out;
    if (WiFi.status() != WL_CONNECTED) {               // fail at once instead of waiting for a timeout
        out.transport = Transport::NetError;
        Serial.printf("[http] %s %s -> no Wi-Fi\n", method, path.c_str());
        return out;
    }

    WiFiClient client;
    HTTPClient http;
    http.setConnectTimeout(connectMs_);
    http.setTimeout(readMs_);
    http.setReuse(false);                              // a fresh connection each time: no stale sockets
    if (!http.begin(client, (base_ + path).c_str())) {
        out.transport = Transport::NetError;
        return out;
    }
    http.addHeader("X-API-Key", key_.c_str());
    http.addHeader("Accept", "application/json");

    int code;
    if (std::strcmp(method, "GET") == 0) {
        code = http.GET();
    } else {
        http.addHeader("Content-Type", "application/json");
        String payload(body ? body->c_str() : "");
        code = http.POST(payload);
    }

    if (code < 0) {                                    // no HTTP response at all
        out.transport = (code == HTTPC_ERROR_READ_TIMEOUT) ? Transport::Timeout : Transport::NetError;
        Serial.printf("[http] %s %s -> error %d (%s)\n", method, path.c_str(), code,
                      HTTPClient::errorToString(code).c_str());
        http.end();
        return out;
    }

    out.status = code;
    out.body = http.getString().c_str();
    http.end();
    Serial.printf("[http] %s %s -> %d\n", method, path.c_str(), code);
    return out;
}
