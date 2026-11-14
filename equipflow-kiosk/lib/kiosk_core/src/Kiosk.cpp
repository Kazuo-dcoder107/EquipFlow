#include "Kiosk.h"
#include <cstdio>
#include "Messages.h"
#include "Text.h"

namespace {
bool reached(uint32_t now, uint32_t deadline) { return (int32_t)(now - deadline) >= 0; }

const size_t kTermsWidth = 15;      // text columns per terms row (column 16 holds the ">" hint)
const size_t kTermsMaxRows = 24;    // at most 12 pages of text
}

Kiosk::Kiosk(IApi& api, IDisplay& display, IBuzzer& buzzer, KioskConfig cfg)
    : api_(api), display_(display), buzzer_(buzzer), cfg_(cfg) {
    sessionMs_ = cfg_.defaultSessionMs;
}

void Kiosk::begin(uint32_t now) {
    termsNextTry_ = now;                 // first terms fetch happens on the first idle tick
    enterIdle(now);
    render(now);
}

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
    std::string line2 = rightAlign("Scan item", buf, 16);
    if (canEnroll() && ((now / 3000) % 2) == 1) line2 = "NEXT = Enroll";   // staff/admin hint, alternating
    setScreen(greeting_, line2, now);
}

void Kiosk::enterTerms(int page, uint32_t now) {
    state_ = State::Terms;
    termsPage_ = page;
    stateDeadline_ = now + cfg_.termsPageTimeoutMs;
    armGuard(now);
    if (page < termsAcceptPage()) {
        const size_t a = (size_t)page * 2;
        const std::string second = a + 1 < terms_.rows.size() ? terms_.rows[a + 1] : std::string();
        setScreen(terms_.rows[a], fit(second, kTermsWidth) + ">", now);   // ">" = more to come (NEXT)
    } else {
        setScreen("Accept terms?", "YES=OK  NO=Exit", now);               // the accept page is always last
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

// Network calls can take seconds, so tell the user we heard them first.
void Kiosk::showBusy(uint32_t now) {
    setScreen("Please wait", "", now);
    render(now);
}

void Kiosk::goBase(uint32_t now) {
    clearPending();
    if (enrolling_) {                                    // a result in enrollment mode returns to the list
        if (enrollList_.empty()) exitEnroll("All enrolled", now);
        else enterEnrollPick(now);
        return;
    }
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
    greeting_.clear(); role_.clear(); blockedL1_.clear(); blockedL2_.clear();
    if (callApi) api_.logout();
}

void Kiosk::setBlocked(const std::string& code) {
    if (const CodeMessage* m = findMessage(code)) { blockedL1_ = m->line1; blockedL2_ = m->line2; }
    else { blockedL1_ = "Blocked"; blockedL2_ = "See the admin"; }
}

// ---------------------------------------------------------------- terms

// Fetches the terms from the server. A failed fetch never throws away a copy we already have.
bool Kiosk::loadTerms(uint32_t& now) {
    TermsResp t = api_.terms();
    now = fresh(now);
    termsNextTry_ = now + cfg_.termsRetryMs;
    if (t.transport != Transport::Ok || !t.ok || t.version.empty() || t.text.empty()) return false;
    std::vector<std::string> rows = wrapText(t.text, kTermsWidth, kTermsMaxRows);
    if (rows.empty()) return false;
    terms_.valid = true;
    terms_.version = t.version;
    terms_.rows = rows;
    termsNextTry_ = now + cfg_.termsRefreshMs;
    return true;
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

    if (enrolling_) {                                    // enrollment mode: tags mean "link this tag"
        if (state_ == State::EnrollTap) handleEnrollTag(uid, now);
        else if (state_ == State::EnrollPick) showResult("Pick a name", "then tap tag", Tone::Warning, now);
        render(now);
        return;
    }

    clearPending();                                      // any new tag abandons a pending prompt
    showBusy(now);
    ScanResp s = api_.scan(uid);
    now = fresh(now);
    if (!transportOk(s.transport, now)) { render(now); return; }
    if (!s.ok) { showCode(s.code, s.message, now); render(now); return; }

    if (s.kind == "user")      handleUserTag(uid, now);
    else if (s.kind == "item") handleItemTag(uid, s, now);
    else                       showCode("unknown_tag", "", now);
    render(now);
}

void Kiosk::handleUserTag(const std::string& uid, uint32_t now) {
    LoginResp r = api_.login(uid);
    now = fresh(now);
    if (!transportOk(r.transport, now)) return;
    if (!r.ok) { showCode(r.code, r.message, now); return; }

    loggedIn_ = true;
    greeting_ = "Hi, " + firstWord(r.name);
    role_ = r.role;
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
        doReturn(uid, now);                              // scanning a borrowed item returns it
    } else {
        showResult("Not available", "", Tone::Warning, now);
    }
}

void Kiosk::doReturn(const std::string& uid, uint32_t now) {
    ReturnResp r = api_.returnItem(uid);
    now = fresh(now);
    if (!transportOk(r.transport, now)) return;
    if (!r.ok) { showCode(r.code, r.message, now); return; }
    if (r.code == "found") { showResult("Item found", "Thank you", Tone::Success, now); return; }
    char buf[24];
    if (r.hasFine && r.fine > 0) std::snprintf(buf, sizeof buf, "Fine: P%d", r.fine);
    else std::snprintf(buf, sizeof buf, "Thank you");
    showResult("Returned", buf, Tone::Success, now);
}

void Kiosk::onButton(Button b, uint32_t now) {
    if (!reached(now, guardUntil_)) return;              // too soon after the prompt appeared

    switch (state_) {
    case State::LoggedIn:
        if (b == Button::No) {
            endSession(true);
            now = fresh(now);
            showResult("Logged out", "Goodbye", Tone::None, now);
        } else if (b == Button::Next && canEnroll()) {
            beginEnroll(now);
        }
        break;

    case State::ConfirmBorrow:
        if (b == Button::No) {
            showResult("Cancelled", "", Tone::None, now);
        } else if (b == Button::Yes) {
            if (!pendingAgreement_) {
                doBorrow(false, now);
            } else {
                if (!terms_.valid) {                     // not fetched yet (server was unreachable earlier)
                    showBusy(now);
                    bool got = loadTerms(now);
                    if (!got) { showResult("Terms offline", "Try again", Tone::NetFail, now); break; }
                }
                enterTerms(0, now);
            }
        }
        break;

    case State::Terms: {
        const int accept = termsAcceptPage();
        if (b == Button::No) {
            showResult("Declined", "", Tone::None, now);
        } else if (b == Button::Next) {                  // after the accept page, wrap to the first page
            enterTerms(termsPage_ < accept ? termsPage_ + 1 : 0, now);
        } else if (b == Button::Yes && termsPage_ == accept) {
            doBorrow(true, now);                         // accept works on the last page only
        }
        break;
    }

    case State::EnrollPick:
        enrollDeadline_ = now + cfg_.enrollIdleMs;
        if (b == Button::Next && !enrollList_.empty()) {
            enrollIdx_ = (enrollIdx_ + 1) % enrollList_.size();
            showEnrollPick(now);
        } else if (b == Button::Yes) {
            enterEnrollTap(now);
        } else if (b == Button::No) {
            exitEnroll("Enroll mode off", now);
        }
        break;

    case State::EnrollTap:
        enrollDeadline_ = now + cfg_.enrollIdleMs;
        if (b == Button::No) enterEnrollPick(now);      // back to the list
        break;

    default: break;                                      // Idle / Result: buttons do nothing
    }
    render(now);
}

void Kiosk::doBorrow(bool agreed, uint32_t now) {
    const std::string uid = pendingUid_;
    const std::string version = (agreed && terms_.valid) ? terms_.version : std::string();
    if (loggedIn_) sessionDeadline_ = now + sessionMs_;   // the server refreshes on /borrow

    showBusy(now);
    BorrowResp r = api_.borrow(uid, agreed, version);
    now = fresh(now);

    if (r.transport != Transport::Ok) {
        // No answer: we cannot know if it was saved. Never retry blindly, never play success.
        if (r.transport == Transport::Unauthorized) { transportOk(r.transport, now); return; }
        EquipmentResp e = api_.equipment(uid);
        now = fresh(now);
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

    if (r.code == "no_session") {
        endSession(false);
    } else if (r.code == "unpaid_fine" || r.code == "has_overdue") {
        setBlocked(r.code);
    } else if (r.code == "terms_changed") {              // the wording changed after we cached it
        terms_.valid = false;
        termsNextTry_ = now;                             // fetch the new text on the next idle tick
    }
    showCode(r.code, r.message, now);
}

// ---------------------------------------------------------------- enrollment

bool Kiosk::canEnroll() const {
    return cfg_.enrollEnabled && loggedIn_ && (role_ == "admin" || role_ == "staff");
}

void Kiosk::beginEnroll(uint32_t now) {
    showBusy(now);
    PendingResp p = api_.pendingUsers(cfg_.enrollListLimit);
    now = fresh(now);
    if (!transportOk(p.transport, now)) return;
    if (!p.ok) { showCode(p.code, p.message, now); return; }
    if (p.users.empty()) { showResult("No pending", "accounts", Tone::Warning, now); return; }
    enrolling_ = true;
    enrollList_ = p.users;
    enrollIdx_ = 0;
    enterEnrollPick(now);
}

void Kiosk::showEnrollPick(uint32_t now) {
    const PendingUser& u = enrollList_[enrollIdx_];
    char counter[16];
    std::snprintf(counter, sizeof counter, "%u/%u", (unsigned)(enrollIdx_ + 1), (unsigned)enrollList_.size());
    setScreen(u.fullName, rightAlign(u.srCode, counter, 16), now);
}

void Kiosk::enterEnrollPick(uint32_t now) {
    if (enrollList_.empty()) { exitEnroll("All enrolled", now); return; }
    if (enrollIdx_ >= enrollList_.size()) enrollIdx_ = 0;
    state_ = State::EnrollPick;
    enrollDeadline_ = now + cfg_.enrollIdleMs;
    armGuard(now);
    showEnrollPick(now);
}

void Kiosk::enterEnrollTap(uint32_t now) {
    state_ = State::EnrollTap;
    enrollDeadline_ = now + cfg_.enrollIdleMs;
    armGuard(now);
    setScreen("Tap new ID tag", enrollList_[enrollIdx_].fullName, now);
    buzzer_.play(Tone::Login);
}

void Kiosk::exitEnroll(const std::string& message, uint32_t now) {
    enrolling_ = false;
    enrollList_.clear();
    endSession(true);                                    // the staff member is logged out when done
    now = fresh(now);
    showResult(message, "", Tone::None, now);
}

void Kiosk::dropEnrollCandidate() {
    if (enrollIdx_ < enrollList_.size()) enrollList_.erase(enrollList_.begin() + (long)enrollIdx_);
    if (enrollIdx_ >= enrollList_.size()) enrollIdx_ = 0;
}

void Kiosk::handleEnrollTag(const std::string& uid, uint32_t now) {
    enrollDeadline_ = now + cfg_.enrollIdleMs;
    const PendingUser who = enrollList_[enrollIdx_];
    showBusy(now);
    ApiResult r = api_.enroll(who.srCode, uid);
    now = fresh(now);
    if (!transportOk(r.transport, now)) return;          // list is unchanged; the result returns to it
    if (r.ok) {
        dropEnrollCandidate();
        showResult("Enrolled!", who.fullName, Tone::Success, now);
        return;
    }
    if (r.code == "already_enrolled" || r.code == "unknown_user") dropEnrollCandidate();
    showCode(r.code, r.message, now);
}

// ---------------------------------------------------------------- time

void Kiosk::tick(uint32_t now) {
    if (loggedIn_ && !enrolling_ && state_ != State::Result && reached(now, sessionDeadline_)) {
        endSession(true);
        now = fresh(now);
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
    case State::EnrollPick:
    case State::EnrollTap:
        if (reached(now, enrollDeadline_)) exitEnroll("Enroll timeout", now);
        break;
    case State::LoggedIn:
        refreshLoggedInScreen(now);
        break;
    case State::Idle:
        if (cfg_.prefetchTerms && reached(now, termsNextTry_)) loadTerms(now);   // quiet, while idle
        break;
    }
    render(now);
}
