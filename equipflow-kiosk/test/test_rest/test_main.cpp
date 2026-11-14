#include <unity.h>
#include <map>
#include <string>
#include <vector>
#include "Kiosk.h"
#include "MiniJson.h"
#include "RestApi.h"

void setUp() {}
void tearDown() {}

#define STR(x) (x).c_str()

// ---- scripted fake transport -----------------------------------------------------------------

struct FakeHttp : IHttpTransport {
    struct Call { std::string method, path, body; };
    std::vector<Call> calls;
    std::map<std::string, HttpResponse> script;            // key: "METHOD path"
    HttpResponse fallback;                                 // used when nothing is scripted

    FakeHttp() { fallback.status = 404; fallback.body = "{\"detail\":\"Not Found\"}"; }

    void reply(const std::string& key, int status, const std::string& body) {
        HttpResponse r; r.status = status; r.body = body; script[key] = r;
    }
    void fail(const std::string& key, Transport t) {
        HttpResponse r; r.transport = t; script[key] = r;
    }
    HttpResponse request(const char* method, const std::string& path, const std::string* body) override {
        calls.push_back({method, path, body ? *body : std::string("<none>")});
        auto it = script.find(std::string(method) + " " + path);
        return it == script.end() ? fallback : it->second;
    }
    int count(const std::string& path) const {
        int n = 0; for (const Call& c : calls) if (c.path == path) n++; return n;
    }
};

// Bodies copied from the shapes the FastAPI schemas produce.
static const char* kScanUser  = "{\"ok\":true,\"code\":\"ok\",\"message\":\"ID tag\",\"kind\":\"user\",\"name\":\"Juan Dela Cruz\",\"role\":\"student\",\"category\":null,\"type\":null,\"status\":null,\"loan_days\":null,\"requires_agreement\":null}";
static const char* kScanBook  = "{\"ok\":true,\"code\":\"ok\",\"message\":\"Item tag\",\"kind\":\"item\",\"name\":\"Clean Code\",\"role\":null,\"category\":\"Book\",\"type\":\"book\",\"status\":\"available\",\"loan_days\":7,\"requires_agreement\":false}";
static const char* kScanLap   = "{\"ok\":true,\"code\":\"ok\",\"message\":\"Item tag\",\"kind\":\"item\",\"name\":\"Laptop 1\",\"role\":null,\"category\":\"Laptop\",\"type\":\"hardware\",\"status\":\"available\",\"loan_days\":2,\"requires_agreement\":true}";
static const char* kScanOut   = "{\"ok\":true,\"code\":\"ok\",\"message\":\"Item tag\",\"kind\":\"item\",\"name\":\"Old Book\",\"role\":null,\"category\":\"Book\",\"type\":\"book\",\"status\":\"borrowed\",\"loan_days\":7,\"requires_agreement\":false}";
static const char* kLoginOk   = "{\"ok\":true,\"code\":\"ok\",\"message\":\"Welcome Juan\",\"name\":\"Juan Dela Cruz\",\"role\":\"student\",\"session_seconds\":30,\"borrowing_blocked\":null}";
static const char* kLoginBlk  = "{\"ok\":true,\"code\":\"ok\",\"message\":\"Welcome Juan\",\"name\":\"Juan Dela Cruz\",\"role\":\"student\",\"session_seconds\":30,\"borrowing_blocked\":\"unpaid_fine\"}";
static const char* kBorrowOk  = "{\"ok\":true,\"code\":\"ok\",\"message\":\"Borrowed\",\"due_at\":\"2026-11-12T09:30:00Z\",\"fine\":null}";

// ---- MiniJson ----------------------------------------------------------------------------------

void test_json_reads_flat_object() {
    JsonObject j;
    TEST_ASSERT_TRUE(JsonObject::parse("{\"a\":\"x\",\"n\":42,\"neg\":-7,\"t\":true,\"f\":false,\"z\":null}", j));
    TEST_ASSERT_EQUAL_STRING("x", STR(j.str("a")));
    TEST_ASSERT_EQUAL_INT(42, j.integer("n"));
    TEST_ASSERT_EQUAL_INT(-7, j.integer("neg"));
    TEST_ASSERT_TRUE(j.boolean("t"));
    TEST_ASSERT_TRUE(!j.boolean("f", true));
    TEST_ASSERT_TRUE(j.isNull("z"));
    TEST_ASSERT_TRUE(j.isNull("missing"));
    TEST_ASSERT_TRUE(!j.has("missing"));
    TEST_ASSERT_EQUAL_STRING("dflt", STR(j.str("missing", "dflt")));
}

void test_json_whitespace_and_empty_object() {
    JsonObject j;
    TEST_ASSERT_TRUE(JsonObject::parse("  {\n \"a\" : 1 ,\n \"b\":\"y\"\n}  \n", j));
    TEST_ASSERT_EQUAL_INT(1, j.integer("a"));
    TEST_ASSERT_TRUE(JsonObject::parse("{}", j));
    TEST_ASSERT_TRUE(!j.has("a"));                        // a failed/new parse never keeps old keys
}

