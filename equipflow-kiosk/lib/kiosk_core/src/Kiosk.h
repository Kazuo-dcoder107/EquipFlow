#pragma once
#include <cstdint>
#include <string>
#include "Buttons.h"
#include "Interfaces.h"

struct KioskConfig {
    uint32_t confirmTimeoutMs   = 10000;  // "Borrow?" prompt: no answer = cancel
    uint32_t termsPageTimeoutMs = 12000;  // per terms page: no answer = decline
    uint32_t resultMs           = 2500;   // how long a result message stays up
    uint32_t tagRepeatGapMs     = 1000;   // same tag read again within this gap = ignored
    uint32_t inputGuardMs       = 250;    // presses right after a new prompt are ignored (double-click guard)
    uint32_t defaultSessionMs   = 30000;  // used if the server sends no session_seconds
    bool autoLogoutAfterBorrow  = true;   // protect the next person at the kiosk
    bool scanRefreshesSession   = true;   // the backend's /scan now refreshes the session (kiosk-backend-changes.patch)
    int  utcOffsetHours         = 8;      // Philippines
};

// Kiosk flow: Idle -> LoggedIn -> ConfirmBorrow -> (Terms) -> Result.
// Buttons: YES borrows / accepts, NO cancels / declines / logs out, NEXT pages through the terms.
// Pure logic: no Arduino, no HTTP. Feed it tags, button events and time.
class Kiosk {
public:
    enum class State { Idle, LoggedIn, ConfirmBorrow, Terms, Result };

    Kiosk(IApi& api, IDisplay& display, IBuzzer& buzzer, KioskConfig cfg = KioskConfig());

    void begin(uint32_t now);
    void onTag(const std::string& uid, uint32_t now);
    void onButton(Button b, uint32_t now);
    void tick(uint32_t now);

    State state() const { return state_; }
    bool loggedIn() const { return loggedIn_; }
    const std::string& line1() const { return l1_; }   // full text, before scrolling
    const std::string& line2() const { return l2_; }

private:
    // screen
    void setScreen(const std::string& a, const std::string& b, uint32_t now);
    void render(uint32_t now);
    void enterIdle(uint32_t now);
    void enterLoggedIn(uint32_t now);
    void refreshLoggedInScreen(uint32_t now);
    void enterTerms(int page, uint32_t now);
    void showResult(const std::string& a, const std::string& b, Tone tone, uint32_t now);
    void showCode(const std::string& code, const std::string& fallback, uint32_t now);
    void showBusy(uint32_t now);
    void goBase(uint32_t now);

    // flows
    bool transportOk(Transport t, uint32_t now);
    void handleUserTag(const std::string& uid, uint32_t now);
    void handleItemTag(const std::string& uid, const ScanResp& s, uint32_t now);
    void doReturn(const std::string& uid, uint32_t now);
    void doBorrow(bool agreed, uint32_t now);
    bool isRepeat(const std::string& uid, uint32_t now);
    void endSession(bool callApi);
    void setBlocked(const std::string& code);
    void clearPending();
    void armGuard(uint32_t now) { guardUntil_ = now + cfg_.inputGuardMs; }

    IApi& api_;
    IDisplay& display_;
    IBuzzer& buzzer_;
    KioskConfig cfg_;

    State state_ = State::Idle;
    uint32_t stateDeadline_ = 0;
    uint32_t guardUntil_ = 0;

    bool loggedIn_ = false;
    std::string greeting_;
    uint32_t sessionMs_ = 30000, sessionDeadline_ = 0;
    std::string blockedL1_, blockedL2_;

    std::string pendingUid_, pendingName_;
    bool pendingAgreement_ = false;
    int termsPage_ = 0;

    std::string lastUid_;
    uint32_t lastSeenAt_ = 0;
    bool haveLast_ = false;

    std::string l1_, l2_, shown1_, shown2_;
    uint32_t since1_ = 0, since2_ = 0;
    bool screenSet_ = false, shownValid_ = false;
};
