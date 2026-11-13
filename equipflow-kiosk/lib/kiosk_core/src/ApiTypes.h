#pragma once
#include <string>

// Result of talking to the server. Anything but Ok means we got NO usable answer,
// so the action must be treated as unconfirmed.
//   Timeout       no reply in time            NetError     Wi-Fi down / connection refused
//   Unauthorized  HTTP 401/403 (bad API key)  ServerError  HTTP 5xx, 422, or a body we cannot read
enum class Transport { Ok, Timeout, NetError, Unauthorized, ServerError };

// Mirrors the backend's one JSON shape: ok + code + message (HTTP 200 for business outcomes).
struct ApiResult {
    Transport transport = Transport::Ok;
    bool ok = false;
    std::string code;
    std::string message;
};

struct ScanResp : ApiResult {            // GET /api/kiosk/scan/{uid}
    std::string kind;                    // "user", "item" or ""
    std::string name, role, category, type, status;
    int loanDays = 0;
    bool requiresAgreement = false;
};

struct LoginResp : ApiResult {           // POST /api/kiosk/login
    std::string name, role;
    int sessionSeconds = 30;
    std::string blocked;                 // optional backend addition: "unpaid_fine" / "has_overdue" / ""
};

struct BorrowResp : ApiResult {          // POST /api/kiosk/borrow
    std::string dueAt;                   // ISO-8601 UTC
};

struct ReturnResp : ApiResult {          // POST /api/kiosk/return
    bool hasFine = false;
    int fine = 0;
};

struct EquipmentResp : ApiResult {       // GET /api/kiosk/equipment/{uid}
    std::string name, type, status;
    bool requiresAgreement = false;
};
