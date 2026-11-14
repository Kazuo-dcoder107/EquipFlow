#pragma once
#include <map>
#include <string>
#include <vector>
#include "Interfaces.h"

// In-memory stand-in for the FastAPI kiosk endpoints. It copies the real server's response shapes
// and rules (see backend borrowing.py / sessions.py / enrollment.py / terms.py) so the state
// machine can be tested without Wi-Fi.
class MockApi : public IApi {
public:
    // ---- seed data ----
    void addUser(const std::string& uid, const std::string& name, const std::string& blockedCode = "",
                 bool tagActive = true, const std::string& role = "student");
    void addItem(const std::string& uid, const std::string& name, const std::string& type,
                 const std::string& status = "available", int fineOnReturn = 0);
    void addPending(const std::string& srCode, const std::string& fullName);

    // ---- test controls ----
    bool announceBlockedAtLogin = true;   // false = a backend without borrowing_blocked
    std::string dueAt = "2026-11-12T09:30:00Z";
    std::string termsText = "Handle with care\nReturn on time";
    std::string termsVersion = "v1";
    void expireSession() { sessionOpen_ = false; }
    // The next call to `op` ("scan","login","borrow","return","equipment","logout","terms",
    // "pending","enroll") gets no answer. If applyOnServer, the server still performs the action.
    void failNext(const std::string& op, Transport t, bool applyOnServer = false);

    // ---- call counters ----
    int scanCalls = 0, loginCalls = 0, borrowCalls = 0, returnCalls = 0, equipmentCalls = 0,
        logoutCalls = 0, termsCalls = 0, pendingCalls = 0, enrollCalls = 0;
    bool lastAgreed = false;
    std::string lastTermsVersionSent;
    std::string itemStatus(const std::string& uid) const;
    size_t pendingCount() const { return pending_.size(); }
    bool hasUser(const std::string& uid) const { return users_.count(uid) > 0; }

    // ---- IApi ----
    ScanResp      scan(const std::string& uid) override;
    LoginResp     login(const std::string& uid) override;
    BorrowResp    borrow(const std::string& itemUid, bool agreed, const std::string& termsVersion) override;
    ReturnResp    returnItem(const std::string& itemUid) override;
    EquipmentResp equipment(const std::string& itemUid) override;
    ApiResult     logout() override;
    TermsResp     terms() override;
    PendingResp   pendingUsers(int limit) override;
    ApiResult     enroll(const std::string& srCode, const std::string& userUid) override;

private:
    struct User { std::string name, blocked, role; bool active; };
    struct Item { std::string name, type, status, borrower; int fine; };

    bool consumeFail(const std::string& op, Transport& t, bool& apply);
    LoginResp  doLogin(const std::string& uid);
    BorrowResp doBorrow(const std::string& uid, bool agreed, const std::string& termsVersion);
    ReturnResp doReturn(const std::string& uid);
    ApiResult  doEnroll(const std::string& srCode, const std::string& uid);

    std::map<std::string, User> users_;
    std::map<std::string, Item> items_;
    std::vector<PendingUser> pending_;
    bool sessionOpen_ = false;
    std::string sessionUid_;

    std::string failOp_;
    Transport failTransport_ = Transport::Timeout;
    bool failApply_ = false;
};