void test_json_string_escapes() {
    JsonObject j;
    TEST_ASSERT_TRUE(JsonObject::parse("{\"s\":\"a\\\"b\\\\c\\/d\\n\\t\"}", j));
    TEST_ASSERT_EQUAL_STRING("a\"b\\c/d\n\t", STR(j.str("s")));
    TEST_ASSERT_TRUE(JsonObject::parse("{\"s\":\"Pe\\u00f1a\"}", j));          // \u00f1 -> UTF-8 n-tilde
    TEST_ASSERT_EQUAL_STRING("Pe\xC3\xB1" "a", STR(j.str("s")));
    TEST_ASSERT_TRUE(JsonObject::parse("{\"s\":\"\\ud83d\\ude00\"}", j));      // surrogate pair -> 4-byte UTF-8
    TEST_ASSERT_EQUAL_INT(4, (long)j.str("s").size());
    TEST_ASSERT_TRUE(JsonObject::parse("{\"s\":\"\\ud83d\"}", j));            // lone surrogate -> '?'
    TEST_ASSERT_EQUAL_STRING("?", STR(j.str("s")));
}

void test_json_skips_nested_values() {
    JsonObject j;
    TEST_ASSERT_TRUE(JsonObject::parse("{\"detail\":[{\"loc\":[\"body\",\"x\"],\"msg\":\"a } ] \\\" b\"}],\"ok\":false,\"o\":{\"k\":{\"z\":1}}}", j));
    TEST_ASSERT_TRUE(!j.boolean("ok", true));
    TEST_ASSERT_TRUE(j.has("detail"));
    TEST_ASSERT_EQUAL_STRING("", STR(j.str("detail")));   // nested values are skipped, not read
}

void test_json_rejects_malformed_input() {
    const char* bad[] = {"", "   ", "[1,2]", "{", "{\"a\":}", "{\"a\":1,}", "{\"a\" 1}", "{a:1}",
                         "{\"a\":\"unterminated}", "{\"a\":1} extra", "{\"a\":tru}", "{\"a\":\"\\q\"}",
                         "{\"a\":\"\\u12\"}", "{\"a\":[1,2}", "not json at all", "<html>502 Bad Gateway</html>"};
    for (const char* b : bad) {
        JsonObject j;
        if (JsonObject::parse(b, j)) { std::string m = std::string("accepted bad json: ") + b; TEST_ASSERT_TRUE_MESSAGE(false, m.c_str()); }
    }
}

// ---- RestApi: requests ---------------------------------------------------------------------------

void test_scan_request_and_user_response() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/scan/04A1B2C3", 200, kScanUser);
    ScanResp r = api.scan("04A1B2C3");
    TEST_ASSERT_TRUE(r.transport == Transport::Ok);
    TEST_ASSERT_EQUAL_INT(1, (long)h.calls.size());
    TEST_ASSERT_EQUAL_STRING("GET", STR(h.calls[0].method));
    TEST_ASSERT_EQUAL_STRING("<none>", STR(h.calls[0].body));
    TEST_ASSERT_TRUE(r.ok);
    TEST_ASSERT_EQUAL_STRING("user", STR(r.kind));
    TEST_ASSERT_EQUAL_STRING("Juan Dela Cruz", STR(r.name));
    TEST_ASSERT_EQUAL_STRING("student", STR(r.role));
    TEST_ASSERT_EQUAL_STRING("", STR(r.status));          // null fields stay empty
}

void test_scan_item_response_fields() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/scan/L1", 200, kScanLap);
    ScanResp r = api.scan("L1");
    TEST_ASSERT_EQUAL_STRING("item", STR(r.kind));
    TEST_ASSERT_EQUAL_STRING("Laptop 1", STR(r.name));
    TEST_ASSERT_EQUAL_STRING("hardware", STR(r.type));
    TEST_ASSERT_EQUAL_STRING("available", STR(r.status));
    TEST_ASSERT_EQUAL_INT(2, r.loanDays);
    TEST_ASSERT_TRUE(r.requiresAgreement);
}

void test_scan_unknown_tag() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/scan/ZZ", 200, "{\"ok\":false,\"code\":\"unknown_tag\",\"message\":\"Unknown tag\",\"kind\":null,\"name\":null}");
    ScanResp r = api.scan("ZZ");
    TEST_ASSERT_TRUE(r.transport == Transport::Ok);       // the server answered; the tag is just unknown
    TEST_ASSERT_TRUE(!r.ok);
    TEST_ASSERT_EQUAL_STRING("unknown_tag", STR(r.code));
}

