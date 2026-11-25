#pragma once
#include <cstdint>
#include <string>
#include <vector>
#include "ApiTypes.h"
#include "Buttons.h"
#include "Interfaces.h"

struct KioskConfig
{
    // ---- timing ----
    uint32_t confirmTimeoutMs = 10000;   // "Borrow?" prompt: no answer = cancel
    uint32_t termsPageTimeoutMs = 12000; // per terms page: no answer = decline
    uint32_t resultMs = 2500;            // how long a result message stays up
    uint32_t tagRepeatGapMs = 1000;      // same tag read again within this gap = ignored
    uint32_t defaultSessionMs = 30000;   // used if the server sends no session_seconds
    uint32_t inputGuardMs = 250;         // presses right after a new prompt are ignored (double-click guard)
    // ---- session ----
    bool autoLogoutAfterBorrow = true; // protect the next person at the kiosk
    bool scanRefreshesSession = true;  // the backend's /scan refreshes the session
    int utcOffsetHours = 8;            // Philippines
    // ---- terms (fetched from the server, cached) ----
    bool prefetchTerms = true;        // fetch while idle so the first borrow is not slowed down
    uint32_t termsRefreshMs = 600000; // re-fetch every 10 minutes
    uint32_t termsRetryMs = 30000;    // after a failed fetch, try again in 30 s
    // ---- enrollment (staff/admin only) ----
    bool enrollEnabled = true;
    uint32_t enrollIdleMs = 60000; // no button or tag for this long ends enrollment mode
    int enrollListLimit = 50;      // how many waiting accounts to load
};

// Kiosk flow: Idle -> LoggedIn -> ConfirmBorrow -> (Terms) -> Result, plus enrollment mode
// (EnrollPick -> EnrollTap) for staff and admin.
// Buttons: YES borrows / accepts / selects, NO cancels / declines / logs out, NEXT pages / moves on.
// Pure logic: no Arduino, no HTTP. Feed it tags, button presses and time.
class Kiosk
{
public:
    enum class State
    {
        Idle,
        LoggedIn,
        ReturnMode,
        ConfirmBorrow,
        Terms,
        Result,
        EnrollPick,
        EnrollTap
    };
    typedef uint32_t (*ClockFn)();

    Kiosk(IApi &api, IDisplay &display, IBuzzer &buzzer, KioskConfig cfg = KioskConfig());

    // Optional. A server call can take seconds, so `now` passed to onTag/onButton can be out of
    // date by the time the call returns. With a clock set, the kiosk re-reads the time after each call.
    void setClock(ClockFn f) { clock_ = f; }

    void begin(uint32_t now);
    void onTag(const std::string &uid, uint32_t now);
    void onButton(Button b, uint32_t now);
    void tick(uint32_t now);

    State state() const { return state_; }
    bool loggedIn() const { return loggedIn_; }
    bool enrolling() const { return enrolling_; }
    const std::string &line1() const { return l1_; } // full text, before scrolling
    const std::string &line2() const { return l2_; }

private:
    // screen
    void setScreen(const std::string &a, const std::string &b, uint32_t now);
    void render(uint32_t now);
    void enterIdle(uint32_t now);
    void enterLoggedIn(uint32_t now);
    void enterReturnMode(uint32_t now);
    void refreshLoggedInScreen(uint32_t now);
    void enterTerms(int page, uint32_t now);
    void showResult(const std::string &a, const std::string &b, Tone tone, uint32_t now);
    void showCode(const std::string &code, const std::string &fallback, uint32_t now);
    void showBusy(uint32_t now);
    void goBase(uint32_t now);

    // flows
    bool transportOk(Transport t, uint32_t now);
    void handleUserTag(const std::string &uid, uint32_t now);
    void handleItemTag(const std::string &uid, const ScanResp &s, uint32_t now);
    void doReturn(const std::string &uid, uint32_t now);
    void doBorrow(bool agreed, uint32_t now);
    bool isRepeat(const std::string &uid, uint32_t now);
    void endSession(bool callApi);
    void setBlocked(const std::string &code);
    void clearPending();
    uint32_t fresh(uint32_t now) const { return clock_ ? clock_() : now; }
    void armGuard(uint32_t now) { guardUntil_ = now + cfg_.inputGuardMs; }

    // terms
    bool loadTerms(uint32_t &now);
    int termsAcceptPage() const { return (int)((terms_.rows.size() + 1) / 2); }

    // enrollment
    bool canEnroll() const;
    void beginEnroll(uint32_t now);
    void enterEnrollPick(uint32_t now);
    void enterEnrollTap(uint32_t now);
    void showEnrollPick(uint32_t now);
    void exitEnroll(const std::string &message, uint32_t now);
    void handleEnrollTag(const std::string &uid, uint32_t now);
    void dropEnrollCandidate();

    IApi &api_;
    IDisplay &display_;
    IBuzzer &buzzer_;
    KioskConfig cfg_;
    ClockFn clock_ = nullptr;

    State state_ = State::Idle;
    uint32_t stateDeadline_ = 0;
    uint32_t guardUntil_ = 0;

    bool loggedIn_ = false;
    std::string greeting_, role_;
    uint32_t sessionMs_ = 30000, sessionDeadline_ = 0;
    std::string blockedL1_, blockedL2_;

    std::string pendingUid_, pendingName_;
    bool pendingAgreement_ = false;
    int termsPage_ = 0;

    struct Terms
    {
        bool valid = false;
        std::string version;
        std::vector<std::string> rows;
    };
    Terms terms_;
    uint32_t termsNextTry_ = 0;

    bool enrolling_ = false;
    std::vector<PendingUser> enrollList_;
    size_t enrollIdx_ = 0;
    uint32_t enrollDeadline_ = 0;

    std::string lastUid_;
    uint32_t lastSeenAt_ = 0;
    bool haveLast_ = false;

    std::string l1_, l2_, shown1_, shown2_;
    uint32_t since1_ = 0, since2_ = 0;
    bool screenSet_ = false, shownValid_ = false;
};
