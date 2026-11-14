#include "Watchdog.h"
#include <Arduino.h>
#include <esp_system.h>
#include <esp_task_wdt.h>

void Watchdog::begin(uint32_t seconds) {
    esp_err_t init = esp_task_wdt_init(seconds, true);   // true = reset the board when it fires
    esp_err_t add = esp_task_wdt_add(NULL);              // watch the task that runs loop()
    Serial.printf("[wdt] timeout %us (init=%d add=%d)\n", (unsigned)seconds, (int)init, (int)add);
}

void Watchdog::feed() { esp_task_wdt_reset(); }

const char* Watchdog::lastResetReason() {
    switch (esp_reset_reason()) {
        case ESP_RST_POWERON:  return "POWER-ON";
        case ESP_RST_EXT:      return "RESET BUTTON";
        case ESP_RST_SW:       return "SOFTWARE RESTART";
        case ESP_RST_PANIC:    return "CRASH (PANIC)";
        case ESP_RST_INT_WDT:  return "INTERRUPT WDT";
        case ESP_RST_TASK_WDT: return "TASK_WDT";
        case ESP_RST_WDT:      return "OTHER WDT";
        case ESP_RST_BROWNOUT: return "BROWN-OUT";
        case ESP_RST_DEEPSLEEP: return "DEEP SLEEP";
        default:               return "UNKNOWN";
    }
}

bool Watchdog::lastResetWasFault() {
    switch (esp_reset_reason()) {
        case ESP_RST_PANIC: case ESP_RST_INT_WDT: case ESP_RST_TASK_WDT:
        case ESP_RST_WDT: case ESP_RST_BROWNOUT: return true;
        default: return false;
    }
}
