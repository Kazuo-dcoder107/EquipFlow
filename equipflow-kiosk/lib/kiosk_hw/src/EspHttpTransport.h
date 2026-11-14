#pragma once
#include <atomic>
#include <string>
#include "HttpTransport.h"

// Plain-HTTP transport (the backend runs on uvicorn over HTTP on the LAN). Sends X-API-Key.
//
// The request runs on its OWN task. The caller waits in a short loop that keeps the watchdog fed
// and calls the wait hook (so the buzzer keeps working), and gives up after `hardDeadlineMs` no
// matter what the network stack is doing. A request that was given up on is finished and thrown
// away by the worker; until then new requests fail fast with NetError instead of piling up.
// If the worker is still stuck `stuckRestartMs` after it was abandoned, the network stack is
// wedged and the board restarts itself (the loop watchdog cannot see this: loop() keeps running).
class EspHttpTransport : public IHttpTransport {
public:
    // baseUrl like "http://192.168.1.50:8000" (no trailing slash)
    EspHttpTransport(const char* baseUrl, const char* apiKey, int connectTimeoutMs = 2500,
                     int readTimeoutMs = 3500, uint32_t hardDeadlineMs = 5000,
                     uint32_t stuckRestartMs = 30000);

    void begin();                              // creates the worker task; call once from setup()
    void setWaitHook(void (*hook)()) { waitHook_ = hook; }

    HttpResponse request(const char* method, const std::string& path, const std::string* body) override;

private:
    enum State { kIdle, kRunning, kDone, kAbandoned };

    static void taskEntry(void* self);
    void runJobs();
    HttpResponse perform();                    // the actual HTTP exchange, on the worker task

    std::string base_, key_;
    int connectMs_, readMs_;
    uint32_t hardMs_, stuckRestartMs_;
    uint32_t abandonedAt_ = 0;                 // when the caller gave up on the current worker job
    void (*waitHook_)() = nullptr;
    void* task_ = nullptr;                     // TaskHandle_t

    std::atomic<int> state_{kIdle};
    // The job: written by the caller only while kIdle, read by the worker only while kRunning.
    std::string method_, path_, body_;
    bool hasBody_ = false;
    HttpResponse result_;
};