void test_login_request_body_and_response() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/login", 200, kLoginOk);
    LoginResp r = api.login("04A1B2C3");
    TEST_ASSERT_EQUAL_STRING("POST", STR(h.calls[0].method));
    TEST_ASSERT_EQUAL_STRING("{\"user_uid\":\"04A1B2C3\"}", STR(h.calls[0].body));
    TEST_ASSERT_TRUE(r.ok);
    TEST_ASSERT_EQUAL_STRING("Juan Dela Cruz", STR(r.name));
    TEST_ASSERT_EQUAL_INT(30, r.sessionSeconds);
    TEST_ASSERT_EQUAL_STRING("", STR(r.blocked));
}

void test_login_blocked_and_old_backend_without_the_field() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/login", 200, kLoginBlk);
    TEST_ASSERT_EQUAL_STRING("unpaid_fine", STR(api.login("U1").blocked));
    h.reply("POST /api/kiosk/login", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Welcome\",\"name\":\"A B\",\"role\":\"student\",\"session_seconds\":30}");
    LoginResp r = api.login("U1");
    TEST_ASSERT_TRUE(r.ok);
    TEST_ASSERT_EQUAL_STRING("", STR(r.blocked));         // field absent on an unpatched backend: fine
}

void test_login_failure_codes_pass_through() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/login", 200, "{\"ok\":false,\"code\":\"wrong_tag_type\",\"message\":\"Item tag. Tap your ID\"}");
    LoginResp r = api.login("B1");
    TEST_ASSERT_TRUE(!r.ok);
    TEST_ASSERT_EQUAL_STRING("wrong_tag_type", STR(r.code));
}

void test_borrow_bodies_and_due_date() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/borrow", 200, kBorrowOk);
    BorrowResp a = api.borrow("B1", false, "");
    BorrowResp b = api.borrow("L1", true, "");
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"B1\",\"agreed\":false}", STR(h.calls[0].body));
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"L1\",\"agreed\":true}", STR(h.calls[1].body));
    TEST_ASSERT_TRUE(a.ok && b.ok);
    TEST_ASSERT_EQUAL_STRING("2026-11-12T09:30:00Z", STR(a.dueAt));
}

void test_return_with_and_without_fine() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/return", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Returned. Fine P75\",\"due_at\":null,\"fine\":75}");
    ReturnResp a = api.returnItem("L1");
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"L1\"}", STR(h.calls[0].body));
    TEST_ASSERT_TRUE(a.ok && a.hasFine);
    TEST_ASSERT_EQUAL_INT(75, a.fine);

    h.reply("POST /api/kiosk/return", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Returned\",\"due_at\":null,\"fine\":0}");
    ReturnResp b = api.returnItem("L1");
    TEST_ASSERT_TRUE(b.hasFine);
    TEST_ASSERT_EQUAL_INT(0, b.fine);

    h.reply("POST /api/kiosk/return", 200, "{\"ok\":true,\"code\":\"found\",\"message\":\"Item found\",\"due_at\":null,\"fine\":null}");
    ReturnResp c = api.returnItem("L1");
    TEST_ASSERT_TRUE(c.ok && !c.hasFine);
    TEST_ASSERT_EQUAL_STRING("found", STR(c.code));
}

void test_equipment_lookup() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/equipment/B1", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Found\",\"name\":\"Book 1\",\"category\":\"Book\",\"type\":\"book\",\"status\":\"borrowed\",\"loan_days\":7,\"requires_agreement\":false}");
    EquipmentResp r = api.equipment("B1");
    TEST_ASSERT_TRUE(r.ok);
    TEST_ASSERT_EQUAL_STRING("borrowed", STR(r.status));
    TEST_ASSERT_EQUAL_STRING("Book 1", STR(r.name));
}

void test_logout_and_heartbeat() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/logout", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Logged out\",\"due_at\":null,\"fine\":null}");
    h.reply("POST /api/kiosk/heartbeat", 200, "{\"ok\":true,\"server_time\":\"2026-11-10T12:00:00+00:00\"}");
    ApiResult r = api.logout();
    TEST_ASSERT_TRUE(r.ok && r.transport == Transport::Ok);
    TEST_ASSERT_EQUAL_STRING("", STR(h.calls[0].body));    // POST with an empty (not missing) body
    TEST_ASSERT_TRUE(api.heartbeat() == Transport::Ok);
}

// ---- JSON arrays -------------------------------------------------------------------------------

void test_json_reads_an_array_of_flat_objects() {
    JsonObject j;
    TEST_ASSERT_TRUE(JsonObject::parse("{\"users\":[{\"sr_code\":\"S1\",\"full_name\":\"A B\"},{\"sr_code\":\"S2\",\"n\":5,\"x\":[1,{\"k\":2}]}],\"after\":1}", j));
    std::vector<JsonObject> rows;
    TEST_ASSERT_TRUE(j.objects("users", rows));
    TEST_ASSERT_EQUAL_INT(2, (long)rows.size());
    TEST_ASSERT_EQUAL_STRING("S1", STR(rows[0].str("sr_code")));
    TEST_ASSERT_EQUAL_STRING("A B", STR(rows[0].str("full_name")));
    TEST_ASSERT_EQUAL_INT(5, rows[1].integer("n"));
    TEST_ASSERT_EQUAL_INT(1, j.integer("after"));                  // fields after the array still read
}

