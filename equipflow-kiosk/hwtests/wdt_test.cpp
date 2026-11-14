// WATCHDOG test. Proves the board really resets itself when the program freezes.
//   Expected on the serial monitor:
//     "alive 1" ... "alive 5"    the loop checks in, nothing happens
//     "FREEZING NOW"             the loop stops checking in on purpose
//     ... about 5 seconds later the board restarts by itself ...
//     "Last reset: TASK_WDT (fault: yes)"   proof the watchdog did it
// If it freezes forever and never restarts, the watchdog is NOT working: tell me.
#include <Arduino.h>
#include "Watchdog.h"

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.printf("Last reset: %s (fault: %s)\n", Watchdog::lastResetReason(),
                  Watchdog::lastResetWasFault() ? "yes" : "no");
    Watchdog::begin(5);
}

void loop() {
    static int n = 0;
    if (n < 5) {
        Watchdog::feed();
        Serial.printf("alive %d\n", ++n);
        delay(1000);
    } else {
        Serial.println("FREEZING NOW (no more feeding, expect a reset in ~5 s)");
        delay(200);
        while (true) { }                               // a frozen program
    }
}
