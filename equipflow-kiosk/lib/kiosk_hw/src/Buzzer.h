#pragma once
#include "Interfaces.h"
#include "Tone.h"
#include "Pins.h"

// Non-blocking buzzer on the ESP32 LEDC peripheral (arduino-esp32 2.x API).
// Use a PASSIVE buzzer for different pitches; an active one only beeps at its own pitch.
class Buzzer : public IBuzzer {
public:
    void begin();
    void play(Tone t) override;
    void update();                 // call every loop()
private:
    ToneSequencer seq_;
    uint16_t current_ = 0;
};
