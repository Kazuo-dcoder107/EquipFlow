#include "Kiosk.h"
#include <cstdio>
#include "Messages.h"
#include "Text.h"

namespace {
bool reached(uint32_t now, uint32_t deadline) { return (int32_t)(now - deadline) >= 0; }
}

Kiosk::Kiosk(IApi& api, IDisplay& display, IBuzzer& buzzer, KioskConfig cfg)
    : api_(api), display_(display), buzzer_(buzzer), cfg_(cfg) {
    sessionMs_ = cfg_.defaultSessionMs;
}

void Kiosk::begin(uint32_t now) { enterIdle(now); render(now); }

// ---------------------------------------------------------------- screen helpers

void Kiosk::setScreen(const std::string& a, const std::string& b, uint32_t now) {
    if (!screenSet_ || a != l1_) { l1_ = a; since1_ = now; }
    if (!screenSet_ || b != l2_) { l2_ = b; since2_ = now; }
    screenSet_ = true;
}

void Kiosk::render(uint32_t now) {
    std::string w1 = marqueeWindow(l1_, now - since1_);
    std::string w2 = marqueeWindow(l2_, now - since2_);
    if (!shownValid_ || w1 != shown1_ || w2 != shown2_) {
        display_.show(w1, w2);
        shown1_ = w1; shown2_ = w2; shownValid_ = true;
    }
}

void Kiosk::enterIdle(uint32_t now) {
    state_ = State::Idle;
    setScreen("Tap your ID", "Scan item=return", now);
}

void Kiosk::enterLoggedIn(uint32_t now) {
    state_ = State::LoggedIn;
    refreshLoggedInScreen(now);
}

void Kiosk::refreshLoggedInScreen(uint32_t now) {
    if (!blockedL1_.empty()) { setScreen(blockedL1_, blockedL2_, now); return; }
    int32_t left = (int32_t)(sessionDeadline_ - now);
    int secs = left <= 0 ? 0 : (left + 999) / 1000;
    char buf[16];
    std::snprintf(buf, sizeof buf, "%ds", secs);
    setScreen(greeting_, rightAlign("Scan item", buf, 16), now);
}

void Kiosk::enterTerms(int page, uint32_t now) {
    state_ = State::Terms;
    termsPage_ = page;
    stateDeadline_ = now + cfg_.termsPageTimeoutMs;
    armGuard(now);
    if (page < kTermsTextCount) {
        char counter[24];
        std::snprintf(counter, sizeof counter, "%d/%d", page + 1, kTermsTextCount + 1);
        setScreen(kTermsText[page], rightAlign("NEXT >", counter, 16), now);
    } else {
        setScreen("Accept terms?", "YES=OK  NO=Exit", now);   // the accept page is always last
    }
}

void Kiosk::showResult(const std::string& a, const std::string& b, Tone tone, uint32_t now) {
    clearPending();
    state_ = State::Result;
    stateDeadline_ = now + cfg_.resultMs;
    setScreen(a, b, now);
    if (tone != Tone::None) buzzer_.play(tone);
}

void Kiosk::showCode(const std::string& code, const std::string& fallback, uint32_t now) {
    if (const CodeMessage* m = findMessage(code)) {
        showResult(m->line1, m->line2, m->tone, now);
    } else {
        showResult("Error", fallback.empty() ? code : fallback, Tone::Error, now);
    }
}

// Network calls block for up to a few seconds, so tell the user we heard them first.
void Kiosk::showBusy(uint32_t now) {
    setScreen("Please wait", "", now);
    render(now);
}

void Kiosk::goBase(uint32_t now) {
    clearPending();
    if (loggedIn_ && !reached(now, sessionDeadline_)) {
        enterLoggedIn(now);
    } else {
        if (loggedIn_) endSession(true);
        enterIdle(now);
    }
}

void Kiosk::clearPending() {
    pendingUid_.clear(); pendingName_.clear();
    pendingAgreement_ = false; termsPage_ = 0;
}

void Kiosk::endSession(bool callApi) {
    loggedIn_ = false;
    greeting_.clear(); blockedL1_.clear(); blockedL2_.clear();
    if (callApi) api_.logout();
}

void Kiosk::setBlocked(const std::string& code) {
    if (const CodeMessage* m = findMessage(code)) { blockedL1_ = m->line1; blockedL2_ = m->line2; }
    else { blockedL1_ = "Blocked"; blockedL2_ = "See the admin"; }
}

// ---------------------------------------------------------------- inputs

bool Kiosk::isRepeat(const std::string& uid, uint32_t now) {
    bool repeat = haveLast_ && uid == lastUid_ && (uint32_t)(now - lastSeenAt_) < cfg_.tagRepeatGapMs;
    lastUid_ = uid; lastSeenAt_ = now; haveLast_ = true;   // a held tag keeps extending the gap
    return repeat;
}

bool Kiosk::transportOk(Transport t, uint32_t now) {
    switch (t) {
        case Transport::Ok: return true;
        case Transport::Unauthorized: showResult("Bad API key", "Check config", Tone::Error, now); break;
        case Transport::NetError:     showResult("No network", "Try again", Tone::NetFail, now); break;
        case Transport::Timeout:      showResult("Server timeout", "Try again", Tone::NetFail, now); break;
        case Transport::ServerError:  showResult("Server error", "Try again", Tone::NetFail, now); break;
    }
    return false;
}

void Kiosk::onTag(const std::string& uid, uint32_t now) {
    if (isRepeat(uid, now)) return;
    clearPending();                                  // any new tag abandons a pending prompt

    showBusy(now);
    ScanResp s = api_.scan(uid);
    if (!transportOk(s.transport, now)) { render(now); return; }
    if (!s.ok) { showCode(s.code, s.message, now); render(now); return; }

    if (s.kind == "user")      handleUserTag(uid, now);
    else if (s.kind == "item") handleItemTag(uid, s, now);
    else                       showCode("unknown_tag", "", now);
    render(now);
}

