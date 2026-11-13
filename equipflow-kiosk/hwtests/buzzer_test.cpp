// STEP 1d: buzzer test. Plays each tone in turn, every 2 s, naming it on Serial.
// Silence = check the 2N2222 (emitter to GND, collector to buzzer minus, base resistor to GPIO).
#include <Arduino.h>
#include "Buzzer.h"

static Buzzer buzzer;

void setup() {
    Serial.begin(115200);
    buzzer.begin();
}

void loop() {
    static const struct { Tone t; const char* name; } kTones[] = {
        {Tone::Login, "Login"}, {Tone::Success, "Success"}, {Tone::Warning, "Warning"},
        {Tone::Error, "Error"}, {Tone::NetFail, "NetFail"}};
    static uint8_t i = 0;
    static uint32_t last = 0;
    if (millis() - last >= 2000) {
        last = millis();
        Serial.println(kTones[i].name);
        buzzer.play(kTones[i].t);
        i = (i + 1) % 5;
    }
    buzzer.update();
}
