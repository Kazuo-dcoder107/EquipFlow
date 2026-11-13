#include "Buzzer.h"
#include <Arduino.h>

void Buzzer::begin() {
    ledcSetup(BUZZER_LEDC_CHANNEL, 2000, 8);
    ledcAttachPin(PIN_BUZZER, BUZZER_LEDC_CHANNEL);
    ledcWriteTone(BUZZER_LEDC_CHANNEL, 0);
}

void Buzzer::play(Tone t) { seq_.start(t, millis()); }

void Buzzer::update() {
    uint16_t f = seq_.update(millis());
    if (f != current_) {
        current_ = f;
        ledcWriteTone(BUZZER_LEDC_CHANNEL, f);   // 0 = silence
    }
}