void Kiosk::handleUserTag(const std::string& uid, uint32_t now) {
    LoginResp r = api_.login(uid);
    if (!transportOk(r.transport, now)) return;
    if (!r.ok) { showCode(r.code, r.message, now); return; }

    loggedIn_ = true;
    greeting_ = "Hi, " + firstWord(r.name);
    sessionMs_ = r.sessionSeconds > 0 ? (uint32_t)r.sessionSeconds * 1000u : cfg_.defaultSessionMs;
    sessionDeadline_ = now + sessionMs_;
    blockedL1_.clear(); blockedL2_.clear();
    if (!r.blocked.empty()) setBlocked(r.blocked);
    enterLoggedIn(now);
    buzzer_.play(r.blocked.empty() ? Tone::Login : Tone::Warning);
}

void Kiosk::handleItemTag(const std::string& uid, const ScanResp& s, uint32_t now) {
    if (loggedIn_ && cfg_.scanRefreshesSession) sessionDeadline_ = now + sessionMs_;

    if (s.status == "available") {
        if (!loggedIn_) { showResult("Tap your ID", "first", Tone::Warning, now); return; }
        if (!blockedL1_.empty()) { showResult(blockedL1_, blockedL2_, Tone::Warning, now); return; }
        pendingUid_ = uid; pendingName_ = s.name; pendingAgreement_ = s.requiresAgreement;
        state_ = State::ConfirmBorrow;
        stateDeadline_ = now + cfg_.confirmTimeoutMs;
        setScreen(s.name, "Borrow? YES / NO", now);
        armGuard(now);
        buzzer_.play(Tone::Login);
    } else if (s.status == "borrowed" || s.status == "overdue" || s.status == "missing") {
        doReturn(uid, now);                          // scanning a borrowed item returns it
    } else {
        showResult("Not available", "", Tone::Warning, now);
    }
}

void Kiosk::doReturn(const std::string& uid, uint32_t now) {
    ReturnResp r = api_.returnItem(uid);
    if (!transportOk(r.transport, now)) return;
    if (!r.ok) { showCode(r.code, r.message, now); return; }
    if (r.code == "found") { showResult("Item found", "Thank you", Tone::Success, now); return; }
    char buf[20];
    if (r.hasFine && r.fine > 0) std::snprintf(buf, sizeof buf, "Fine: P%d", r.fine);
    else std::snprintf(buf, sizeof buf, "Thank you");
    showResult("Returned", buf, Tone::Success, now);
}

void Kiosk::onButton(Button b, uint32_t now) {
    if (!reached(now, guardUntil_)) return;          // too soon after the prompt appeared

    switch (state_) {
    case State::LoggedIn:
        if (b == Button::No) {
            endSession(true);
            showResult("Logged out", "Goodbye", Tone::None, now);
        }
        break;

    case State::ConfirmBorrow:
        if (b == Button::No)       showResult("Cancelled", "", Tone::None, now);
        else if (b == Button::Yes) { if (pendingAgreement_) enterTerms(0, now); else doBorrow(false, now); }
        break;

    case State::Terms:
        if (b == Button::No) {
            showResult("Declined", "", Tone::None, now);
        } else if (b == Button::Next) {              // after the accept page, wrap to the first page
            enterTerms(termsPage_ < kTermsTextCount ? termsPage_ + 1 : 0, now);
        } else if (b == Button::Yes && termsPage_ == kTermsTextCount) {
            doBorrow(true, now);                     // accept works on the last page only
        }
        break;

    default: break;                                  // Idle / Result: buttons do nothing
    }
    render(now);
}

void Kiosk::doBorrow(bool agreed, uint32_t now) {
    const std::string uid = pendingUid_;
    if (loggedIn_) sessionDeadline_ = now + sessionMs_;   // the server refreshes on /borrow

    showBusy(now);
    BorrowResp r = api_.borrow(uid, agreed);

    if (r.transport != Transport::Ok) {
        // No answer: we cannot know if it was saved. Never retry blindly, never play success.
        if (r.transport == Transport::Unauthorized) { transportOk(r.transport, now); return; }
        EquipmentResp e = api_.equipment(uid);
        if (e.transport == Transport::Ok && e.status == "borrowed")
            showResult("Not confirmed", "Check My Loans", Tone::Warning, now);
        else
            showResult("Not saved", "Try again", Tone::NetFail, now);
        return;
    }

    if (r.ok) {
        std::string due = formatDue(r.dueAt, cfg_.utcOffsetHours);
        showResult("Borrowed!", due.empty() ? "Thank you" : due, Tone::Success, now);
        if (cfg_.autoLogoutAfterBorrow) endSession(true);
        return;
    }

    if (r.code == "no_session") endSession(false);
    else if (r.code == "unpaid_fine" || r.code == "has_overdue") setBlocked(r.code);
    showCode(r.code, r.message, now);
}

// ---------------------------------------------------------------- time

void Kiosk::tick(uint32_t now) {
    if (loggedIn_ && state_ != State::Result && reached(now, sessionDeadline_)) {
        endSession(true);
        showResult("Session ended", "Tap ID again", Tone::None, now);
    }

    switch (state_) {
    case State::Result:
        if (reached(now, stateDeadline_)) goBase(now);
        break;
    case State::ConfirmBorrow:
    case State::Terms:
        if (reached(now, stateDeadline_)) goBase(now);       // silence = cancel
        break;
    case State::LoggedIn:
        refreshLoggedInScreen(now);
        break;
    case State::Idle:
        break;
    }
    render(now);
}
