#pragma once
#include <cstdint>

// Task watchdog on the Arduino loop() task: if feed() is not called for `seconds`, the board
// resets itself. Protects the kiosk from freezing for good (a stuck driver, an endless loop).
class Watchdog {
public:
    static void begin(uint32_t seconds);
    static void feed();
    static const char* lastResetReason();   // why the board last started, e.g. "POWER-ON", "TASK_WDT"
    static bool lastResetWasFault();         // true after a freeze/crash/brown-out (not a normal start)
};