void test_json_array_edge_cases() {
    JsonObject j; std::vector<JsonObject> rows;
    TEST_ASSERT_TRUE(JsonObject::parse("{\"users\":[]}", j));
    TEST_ASSERT_TRUE(j.objects("users", rows) && rows.empty());
    TEST_ASSERT_TRUE(JsonObject::parse("{\"users\":\"text\"}", j));
    TEST_ASSERT_TRUE(!j.objects("users", rows));                   // not an array
    TEST_ASSERT_TRUE(JsonObject::parse("{\"users\":[1,2]}", j));
    TEST_ASSERT_TRUE(!j.objects("users", rows));                   // elements are not objects
    TEST_ASSERT_TRUE(JsonObject::parse("{\"users\":[{\"a\":1},]}", j));
    TEST_ASSERT_TRUE(!j.objects("users", rows));                   // trailing comma inside the array
    TEST_ASSERT_TRUE(!j.objects("missing", rows));
    TEST_ASSERT_TRUE(JsonObject::parse("{\"o\":{\"a\":1}}", j));
    TEST_ASSERT_TRUE(!j.objects("o", rows));                       // an object is not an array
}

// ---- terms / pending users / enroll -------------------------------------------------------------

void test_terms_response_keeps_line_breaks() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/terms", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Terms\",\"version\":\"ab12cd34\",\"text\":\"Handle with care.\\nPay for \\u201cdamage\\u201d.\"}");
    TermsResp t = api.terms();
    TEST_ASSERT_TRUE(t.transport == Transport::Ok && t.ok);
    TEST_ASSERT_EQUAL_STRING("ab12cd34", STR(t.version));
    TEST_ASSERT_EQUAL_STRING("Handle with care.\nPay for \"damage\".", STR(t.text));   // newline kept, quotes made plain
    TEST_ASSERT_EQUAL_STRING("GET", STR(h.calls[0].method));
}

void test_terms_failures() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/terms", 401, "{}");
    TEST_ASSERT_TRUE(api.terms().transport == Transport::Unauthorized);
    h.reply("GET /api/kiosk/terms", 500, "x");
    TEST_ASSERT_TRUE(api.terms().transport == Transport::ServerError);
    h.fail("GET /api/kiosk/terms", Transport::Timeout);
    TEST_ASSERT_TRUE(api.terms().transport == Transport::Timeout);
}

void test_borrow_sends_the_terms_version_only_when_there_is_a_safe_one() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/borrow", 200, kBorrowOk);
    api.borrow("L1", true, "ab12cd34");
    api.borrow("B1", false, "");
    api.borrow("L1", true, "bad\"}version");
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"L1\",\"agreed\":true,\"terms_version\":\"ab12cd34\"}", STR(h.calls[0].body));
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"B1\",\"agreed\":false}", STR(h.calls[1].body));
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"L1\",\"agreed\":true}", STR(h.calls[2].body));   // unsafe text never reaches the JSON
}

void test_pending_users_request_and_response() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/pending-users?limit=50", 200, "{\"users\":[{\"sr_code\":\"21-00001\",\"full_name\":\"Jos\\u00e9 Pe\\u00f1a\"},{\"sr_code\":\"21-00002\",\"full_name\":\"Ann Lee\"},{\"full_name\":\"No Code\"}]}");
    PendingResp r = api.pendingUsers(50);
    TEST_ASSERT_TRUE(r.transport == Transport::Ok && r.ok);
    TEST_ASSERT_EQUAL_INT(2, (long)r.users.size());                 // the entry with no sr_code is skipped
    TEST_ASSERT_EQUAL_STRING("21-00001", STR(r.users[0].srCode));
    TEST_ASSERT_EQUAL_STRING("Jose Pena", STR(r.users[0].fullName));
    TEST_ASSERT_EQUAL_STRING("Ann Lee", STR(r.users[1].fullName));
}

void test_pending_users_limit_is_clamped_and_empty_list_is_ok() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/pending-users?limit=1", 200, "{\"users\":[]}");
    h.reply("GET /api/kiosk/pending-users?limit=200", 200, "{\"users\":[]}");
    PendingResp a = api.pendingUsers(0);
    PendingResp b = api.pendingUsers(9999);
    TEST_ASSERT_TRUE(a.ok && a.users.empty() && b.ok);
    TEST_ASSERT_EQUAL_STRING("/api/kiosk/pending-users?limit=1", STR(h.calls[0].path));
    TEST_ASSERT_EQUAL_STRING("/api/kiosk/pending-users?limit=200", STR(h.calls[1].path));
}

