#pragma once
#include <cstdint>

// What the kiosk wants the buzzer to say. The hardware layer turns these into sound.
enum class Tone { None, Login, Success, Warning, Error, NetFail };

struct ToneStep { uint16_t freq; uint16_t ms; };           // freq 0 = silence
struct TonePattern { const ToneStep* steps; uint8_t count; };

const TonePattern& tonePattern(Tone t);

// Non-blocking player: call update(millis()) often, output the returned frequency.
class ToneSequencer {
public:
    void start(Tone t, uint32_t now);
    uint16_t update(uint32_t now);          // frequency to output now, 0 = silent
    bool active() const { return pattern_ != nullptr; }
private:
    const TonePattern* pattern_ = nullptr;
    uint8_t index_ = 0;
    uint32_t stepStart_ = 0;
};
