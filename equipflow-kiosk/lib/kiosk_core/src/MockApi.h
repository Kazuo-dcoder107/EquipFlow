#pragma once
#include <map>
#include <string>
#include "Interfaces.h"

// In-memory stand-in for the FastAPI kiosk endpoints. It copies the real server's
// response shapes and rules (see backend borrowing.py / sessions.py) so the state machine
// can be tested without Wi-Fi. Step 3 swaps it for the real HTTP client.
class MockApi : public IApi {
public:
    // ---- seed data ----
    void addUser(const std::string& uid, const std::string& name,
                 const std::string& blockedCode = "", bool tagActive = true);
    void addItem(const std::string& uid, const std::string& name, const std::string& type,
                 const std::string& status = "available", int fineOnReturn = 0);

    // ---- test controls ----
    bool announceBlockedAtLogin = true;   // false = today's backend (blocked only seen at borrow)
    std::string dueAt = "2026-11-12T09:30:00Z";
    void expireSession() { sessionOpen_ = false; }
    // The next call to `op` ("scan","login","borrow","return","equipment","logout") gets no answer.
    // If applyOnServer, the server still performs the action (response lost on the way back).
    void failNext(const std::string& op, Transport t, bool applyOnServer = false);

    // ---- call counters ----
    int scanCalls = 0, loginCalls = 0, borrowCalls = 0, returnCalls = 0,
        equipmentCalls = 0, logoutCalls = 0;
    bool lastAgreed = false;
    std::string itemStatus(const std::string& uid) const;

    // ---- IApi ----
    ScanResp      scan(const std::string& uid) override;
    LoginResp     login(const std::string& uid) override;
    BorrowResp    borrow(const std::string& itemUid, bool agreed) override;
    ReturnResp    returnItem(const std::string& itemUid) override;
    EquipmentResp equipment(const std::string& itemUid) override;
    ApiResult     logout() override;

private:
    struct User { std::string name, blocked; bool active; };
    struct Item { std::string name, type, status, borrower; int fine; };

    bool consumeFail(const std::string& op, Transport& t, bool& apply);
    LoginResp  doLogin(const std::string& uid);
    BorrowResp doBorrow(const std::string& uid, bool agreed);
    ReturnResp doReturn(const std::string& uid);

    std::map<std::string, User> users_;
    std::map<std::string, Item> items_;
    bool sessionOpen_ = false;
    std::string sessionUid_;

    std::string failOp_;
    Transport failTransport_ = Transport::Timeout;
    bool failApply_ = false;
};