void test_pending_users_bad_shapes_and_failures() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/pending-users?limit=50", 200, "{\"detail\":\"x\"}");
    TEST_ASSERT_TRUE(api.pendingUsers(50).transport == Transport::ServerError);     // no "users" field
    h.reply("GET /api/kiosk/pending-users?limit=50", 200, "{\"users\":[1,2]}");
    TEST_ASSERT_TRUE(api.pendingUsers(50).transport == Transport::ServerError);
    h.reply("GET /api/kiosk/pending-users?limit=50", 401, "{}");
    TEST_ASSERT_TRUE(api.pendingUsers(50).transport == Transport::Unauthorized);
    h.fail("GET /api/kiosk/pending-users?limit=50", Transport::NetError);
    TEST_ASSERT_TRUE(api.pendingUsers(50).transport == Transport::NetError);
}

void test_enroll_request_and_result_codes() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/enroll", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Registered\",\"due_at\":null,\"fine\":null}");
    ApiResult a = api.enroll("21-00001", "04A1B2C3");
    TEST_ASSERT_TRUE(a.transport == Transport::Ok && a.ok);
    TEST_ASSERT_EQUAL_STRING("{\"sr_code\":\"21-00001\",\"user_uid\":\"04A1B2C3\"}", STR(h.calls[0].body));
    h.reply("POST /api/kiosk/enroll", 200, "{\"ok\":false,\"code\":\"tag_taken\",\"message\":\"Tag already used\",\"due_at\":null,\"fine\":null}");
    ApiResult b = api.enroll("21-00001", "04A1B2C3");
    TEST_ASSERT_TRUE(!b.ok);
    TEST_ASSERT_EQUAL_STRING("tag_taken", STR(b.code));
}

void test_enroll_with_unsafe_text_never_reaches_the_network() {
    FakeHttp h; RestApi api(h);
    TEST_ASSERT_TRUE(!api.enroll("21-00001\"}", "04A1").ok);
    TEST_ASSERT_TRUE(!api.enroll("21-00001", "04 A1").ok);
    TEST_ASSERT_TRUE(!api.enroll("", "04A1").ok);
    TEST_ASSERT_EQUAL_INT(0, (long)h.calls.size());
}

// ---- RestApi: failure mapping -------------------------------------------------------------------

void test_bad_key_maps_to_unauthorized() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/scan/U1", 401, "{\"detail\":\"Invalid kiosk API key\"}");
    TEST_ASSERT_TRUE(api.scan("U1").transport == Transport::Unauthorized);
    h.reply("POST /api/kiosk/login", 403, "{}");
    TEST_ASSERT_TRUE(api.login("U1").transport == Transport::Unauthorized);
}

void test_server_errors_map_to_server_error() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/scan/U1", 500, "Internal Server Error");
    TEST_ASSERT_TRUE(api.scan("U1").transport == Transport::ServerError);
    h.reply("POST /api/kiosk/login", 422, "{\"detail\":[{\"loc\":[\"body\"],\"msg\":\"bad\"}]}");
    TEST_ASSERT_TRUE(api.login("U1").transport == Transport::ServerError);
    h.reply("POST /api/kiosk/borrow", 502, "<html>Bad Gateway</html>");
    TEST_ASSERT_TRUE(api.borrow("B1", false, "").transport == Transport::ServerError);
}

void test_unreadable_200_body_is_a_server_error_not_a_result() {
    FakeHttp h; RestApi api(h);
    h.reply("POST /api/kiosk/borrow", 200, "<html>captive portal</html>");
    BorrowResp r = api.borrow("B1", false, "");
    TEST_ASSERT_TRUE(r.transport == Transport::ServerError);
    TEST_ASSERT_TRUE(!r.ok);
    h.reply("POST /api/kiosk/borrow", 200, "");
    TEST_ASSERT_TRUE(api.borrow("B1", false, "").transport == Transport::ServerError);
}

void test_transport_failures_pass_through() {
    FakeHttp h; RestApi api(h);
    h.fail("GET /api/kiosk/scan/U1", Transport::Timeout);
    h.fail("POST /api/kiosk/login", Transport::NetError);
    TEST_ASSERT_TRUE(api.scan("U1").transport == Transport::Timeout);
    TEST_ASSERT_TRUE(api.login("U1").transport == Transport::NetError);
    TEST_ASSERT_TRUE(api.logout().transport != Transport::Ok);          // unscripted: 404 -> ServerError
}

void test_unsafe_uids_never_reach_the_network() {
    FakeHttp h; RestApi api(h);
    const char* bad[] = {"", "../admin", "A B", "U1\"}", "U1?x=1", "U1/x", "a%2e", "x\ny"};
    for (const char* b : bad) {
        ScanResp r = api.scan(b);
        TEST_ASSERT_TRUE(!r.ok);
        TEST_ASSERT_EQUAL_STRING("unknown_tag", STR(r.code));
        TEST_ASSERT_TRUE(r.transport == Transport::Ok);
        TEST_ASSERT_TRUE(!api.login(b).ok);
        TEST_ASSERT_TRUE(!api.borrow(b, true, "").ok);
        TEST_ASSERT_TRUE(!api.returnItem(b).ok);
        TEST_ASSERT_TRUE(!api.equipment(b).ok);
    }
    TEST_ASSERT_EQUAL_INT(0, (long)h.calls.size());
}

