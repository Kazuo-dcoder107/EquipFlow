// STEP 1c: three arcade buttons. Expect exactly one "YES", "NO" or "NEXT" line per press.
// Nothing printed for a button = check its wiring (one leg to the GPIO, the other to GND).
// Several lines per press = loose contact; the debounce handles normal switch chatter only.
#include <Arduino.h>
#include "Buttons.h"
#include "Pins.h"

static PressDetector pressYes, pressNo, pressNext;

void setup() {
    Serial.begin(115200);
    pinMode(PIN_BUTTON_YES,  INPUT_PULLUP);
    pinMode(PIN_BUTTON_NO,   INPUT_PULLUP);
    pinMode(PIN_BUTTON_NEXT, INPUT_PULLUP);
    Serial.println("Press each button...");
}

void loop() {
    uint32_t now = millis();
    if (pressYes.update(digitalRead(PIN_BUTTON_YES) == LOW, now))   Serial.println("YES");
    if (pressNo.update(digitalRead(PIN_BUTTON_NO) == LOW, now))     Serial.println("NO");
    if (pressNext.update(digitalRead(PIN_BUTTON_NEXT) == LOW, now)) Serial.println("NEXT");
}
