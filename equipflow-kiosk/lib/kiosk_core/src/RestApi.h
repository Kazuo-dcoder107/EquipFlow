#pragma once
#include "HttpTransport.h"
#include "Interfaces.h"
#include "MiniJson.h"

// The real kiosk API client: IApi over the FastAPI /api/kiosk endpoints.
// Business outcomes arrive as HTTP 200 + ok/code/message and are passed through untouched.
class RestApi : public IApi {
public:
    explicit RestApi(IHttpTransport& http) : http_(http) {}

    ScanResp      scan(const std::string& uid) override;
    LoginResp     login(const std::string& uid) override;
    BorrowResp    borrow(const std::string& itemUid, bool agreed, const std::string& termsVersion) override;
    ReturnResp    returnItem(const std::string& itemUid) override;
    EquipmentResp equipment(const std::string& itemUid) override;
    ApiResult     logout() override;
    TermsResp     terms() override;
    PendingResp   pendingUsers(int limit) override;
    ApiResult     enroll(const std::string& srCode, const std::string& userUid) override;

    Transport heartbeat();            // Ok only if the server answered {"ok": true}

private:
    Transport call(const char* method, const std::string& path, const std::string* body, JsonObject& out);
    static bool safeUid(const std::string& uid);

    IHttpTransport& http_;
};