void test_server_text_is_made_lcd_safe() {
    FakeHttp h; RestApi api(h);
    h.reply("GET /api/kiosk/scan/U1", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"ID tag\",\"kind\":\"user\",\"name\":\"Jos\xC3\xA9 Pe\xC3\xB1" "a\"}");
    TEST_ASSERT_EQUAL_STRING("Jose Pena", STR(api.scan("U1").name));
    h.reply("POST /api/kiosk/login", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Welcome\",\"name\":\"Mu\\u00f1oz Ni\\u00f1o\",\"session_seconds\":30}");
    TEST_ASSERT_EQUAL_STRING("Munoz Nino", STR(api.login("U1").name));
}

// ---- end to end: the real Kiosk state machine over RestApi + scripted server ----------------------

struct RecDisplay : IDisplay { std::string l1, l2; void show(const std::string& a, const std::string& b) override { l1 = a; l2 = b; } };
struct RecBuzzer : IBuzzer {
    std::vector<Tone> played; void play(Tone t) override { played.push_back(t); }
    bool has(Tone t) const { for (Tone p : played) if (p == t) return true; return false; }
    Tone last() const { return played.empty() ? Tone::None : played.back(); }
};
struct E2E {
    FakeHttp http; RestApi api; RecDisplay disp; RecBuzzer buz; Kiosk kiosk; uint32_t t = 1000;
    E2E() : api(http), kiosk(api, disp, buz) { kiosk.begin(t); }
    void tag(const std::string& u) { t += 1500; kiosk.onTag(u, t); }
    void press(Button b) { t += 300; kiosk.onButton(b, t); }
};

void test_e2e_book_borrow_over_http() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginOk);
    x.http.reply("GET /api/kiosk/scan/B1", 200, kScanBook);
    x.http.reply("POST /api/kiosk/borrow", 200, kBorrowOk);
    x.http.reply("POST /api/kiosk/logout", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Logged out\"}");
    x.tag("US");
    TEST_ASSERT_EQUAL_STRING("Hi, Juan", STR(x.kiosk.line1()));
    x.tag("B1");
    TEST_ASSERT_EQUAL_STRING("Clean Code", STR(x.kiosk.line1()));
    TEST_ASSERT_EQUAL_INT(0, x.http.count("/api/kiosk/borrow"));        // nothing saved before YES
    x.press(Button::Yes);
    TEST_ASSERT_EQUAL_STRING("Borrowed!", STR(x.kiosk.line1()));
    TEST_ASSERT_EQUAL_STRING("Due Nov 12 17:30", STR(x.kiosk.line2()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Success);
    TEST_ASSERT_EQUAL_INT(1, x.http.count("/api/kiosk/logout"));
}

void test_e2e_hardware_shows_the_server_terms_and_sends_the_version_the_user_saw() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginOk);
    x.http.reply("GET /api/kiosk/scan/L1", 200, kScanLap);
    x.http.reply("GET /api/kiosk/terms", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Terms\",\"version\":\"ab12cd34\",\"text\":\"Be careful.\\nReturn it.\"}");
    x.http.reply("POST /api/kiosk/borrow", 200, kBorrowOk);
    x.tag("US"); x.tag("L1");
    x.press(Button::Yes);                                  // fetches the terms on demand (none cached yet)
    TEST_ASSERT_EQUAL_INT(1, x.http.count("/api/kiosk/terms"));
    TEST_ASSERT_EQUAL_STRING("Be careful.", STR(x.kiosk.line1()));       // the server's wording, on the LCD
    TEST_ASSERT_EQUAL_STRING("Return it.     >", STR(x.kiosk.line2()));
    TEST_ASSERT_EQUAL_INT(0, x.http.count("/api/kiosk/borrow"));
    x.press(Button::Next);
    TEST_ASSERT_EQUAL_STRING("Accept terms?", STR(x.kiosk.line1()));
    TEST_ASSERT_EQUAL_INT(0, x.http.count("/api/kiosk/borrow"));
    x.press(Button::Yes);
    std::string sent;
    for (const FakeHttp::Call& c : x.http.calls) if (c.path == "/api/kiosk/borrow") sent = c.body;
    TEST_ASSERT_EQUAL_STRING("{\"item_uid\":\"L1\",\"agreed\":true,\"terms_version\":\"ab12cd34\"}", STR(sent));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Success);
}

