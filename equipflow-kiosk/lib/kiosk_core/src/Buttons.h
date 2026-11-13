#pragma once
#include <cstdint>

// The three arcade buttons.
enum class Button { Yes, No, Next };

// Debounces one button and reports exactly one event per press (on the way down, so the
// kiosk reacts instantly). Holding the button does not repeat.
class PressDetector {
public:
    explicit PressDetector(uint32_t debounceMs = 25) : debounceMs_(debounceMs) {}

    bool update(bool rawPressed, uint32_t now) {
        if (rawPressed != raw_) { raw_ = rawPressed; changedAt_ = now; }
        if (raw_ != stable_ && (uint32_t)(now - changedAt_) >= debounceMs_) {
            stable_ = raw_;
            return stable_;            // true only on a debounced press, never on release
        }
        return false;
    }

private:
    uint32_t debounceMs_;
    bool raw_ = false, stable_ = false;
    uint32_t changedAt_ = 0;
};
