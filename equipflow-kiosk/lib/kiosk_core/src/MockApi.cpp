#include "MockApi.h"

void MockApi::addUser(const std::string& uid, const std::string& name,
                      const std::string& blockedCode, bool tagActive, const std::string& role) {
    User u; u.name = name; u.blocked = blockedCode; u.active = tagActive; u.role = role;
    users_[uid] = u;
}

void MockApi::addItem(const std::string& uid, const std::string& name, const std::string& type,
                      const std::string& status, int fineOnReturn) {
    Item i; i.name = name; i.type = type; i.status = status; i.fine = fineOnReturn;
    items_[uid] = i;
}

void MockApi::addPending(const std::string& srCode, const std::string& fullName) {
    PendingUser p; p.srCode = srCode; p.fullName = fullName;
    pending_.push_back(p);
}

std::string MockApi::itemStatus(const std::string& uid) const {
    auto it = items_.find(uid);
    return it == items_.end() ? "" : it->second.status;
}

void MockApi::failNext(const std::string& op, Transport t, bool applyOnServer) {
    failOp_ = op; failTransport_ = t; failApply_ = applyOnServer;
}

bool MockApi::consumeFail(const std::string& op, Transport& t, bool& apply) {
    if (failOp_ != op) return false;
    t = failTransport_; apply = failApply_; failOp_.clear();
    return true;
}

// ------------------------------------------------------------------ scan / equipment

ScanResp MockApi::scan(const std::string& uid) {
    ++scanCalls;
    ScanResp r; Transport t; bool apply;
    if (consumeFail("scan", t, apply)) { r.transport = t; return r; }

    auto u = users_.find(uid);
    if (u != users_.end()) {
        r.kind = "user";
        if (!u->second.active) { r.ok = false; r.code = "tag_deactivated"; r.message = "Tag deactivated"; return r; }
        r.ok = true; r.code = "ok"; r.message = "ID tag"; r.name = u->second.name; r.role = u->second.role;
        return r;
    }
    auto i = items_.find(uid);
    if (i != items_.end()) {
        r.ok = true; r.code = "ok"; r.message = "Item tag"; r.kind = "item";
        r.name = i->second.name; r.type = i->second.type; r.status = i->second.status;
        r.category = i->second.type == "hardware" ? "Laptop" : "Book";
        r.loanDays = i->second.type == "hardware" ? 2 : 7;
        r.requiresAgreement = i->second.type == "hardware";
        return r;
    }
    r.ok = false; r.code = "unknown_tag"; r.message = "Unknown tag";
    return r;
}

EquipmentResp MockApi::equipment(const std::string& uid) {
    ++equipmentCalls;
    EquipmentResp r; Transport t; bool apply;
    if (consumeFail("equipment", t, apply)) { r.transport = t; return r; }
    auto i = items_.find(uid);
    if (i == items_.end()) { r.code = "unknown_item"; r.message = "Unknown tag"; return r; }
    r.ok = true; r.code = "ok"; r.message = "Found"; r.name = i->second.name;
    r.type = i->second.type; r.status = i->second.status;
    r.requiresAgreement = i->second.type == "hardware";
    return r;
}

// ------------------------------------------------------------------ login / logout

LoginResp MockApi::login(const std::string& uid) {
    ++loginCalls;
    Transport t; bool apply;
    if (consumeFail("login", t, apply)) {
        if (apply) doLogin(uid);
        LoginResp r; r.transport = t; return r;
    }
    return doLogin(uid);
}

LoginResp MockApi::doLogin(const std::string& uid) {
    LoginResp r;
    auto u = users_.find(uid);
    if (u == users_.end()) {
        bool isItem = items_.count(uid) > 0;
        r.code = isItem ? "wrong_tag_type" : "unknown_tag";
        r.message = isItem ? "Item tag. Tap your ID" : "Unknown tag";
        return r;
    }
    if (!u->second.active) { r.code = "tag_deactivated"; r.message = "Tag deactivated"; return r; }
    sessionOpen_ = true; sessionUid_ = uid;
    r.ok = true; r.code = "ok"; r.message = "Welcome";
    r.name = u->second.name; r.role = u->second.role; r.sessionSeconds = 30;
    if (announceBlockedAtLogin) r.blocked = u->second.blocked;
    return r;
}

ApiResult MockApi::logout() {
    ++logoutCalls;
    ApiResult r; Transport t; bool apply;
    if (consumeFail("logout", t, apply)) { r.transport = t; return r; }
    sessionOpen_ = false;
    r.ok = true; r.code = "ok"; r.message = "Logged out";
    return r;
}

// ------------------------------------------------------------------ borrow

BorrowResp MockApi::borrow(const std::string& uid, bool agreed, const std::string& termsVersion) {
    ++borrowCalls; lastAgreed = agreed; lastTermsVersionSent = termsVersion;
    Transport t; bool apply;
    if (consumeFail("borrow", t, apply)) {
        if (apply) doBorrow(uid, agreed, termsVersion);
        BorrowResp r; r.transport = t; return r;
    }
    return doBorrow(uid, agreed, termsVersion);
}