void test_e2e_terms_changed_over_http_is_refused_and_not_a_success() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginOk);
    x.http.reply("GET /api/kiosk/scan/L1", 200, kScanLap);
    x.http.reply("GET /api/kiosk/terms", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Terms\",\"version\":\"old00000\",\"text\":\"Old words\"}");
    x.http.reply("POST /api/kiosk/borrow", 200, "{\"ok\":false,\"code\":\"terms_changed\",\"message\":\"Terms updated. Try again\",\"due_at\":null,\"fine\":null}");
    x.tag("US"); x.tag("L1"); x.press(Button::Yes); x.press(Button::Next); x.press(Button::Yes);
    TEST_ASSERT_EQUAL_STRING("Terms updated", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Warning);
    TEST_ASSERT_TRUE(!x.buz.has(Tone::Success));
}

void test_e2e_enrolling_a_person_over_http() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/UF", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"ID tag\",\"kind\":\"user\",\"name\":\"Stan Staff\",\"role\":\"staff\"}");
    x.http.reply("POST /api/kiosk/login", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Welcome Stan\",\"name\":\"Stan Staff\",\"role\":\"staff\",\"session_seconds\":30,\"borrowing_blocked\":null}");
    x.http.reply("GET /api/kiosk/pending-users?limit=50", 200, "{\"users\":[{\"sr_code\":\"21-00001\",\"full_name\":\"Mar\\u00eda Cruz\"}]}");
    x.http.reply("POST /api/kiosk/enroll", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Registered\",\"due_at\":null,\"fine\":null}");
    x.http.reply("POST /api/kiosk/logout", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Logged out\"}");
    x.tag("UF");
    x.press(Button::Next);
    TEST_ASSERT_EQUAL_STRING("Maria Cruz", STR(x.kiosk.line1()));        // accent made LCD-safe
    TEST_ASSERT_EQUAL_STRING("21-00001     1/1", STR(x.kiosk.line2()));
    x.press(Button::Yes);
    x.tag("04A1B2C3");
    std::string sent;
    for (const FakeHttp::Call& c : x.http.calls) if (c.path == "/api/kiosk/enroll") sent = c.body;
    TEST_ASSERT_EQUAL_STRING("{\"sr_code\":\"21-00001\",\"user_uid\":\"04A1B2C3\"}", STR(sent));
    TEST_ASSERT_EQUAL_STRING("Enrolled!", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Success);
}

void test_e2e_an_unreadable_pending_list_is_a_server_error() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/UF", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"ID tag\",\"kind\":\"user\",\"name\":\"Stan Staff\",\"role\":\"staff\"}");
    x.http.reply("POST /api/kiosk/login", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Welcome\",\"name\":\"Stan Staff\",\"role\":\"staff\",\"session_seconds\":30}");
    x.http.reply("GET /api/kiosk/pending-users?limit=50", 200, "{\"users\":\"oops\"}");
    x.tag("UF"); x.press(Button::Next);
    TEST_ASSERT_EQUAL_STRING("Server error", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(!x.kiosk.enrolling());
}

void test_e2e_blocked_user_is_told_at_login_and_cannot_borrow() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginBlk);
    x.http.reply("GET /api/kiosk/scan/B1", 200, kScanBook);
    x.tag("US");
    TEST_ASSERT_EQUAL_STRING("Unpaid fine", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Warning);
    x.tag("B1");
    TEST_ASSERT_EQUAL_STRING("Unpaid fine", STR(x.kiosk.line1()));
    TEST_ASSERT_EQUAL_INT(0, x.http.count("/api/kiosk/borrow"));
}

void test_e2e_return_shows_the_fine() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/OB", 200, kScanOut);
    x.http.reply("POST /api/kiosk/return", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Returned. Fine P75\",\"due_at\":null,\"fine\":75}");
    x.tag("OB");
    TEST_ASSERT_EQUAL_STRING("Returned", STR(x.kiosk.line1()));
    TEST_ASSERT_EQUAL_STRING("Fine: P75", STR(x.kiosk.line2()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Success);
}

void test_e2e_borrow_500_is_checked_not_retried_and_never_success() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginOk);
    x.http.reply("GET /api/kiosk/scan/B1", 200, kScanBook);
    x.http.reply("POST /api/kiosk/borrow", 500, "oops");
    x.http.reply("GET /api/kiosk/equipment/B1", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Found\",\"name\":\"Clean Code\",\"type\":\"book\",\"status\":\"borrowed\"}");
    x.tag("US"); x.tag("B1"); x.press(Button::Yes);
    TEST_ASSERT_EQUAL_INT(1, x.http.count("/api/kiosk/borrow"));        // no automatic retry
    TEST_ASSERT_EQUAL_STRING("Not confirmed", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(!x.buz.has(Tone::Success));
}

