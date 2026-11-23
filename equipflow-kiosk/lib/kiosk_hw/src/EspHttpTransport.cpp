#include "EspHttpTransport.h"
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <cstring>
#include "Watchdog.h"

EspHttpTransport::EspHttpTransport(const char *baseUrl, const char *apiKey, int connectTimeoutMs,
                                   int readTimeoutMs, uint32_t hardDeadlineMs, uint32_t stuckRestartMs)
    : base_(baseUrl), key_(apiKey), connectMs_(connectTimeoutMs), readMs_(readTimeoutMs),
      hardMs_(hardDeadlineMs), stuckRestartMs_(stuckRestartMs) {}

void EspHttpTransport::begin()
{
    if (task_)
        return;
    TaskHandle_t handle = nullptr;
    // Core 0 hosts the Wi-Fi stack; loop() runs on core 1 and stays free for buttons and the display.
    xTaskCreatePinnedToCore(&EspHttpTransport::taskEntry, "http", 10240, this, 1, &handle, 0);
    task_ = handle;
}

void EspHttpTransport::taskEntry(void *self) { static_cast<EspHttpTransport *>(self)->runJobs(); }

void EspHttpTransport::runJobs()
{
    for (;;)
    {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY); // sleep until a request arrives
        HttpResponse r = perform();
        result_ = r;
        int expected = kRunning;
        if (!state_.compare_exchange_strong(expected, kDone))
        {
            state_.store(kIdle); // the caller gave up on this one: drop it
        }
    }
}

HttpResponse EspHttpTransport::perform()
{
    HttpResponse out;
    WiFiClientSecure client;
    client.setInsecure(); // Temporary testing only
    HTTPClient http;
    http.setConnectTimeout(connectMs_);
    http.setTimeout(readMs_);
    http.setReuse(false); // a fresh connection each time: no stale sockets
    if (!http.begin(client, (base_ + path_).c_str()))
    {
        out.transport = Transport::NetError;
        return out;
    }
    http.addHeader("X-API-Key", key_.c_str());
    http.addHeader("Accept", "application/json");

    int code;
    if (method_ == "GET")
    {
        code = http.GET();
    }
    else
    {
        http.addHeader("Content-Type", "application/json");
        String payload(hasBody_ ? body_.c_str() : "");
        code = http.POST(payload);
    }

    if (code < 0)
    { // no HTTP response at all
        out.transport = (code == HTTPC_ERROR_READ_TIMEOUT) ? Transport::Timeout : Transport::NetError;
        Serial.printf("[http] %s %s -> error %d (%s)\n", method_.c_str(), path_.c_str(), code,
                      HTTPClient::errorToString(code).c_str());
        http.end();
        return out;
    }
    out.status = code;
    out.body = http.getString().c_str();
    http.end();
    Serial.printf("[http] %s %s -> %d\n", method_.c_str(), path_.c_str(), code);
    return out;
}

HttpResponse EspHttpTransport::request(const char *method, const std::string &path, const std::string *body)
{
    HttpResponse out;
    if (!task_)
        begin(); // safety net if setup() forgot

    if (WiFi.status() != WL_CONNECTED)
    { // fail at once instead of waiting for a timeout
        out.transport = Transport::NetError;
        Serial.printf("[http] %s %s -> no Wi-Fi\n", method, path.c_str());
        return out;
    }
    if (state_.load() != kIdle)
    { // an abandoned request is still winding down
        if (state_.load() == kAbandoned && (uint32_t)(millis() - abandonedAt_) >= stuckRestartMs_)
        {
            Serial.println("[http] worker stuck, restarting the board");
            delay(100);
            ESP.restart(); // the network stack is wedged; start fresh
        }
        out.transport = Transport::NetError;
        Serial.printf("[http] %s %s -> worker still busy\n", method, path.c_str());
        return out;
    }

    method_ = method;
    path_ = path;
    hasBody_ = body != nullptr;
    body_ = body ? *body : std::string();
    state_.store(kRunning);
    xTaskNotifyGive((TaskHandle_t)task_);

    const uint32_t start = millis();
    for (;;)
    {
        if (state_.load() == kDone)
        {
            out = result_;
            state_.store(kIdle);
            return out;
        }
        if ((uint32_t)(millis() - start) >= hardMs_)
        {
            int expected = kRunning;
            abandonedAt_ = millis(); // only this (caller) side uses it
            if (state_.compare_exchange_strong(expected, kAbandoned))
            {
                out.transport = Transport::Timeout; // hard deadline: whatever the network stack is doing
                Serial.printf("[http] %s %s -> gave up after %u ms\n", method, path.c_str(), (unsigned)hardMs_);
                return out;
            }
            continue; // it finished at this very moment: pick up kDone
        }
        Watchdog::feed(); // we are alive, just waiting
        if (waitHook_)
            waitHook_(); // keep the buzzer sequencer running
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}