BorrowResp MockApi::doBorrow(const std::string& uid, bool agreed, const std::string& termsVersion) {
    BorrowResp r;
    auto fail = [&](const char* code, const char* msg) { r.ok = false; r.code = code; r.message = msg; return r; };

    if (!sessionOpen_) return fail("no_session", "Tap your ID first");
    if (!termsVersion.empty() && termsVersion != this->termsVersion)        // same order as the backend
        return fail("terms_changed", "Terms updated. Try again");
    const User& u = users_[sessionUid_];
    if (!u.blocked.empty()) return fail(u.blocked.c_str(), "Blocked");

    auto it = items_.find(uid);
    if (it == items_.end())
        return users_.count(uid) ? fail("wrong_tag_type", "ID tag. Scan the item")
                                 : fail("unknown_item", "Unknown tag");
    Item& item = it->second;
    if (item.status != "available") return fail("item_unavailable", "Not available");
    if (item.type == "hardware" && !agreed) return fail("agreement_required", "Accept terms first");

    int books = 0, hardware = 0;                       // same limits as the backend: 2 books OR 1 hardware
    for (const auto& kv : items_)
        if (kv.second.borrower == sessionUid_ && kv.second.status != "available")
            (kv.second.type == "book" ? books : hardware)++;
    bool blocked = item.type == "book" ? (hardware > 0 || books >= 2) : (hardware >= 1 || books > 0);
    if (blocked) return fail("limit_reached", "Limit reached");

    item.status = "borrowed"; item.borrower = sessionUid_;
    r.ok = true; r.code = "ok"; r.message = "Borrowed"; r.dueAt = dueAt;
    return r;
}

// ------------------------------------------------------------------ return

ReturnResp MockApi::returnItem(const std::string& uid) {
    ++returnCalls;
    Transport t; bool apply;
    if (consumeFail("return", t, apply)) {
        if (apply) doReturn(uid);
        ReturnResp r; r.transport = t; return r;
    }
    return doReturn(uid);
}

ReturnResp MockApi::doReturn(const std::string& uid) {
    ReturnResp r;
    auto it = items_.find(uid);
    if (it == items_.end()) {
        bool isUser = users_.count(uid) > 0;
        r.code = isUser ? "wrong_tag_type" : "unknown_item";
        r.message = isUser ? "ID tag. Scan the item" : "Unknown tag";
        return r;
    }
    Item& item = it->second;
    if (item.status == "missing") { item.status = "available"; r.ok = true; r.code = "found"; r.message = "Item found"; return r; }
    if (item.status != "borrowed" && item.status != "overdue") { r.code = "not_borrowed"; r.message = "Not borrowed"; return r; }
    r.ok = true; r.code = "ok"; r.hasFine = true; r.fine = item.fine;
    r.message = item.fine ? "Returned. Fine" : "Returned";
    item.status = "available"; item.borrower.clear();
    return r;
}

// ------------------------------------------------------------------ terms / enrollment

TermsResp MockApi::terms() {
    ++termsCalls;
    TermsResp r; Transport t; bool apply;
    if (consumeFail("terms", t, apply)) { r.transport = t; return r; }
    r.ok = true; r.code = "ok"; r.message = "Terms"; r.version = termsVersion; r.text = termsText;
    return r;
}

PendingResp MockApi::pendingUsers(int limit) {
    ++pendingCalls;
    PendingResp r; Transport t; bool apply;
    if (consumeFail("pending", t, apply)) { r.transport = t; return r; }
    r.ok = true; r.code = "ok"; r.message = "Pending";
    for (const PendingUser& p : pending_) {
        if ((int)r.users.size() >= limit) break;
        r.users.push_back(p);
    }
    return r;
}

ApiResult MockApi::enroll(const std::string& srCode, const std::string& userUid) {
    ++enrollCalls;
    Transport t; bool apply;
    if (consumeFail("enroll", t, apply)) {
        if (apply) doEnroll(srCode, userUid);
        ApiResult r; r.transport = t; return r;
    }
    return doEnroll(srCode, userUid);
}

ApiResult MockApi::doEnroll(const std::string& srCode, const std::string& uid) {
    ApiResult r;
    auto fail = [&](const char* code, const char* msg) { r.ok = false; r.code = code; r.message = msg; return r; };
    size_t idx = pending_.size();
    for (size_t i = 0; i < pending_.size(); ++i) if (pending_[i].srCode == srCode) idx = i;
    if (idx == pending_.size()) return fail("unknown_user", "Unknown SR-code");
    if (items_.count(uid)) return fail("wrong_tag_type", "Item tag. Use an ID card");
    if (users_.count(uid)) return fail("tag_taken", "Tag already used");
    addUser(uid, pending_[idx].fullName);
    pending_.erase(pending_.begin() + (long)idx);
    r.ok = true; r.code = "ok"; r.message = "Registered";
    return r;
}