void test_e2e_borrow_timeout_not_saved_says_try_again() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginOk);
    x.http.reply("GET /api/kiosk/scan/B1", 200, kScanBook);
    x.http.fail("POST /api/kiosk/borrow", Transport::Timeout);
    x.http.reply("GET /api/kiosk/equipment/B1", 200, "{\"ok\":true,\"code\":\"ok\",\"message\":\"Found\",\"name\":\"Clean Code\",\"type\":\"book\",\"status\":\"available\"}");
    x.tag("US"); x.tag("B1"); x.press(Button::Yes);
    TEST_ASSERT_EQUAL_STRING("Not saved", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::NetFail);
}

void test_e2e_wrong_api_key_is_shown() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 401, "{\"detail\":\"Invalid kiosk API key\"}");
    x.tag("US");
    TEST_ASSERT_EQUAL_STRING("Bad API key", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::Error);
}

void test_e2e_wifi_down_is_shown_quickly() {
    E2E x;
    x.http.fail("GET /api/kiosk/scan/US", Transport::NetError);
    x.tag("US");
    TEST_ASSERT_EQUAL_STRING("No network", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(x.buz.last() == Tone::NetFail);
    TEST_ASSERT_TRUE(!x.kiosk.loggedIn());
}

void test_e2e_session_expired_on_server() {
    E2E x;
    x.http.reply("GET /api/kiosk/scan/US", 200, kScanUser);
    x.http.reply("POST /api/kiosk/login", 200, kLoginOk);
    x.http.reply("GET /api/kiosk/scan/B1", 200, kScanBook);
    x.http.reply("POST /api/kiosk/borrow", 200, "{\"ok\":false,\"code\":\"no_session\",\"message\":\"Tap your ID first\",\"due_at\":null,\"fine\":null}");
    x.tag("US"); x.tag("B1"); x.press(Button::Yes);
    TEST_ASSERT_EQUAL_STRING("Session ended", STR(x.kiosk.line1()));
    TEST_ASSERT_TRUE(!x.kiosk.loggedIn());
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_json_reads_flat_object);
    RUN_TEST(test_json_whitespace_and_empty_object);
    RUN_TEST(test_json_string_escapes);
    RUN_TEST(test_json_skips_nested_values);
    RUN_TEST(test_json_rejects_malformed_input);
    RUN_TEST(test_scan_request_and_user_response);
    RUN_TEST(test_scan_item_response_fields);
    RUN_TEST(test_scan_unknown_tag);
    RUN_TEST(test_login_request_body_and_response);
    RUN_TEST(test_login_blocked_and_old_backend_without_the_field);
    RUN_TEST(test_login_failure_codes_pass_through);
    RUN_TEST(test_borrow_bodies_and_due_date);
    RUN_TEST(test_return_with_and_without_fine);
    RUN_TEST(test_equipment_lookup);
    RUN_TEST(test_logout_and_heartbeat);
    RUN_TEST(test_json_reads_an_array_of_flat_objects);
    RUN_TEST(test_json_array_edge_cases);
    RUN_TEST(test_terms_response_keeps_line_breaks);
    RUN_TEST(test_terms_failures);
    RUN_TEST(test_borrow_sends_the_terms_version_only_when_there_is_a_safe_one);
    RUN_TEST(test_pending_users_request_and_response);
    RUN_TEST(test_pending_users_limit_is_clamped_and_empty_list_is_ok);
    RUN_TEST(test_pending_users_bad_shapes_and_failures);
    RUN_TEST(test_enroll_request_and_result_codes);
    RUN_TEST(test_enroll_with_unsafe_text_never_reaches_the_network);
    RUN_TEST(test_bad_key_maps_to_unauthorized);
    RUN_TEST(test_server_errors_map_to_server_error);
    RUN_TEST(test_unreadable_200_body_is_a_server_error_not_a_result);
    RUN_TEST(test_transport_failures_pass_through);
    RUN_TEST(test_unsafe_uids_never_reach_the_network);
    RUN_TEST(test_server_text_is_made_lcd_safe);
    RUN_TEST(test_e2e_book_borrow_over_http);
    RUN_TEST(test_e2e_hardware_shows_the_server_terms_and_sends_the_version_the_user_saw);
    RUN_TEST(test_e2e_terms_changed_over_http_is_refused_and_not_a_success);
    RUN_TEST(test_e2e_enrolling_a_person_over_http);
    RUN_TEST(test_e2e_an_unreadable_pending_list_is_a_server_error);
    RUN_TEST(test_e2e_blocked_user_is_told_at_login_and_cannot_borrow);
    RUN_TEST(test_e2e_return_shows_the_fine);
    RUN_TEST(test_e2e_borrow_500_is_checked_not_retried_and_never_success);
    RUN_TEST(test_e2e_borrow_timeout_not_saved_says_try_again);
    RUN_TEST(test_e2e_wrong_api_key_is_shown);
    RUN_TEST(test_e2e_wifi_down_is_shown_quickly);
    RUN_TEST(test_e2e_session_expired_on_server);
    return UNITY_END();
}
