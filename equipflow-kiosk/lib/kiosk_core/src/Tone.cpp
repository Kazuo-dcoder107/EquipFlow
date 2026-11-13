#include "Tone.h"

namespace {
const ToneStep kLogin[]   = {{2000, 80}};
const ToneStep kSuccess[] = {{1500, 100}, {0, 40}, {2200, 160}};
const ToneStep kWarning[] = {{1200, 150}, {0, 80}, {1200, 150}};
const ToneStep kError[]   = {{400, 350}};
const ToneStep kNetFail[] = {{800, 120}, {0, 60}, {600, 120}, {0, 60}, {400, 200}};

const TonePattern pLogin   = {kLogin,   sizeof(kLogin)   / sizeof(ToneStep)};
const TonePattern pSuccess = {kSuccess, sizeof(kSuccess) / sizeof(ToneStep)};
const TonePattern pWarning = {kWarning, sizeof(kWarning) / sizeof(ToneStep)};
const TonePattern pError   = {kError,   sizeof(kError)   / sizeof(ToneStep)};
const TonePattern pNetFail = {kNetFail, sizeof(kNetFail) / sizeof(ToneStep)};
const TonePattern pNone    = {nullptr, 0};
}

const TonePattern& tonePattern(Tone t) {
    switch (t) {
        case Tone::Login:   return pLogin;
        case Tone::Success: return pSuccess;
        case Tone::Warning: return pWarning;
        case Tone::Error:   return pError;
        case Tone::NetFail: return pNetFail;
        default:            return pNone;
    }
}

void ToneSequencer::start(Tone t, uint32_t now) {
    const TonePattern& p = tonePattern(t);
    if (p.count == 0) { pattern_ = nullptr; return; }
    pattern_ = &p; index_ = 0; stepStart_ = now;
}

uint16_t ToneSequencer::update(uint32_t now) {
    while (pattern_) {
        const ToneStep& s = pattern_->steps[index_];
        if ((uint32_t)(now - stepStart_) < s.ms) return s.freq;
        stepStart_ += s.ms;
        if (++index_ >= pattern_->count) { pattern_ = nullptr; return 0; }
    }
    return 0;
}
