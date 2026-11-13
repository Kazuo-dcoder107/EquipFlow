#include "RestApi.h"
#include "Text.h"

namespace {

const char* const kBase = "/api/kiosk";

void fillResult(const JsonObject& j, ApiResult& r) {
    r.ok = j.boolean("ok");
    r.code = j.str("code");
    r.message = toLcdAscii(j.str("message"));
}

void unknownTag(ApiResult& r) { r.ok = false; r.code = "unknown_tag"; r.message = "Unknown tag"; }

}  // namespace

// Tag UIDs go into the URL and into a JSON string unescaped, so only plain tag characters pass.
// (The RC522 reader produces hex; the server normalizes the rest.)
bool RestApi::safeUid(const std::string& uid) {
    if (uid.empty() || uid.size() > 40) return false;
    for (char c : uid) {
        bool ok = (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '-' || c == ':' || c == '_';
        if (!ok) return false;
    }
    return true;
}

Transport RestApi::call(const char* method, const std::string& path, const std::string* body, JsonObject& out) {
    HttpResponse r = http_.request(method, path, body);
    if (r.transport != Transport::Ok) return r.transport;
    if (r.status == 401 || r.status == 403) return Transport::Unauthorized;
    if (r.status != 200) return Transport::ServerError;
    if (!JsonObject::parse(r.body, out)) return Transport::ServerError;
    return Transport::Ok;
}

ScanResp RestApi::scan(const std::string& uid) {
    ScanResp r;
    if (!safeUid(uid)) { unknownTag(r); return r; }
    JsonObject j;
    r.transport = call("GET", std::string(kBase) + "/scan/" + uid, nullptr, j);
    if (r.transport != Transport::Ok) return r;
    fillResult(j, r);
    r.kind = j.str("kind");
    r.name = toLcdAscii(j.str("name"));
    r.role = j.str("role");
    r.category = toLcdAscii(j.str("category"));
    r.type = j.str("type");
    r.status = j.str("status");
    r.loanDays = (int)j.integer("loan_days");
    r.requiresAgreement = j.boolean("requires_agreement");
    return r;
}

LoginResp RestApi::login(const std::string& uid) {
    LoginResp r;
    if (!safeUid(uid)) { unknownTag(r); return r; }
    JsonObject j;
    std::string body = "{\"user_uid\":\"" + uid + "\"}";
    r.transport = call("POST", std::string(kBase) + "/login", &body, j);
    if (r.transport != Transport::Ok) return r;
    fillResult(j, r);
    r.name = toLcdAscii(j.str("name"));
    r.role = j.str("role");
    if (!j.isNull("session_seconds")) r.sessionSeconds = (int)j.integer("session_seconds", 30);
    r.blocked = j.str("borrowing_blocked");       // "" when null/missing (older backend)
    return r;
}

BorrowResp RestApi::borrow(const std::string& itemUid, bool agreed) {
    BorrowResp r;
    if (!safeUid(itemUid)) { unknownTag(r); return r; }
    JsonObject j;
    std::string body = "{\"item_uid\":\"" + itemUid + "\",\"agreed\":" + (agreed ? "true" : "false") + "}";
    r.transport = call("POST", std::string(kBase) + "/borrow", &body, j);
    if (r.transport != Transport::Ok) return r;
    fillResult(j, r);
    r.dueAt = j.str("due_at");
    return r;
}

ReturnResp RestApi::returnItem(const std::string& itemUid) {
    ReturnResp r;
    if (!safeUid(itemUid)) { unknownTag(r); return r; }
    JsonObject j;
    std::string body = "{\"item_uid\":\"" + itemUid + "\"}";
    r.transport = call("POST", std::string(kBase) + "/return", &body, j);
    if (r.transport != Transport::Ok) return r;
    fillResult(j, r);
    r.hasFine = !j.isNull("fine");
    r.fine = (int)j.integer("fine");
    return r;
}

EquipmentResp RestApi::equipment(const std::string& itemUid) {
    EquipmentResp r;
    if (!safeUid(itemUid)) { unknownTag(r); return r; }
    JsonObject j;
    r.transport = call("GET", std::string(kBase) + "/equipment/" + itemUid, nullptr, j);
    if (r.transport != Transport::Ok) return r;
    fillResult(j, r);
    r.name = toLcdAscii(j.str("name"));
    r.type = j.str("type");
    r.status = j.str("status");
    r.requiresAgreement = j.boolean("requires_agreement");
    return r;
}

ApiResult RestApi::logout() {
    ApiResult r;
    JsonObject j;
    std::string body;
    r.transport = call("POST", std::string(kBase) + "/logout", &body, j);
    if (r.transport == Transport::Ok) fillResult(j, r);
    return r;
}

Transport RestApi::heartbeat() {
    JsonObject j;
    std::string body;
    Transport t = call("POST", std::string(kBase) + "/heartbeat", &body, j);
    if (t != Transport::Ok) return t;
    return j.boolean("ok") ? Transport::Ok : Transport::ServerError;
}
