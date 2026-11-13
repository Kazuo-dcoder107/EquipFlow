#include <unity.h>
#include <string>
#include <vector>
#include "Kiosk.h"
#include "MockApi.h"

void setUp() {}
void tearDown() {}

// ---- test doubles ---------------------------------------------------------------------

struct RecDisplay : IDisplay {
    std::string l1, l2;
    void show(const std::string& a, const std::string& b) override { l1 = a; l2 = b; }
};

struct RecBuzzer : IBuzzer {
    std::vector<Tone> played;
    void play(Tone t) override { played.push_back(t); }
    bool has(Tone t) const { for (Tone p : played) if (p == t) return true; return false; }
    Tone last() const { return played.empty() ? Tone::None : played.back(); }
};

struct Rig {
    MockApi api;
    RecDisplay disp;
    RecBuzzer buz;
    KioskConfig cfg;
    Kiosk kiosk;
    uint32_t t = 1000;

    static KioskConfig defaults() { return KioskConfig(); }
    explicit Rig(KioskConfig c = defaults()) : cfg(c), kiosk(api, disp, buz, c) {
        api.addUser("US", "Juan Dela Cruz");
        api.addUser("UB", "Bob Blocked", "unpaid_fine");
        api.addUser("UD", "Dina Disabled", "", false);
        api.addItem("B1", "Intro to Algorithms and Data Structures", "book");
        api.addItem("B2", "Book Two", "book");
        api.addItem("B3", "Book Three", "book");
        api.addItem("L1", "Laptop 1", "hardware");
        api.addItem("LO", "Laptop Old", "hardware", "overdue", 50);
        api.addItem("BO", "Borrowed Book", "book", "borrowed");
        api.addItem("MI", "Missing Book", "book", "missing");
        kiosk.begin(t);
    }
    void tag(const std::string& uid) { t += 1500; kiosk.onTag(uid, t); }       // 1.5 s apart: no debounce
    void press(Button b)             { t += 300;  kiosk.onButton(b, t); }   // after the 250 ms input guard
    void advance(uint32_t ms)        { t += ms;   kiosk.tick(t); }
    void settle()                    { advance(cfg.resultMs + 50); }
    bool is(Kiosk::State s) const    { return kiosk.state() == s; }
    std::string l1() const { return kiosk.line1(); }
    std::string l2() const { return kiosk.line2(); }
};
#define B_YES  Button::Yes
#define B_NO   Button::No
#define B_NEXT Button::Next
#define STR(x) (x).c_str()

// ---- idle and tag errors ----------------------------------------------------------------

void test_starts_idle_with_prompt() {
    Rig r;
    TEST_ASSERT_TRUE(r.is(Kiosk::State::Idle));
    TEST_ASSERT_EQUAL_STRING("Tap your ID", r.disp.l1.c_str());
    TEST_ASSERT_EQUAL_STRING("Scan item=return", r.disp.l2.c_str());
}

void test_unknown_tag_shows_error_and_error_tone() {
    Rig r;
    r.tag("NOPE");
    TEST_ASSERT_EQUAL_STRING("Unknown tag", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Error);
    TEST_ASSERT_EQUAL_INT(0, r.api.loginCalls);
    r.settle();
    TEST_ASSERT_TRUE(r.is(Kiosk::State::Idle));
}

void test_deactivated_tag_is_an_error() {
    Rig r;
    r.tag("UD");
    TEST_ASSERT_EQUAL_STRING("Tag disabled", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Error);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());
}

void test_same_tag_held_on_reader_is_read_once() {
    Rig r;
    r.kiosk.onTag("US", 5000);
    r.kiosk.onTag("US", 5300);          // still on the reader
    r.kiosk.onTag("US", 5600);
    TEST_ASSERT_EQUAL_INT(1, r.api.scanCalls);
    r.kiosk.onTag("US", 7000);          // removed and tapped again
    TEST_ASSERT_EQUAL_INT(2, r.api.scanCalls);
}

// ---- login -------------------------------------------------------------------------------

void test_user_tag_logs_in() {
    Rig r;
    r.tag("US");
    TEST_ASSERT_TRUE(r.is(Kiosk::State::LoggedIn));
    TEST_ASSERT_TRUE(r.kiosk.loggedIn());
    TEST_ASSERT_EQUAL_STRING("Hi, Juan", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Scan item    30s", STR(r.l2()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Login);
}

void test_countdown_updates_every_second() {
    Rig r;
    r.tag("US");
    r.advance(5000);
    TEST_ASSERT_EQUAL_STRING("Scan item    25s", STR(r.l2()));
}

void test_local_session_timeout_logs_out() {
    Rig r;
    r.tag("US");
    r.advance(31000);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());
    TEST_ASSERT_EQUAL_STRING("Session ended", STR(r.l1()));
    TEST_ASSERT_EQUAL_INT(1, r.api.logoutCalls);
    r.settle();
    TEST_ASSERT_TRUE(r.is(Kiosk::State::Idle));
}

void test_no_button_logs_out() {
    Rig r;
    r.tag("US");
    r.press(B_NO);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());
    TEST_ASSERT_EQUAL_INT(1, r.api.logoutCalls);
}

// ---- borrow ------------------------------------------------------------------------------

void test_item_without_login_asks_for_id() {
    Rig r;
    r.tag("B2");
    TEST_ASSERT_EQUAL_STRING("Tap your ID", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Warning);
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
}

void test_book_borrow_happy_path() {
    Rig r;
    r.tag("US");
    r.tag("B2");
    TEST_ASSERT_TRUE(r.is(Kiosk::State::ConfirmBorrow));
    TEST_ASSERT_EQUAL_STRING("Book Two", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Borrow? YES / NO", STR(r.l2()));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);          // nothing saved before the user says yes

    r.press(B_YES);
    TEST_ASSERT_EQUAL_INT(1, r.api.borrowCalls);
    TEST_ASSERT_EQUAL_STRING("borrowed", STR(r.api.itemStatus("B2")));
    TEST_ASSERT_EQUAL_STRING("Borrowed!", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Due Nov 12 17:30", STR(r.l2()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Success);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());                // auto-logout after borrow
    TEST_ASSERT_EQUAL_INT(1, r.api.logoutCalls);
    r.settle();
    TEST_ASSERT_TRUE(r.is(Kiosk::State::Idle));
}

void test_long_item_name_is_kept_whole_for_scrolling() {
    Rig r;
    r.tag("US"); r.tag("B1");
    TEST_ASSERT_EQUAL_STRING("Intro to Algorithms and Data Structures", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Intro to Algorit", r.disp.l1.c_str());   // 16-char window on the LCD
    r.advance(1200 + 400);
    TEST_ASSERT_EQUAL_STRING("ntro to Algorith", r.disp.l1.c_str());   // scrolled one step
}

void test_hardware_needs_all_terms_pages_then_sends_agreed_true() {
    Rig r;
    r.tag("US"); r.tag("L1");
    r.press(B_YES);                                       // Borrow? yes -> terms page 1
    TEST_ASSERT_TRUE(r.is(Kiosk::State::Terms));
    TEST_ASSERT_EQUAL_STRING("Handle with care", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("NEXT >       1/3", STR(r.l2()));
    r.press(B_YES);                                       // YES before the last page does nothing
    TEST_ASSERT_EQUAL_STRING("Handle with care", STR(r.l1()));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
    r.press(B_NEXT);
    TEST_ASSERT_EQUAL_STRING("Return on time", STR(r.l1()));
    r.press(B_YES);                                       // still not the accept page
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
    r.press(B_NEXT);                                      // accept page
    TEST_ASSERT_EQUAL_STRING("Accept terms?", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("YES=OK  NO=Exit", STR(r.l2()));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);          // still not borrowed
    r.press(B_YES);                                       // accept
    TEST_ASSERT_EQUAL_INT(1, r.api.borrowCalls);
    TEST_ASSERT_TRUE(r.api.lastAgreed);
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Success);
    TEST_ASSERT_EQUAL_STRING("borrowed", STR(r.api.itemStatus("L1")));
}

void test_declining_terms_with_no_borrows_nothing() {
    Rig r;
    r.tag("US"); r.tag("L1");
    r.press(B_YES); r.press(B_NEXT);
    r.press(B_NO);
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
    TEST_ASSERT_EQUAL_STRING("Declined", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("available", STR(r.api.itemStatus("L1")));
    TEST_ASSERT_TRUE(!r.buz.has(Tone::Success));
    r.settle();
    TEST_ASSERT_TRUE(r.is(Kiosk::State::LoggedIn));       // still logged in, can try another item
}

void test_next_on_the_accept_page_wraps_to_the_first_page() {
    Rig r;
    r.tag("US"); r.tag("L1");
    r.press(B_YES); r.press(B_NEXT); r.press(B_NEXT);     // now on the accept page
    r.press(B_NEXT);
    TEST_ASSERT_EQUAL_STRING("Handle with care", STR(r.l1()));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
}

void test_next_does_nothing_on_the_borrow_prompt() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.press(B_NEXT);
    TEST_ASSERT_TRUE(r.is(Kiosk::State::ConfirmBorrow));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
}

void test_press_right_after_a_new_prompt_is_ignored() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.kiosk.onButton(Button::Yes, r.t + 100);             // inside the 250 ms guard (a double-click)
    TEST_ASSERT_TRUE(r.is(Kiosk::State::ConfirmBorrow));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
    r.kiosk.onButton(Button::Yes, r.t + 400);             // a real press
    TEST_ASSERT_EQUAL_INT(1, r.api.borrowCalls);
}

void test_no_answer_to_borrow_prompt_cancels() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.advance(r.cfg.confirmTimeoutMs + 100);
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
    TEST_ASSERT_TRUE(!r.is(Kiosk::State::ConfirmBorrow));
}

void test_no_cancels_borrow_prompt() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.press(B_NO);
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
    TEST_ASSERT_EQUAL_STRING("Cancelled", STR(r.l1()));
}

void test_scanning_another_item_replaces_the_pending_one() {
    Rig r;
    r.tag("US"); r.tag("B2"); r.tag("B3");
    TEST_ASSERT_EQUAL_STRING("Book Three", STR(r.l1()));
    r.press(B_YES);
    TEST_ASSERT_EQUAL_STRING("borrowed", STR(r.api.itemStatus("B3")));
    TEST_ASSERT_EQUAL_STRING("available", STR(r.api.itemStatus("B2")));
}

void test_limit_reached_warns() {
    KioskConfig c; c.autoLogoutAfterBorrow = false;
    Rig r(c);
    r.tag("US");
    r.tag("B1"); r.press(B_YES); r.settle();
    r.tag("B2"); r.press(B_YES); r.settle();
    r.tag("B3"); r.press(B_YES);                          // third book
    TEST_ASSERT_EQUAL_STRING("Limit reached", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Warning);
}

void test_item_not_available_when_server_says_so() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.api.addItem("B2", "Book Two", "book", "borrowed");  // someone took it meanwhile
    r.press(B_YES);
    TEST_ASSERT_EQUAL_STRING("Not available", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Warning);
}

// ---- return ------------------------------------------------------------------------------

void test_return_by_scanning_item_without_login() {
    Rig r;
    r.tag("BO");
    TEST_ASSERT_EQUAL_STRING("Returned", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Thank you", STR(r.l2()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Success);
    TEST_ASSERT_EQUAL_STRING("available", STR(r.api.itemStatus("BO")));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);
}

void test_return_shows_fine() {
    Rig r;
    r.tag("LO");
    TEST_ASSERT_EQUAL_STRING("Returned", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Fine: P50", STR(r.l2()));
}

void test_return_while_logged_in_keeps_the_session() {
    Rig r;
    r.tag("US"); r.tag("BO");
    TEST_ASSERT_EQUAL_STRING("Returned", STR(r.l1()));
    r.settle();
    TEST_ASSERT_TRUE(r.is(Kiosk::State::LoggedIn));      // back to the greeting, still signed in
    TEST_ASSERT_EQUAL_INT(1, r.api.returnCalls);
}

void test_missing_item_that_turns_up_is_reported_found() {
    Rig r;
    r.tag("MI");
    TEST_ASSERT_EQUAL_STRING("Item found", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Success);
}

// ---- blocked users -------------------------------------------------------------------------

void test_blocked_user_sees_message_at_login_and_cannot_borrow() {
    Rig r;
    r.tag("UB");
    TEST_ASSERT_TRUE(r.kiosk.loggedIn());
    TEST_ASSERT_EQUAL_STRING("Unpaid fine", STR(r.l1()));
    TEST_ASSERT_EQUAL_STRING("Pay to borrow", STR(r.l2()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Warning);
    r.tag("B2");
    TEST_ASSERT_EQUAL_STRING("Unpaid fine", STR(r.l1()));
    TEST_ASSERT_TRUE(!r.is(Kiosk::State::ConfirmBorrow));
    TEST_ASSERT_EQUAL_INT(0, r.api.borrowCalls);          // never even asks the server
}

void test_blocked_user_can_still_return() {
    Rig r;
    r.tag("UB");
    r.tag("BO");
    TEST_ASSERT_EQUAL_STRING("Returned", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Success);
}

void test_blocked_is_discovered_at_borrow_if_backend_does_not_announce_it() {
    Rig r;
    r.api.announceBlockedAtLogin = false;                 // today's backend
    r.tag("UB");
    TEST_ASSERT_EQUAL_STRING("Hi, Bob", STR(r.l1()));
    r.tag("B2"); r.press(B_YES);
    TEST_ASSERT_EQUAL_STRING("Unpaid fine", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Warning);
    TEST_ASSERT_TRUE(!r.buz.has(Tone::Success));
}

// ---- failures: the success tone must only follow a confirmed save ---------------------------

void test_session_expired_on_server_sends_user_back_to_login() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.api.expireSession();
    r.press(B_YES);
    TEST_ASSERT_EQUAL_STRING("Session ended", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Error);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());
    r.settle();
    TEST_ASSERT_TRUE(r.is(Kiosk::State::Idle));
}

void test_borrow_timeout_after_server_saved_is_unconfirmed_not_success_and_not_retried() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.api.failNext("borrow", Transport::Timeout, true);   // saved, but the reply was lost
    r.press(B_YES);
    TEST_ASSERT_EQUAL_INT(1, r.api.borrowCalls);          // no automatic retry
    TEST_ASSERT_EQUAL_STRING("Not confirmed", STR(r.l1()));
    TEST_ASSERT_TRUE(!r.buz.has(Tone::Success));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Warning);
}

void test_borrow_timeout_not_saved_says_try_again() {
    Rig r;
    r.tag("US"); r.tag("B2");
    r.api.failNext("borrow", Transport::NetError, false);
    r.press(B_YES);
    TEST_ASSERT_EQUAL_STRING("Not saved", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::NetFail);
    TEST_ASSERT_TRUE(!r.buz.has(Tone::Success));
    TEST_ASSERT_EQUAL_STRING("available", STR(r.api.itemStatus("B2")));
}

void test_network_error_on_scan() {
    Rig r;
    r.api.failNext("scan", Transport::NetError);
    r.tag("US");
    TEST_ASSERT_EQUAL_STRING("No network", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::NetFail);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());
}

void test_bad_api_key() {
    Rig r;
    r.api.failNext("scan", Transport::Unauthorized);
    r.tag("US");
    TEST_ASSERT_EQUAL_STRING("Bad API key", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::Error);
}

void test_return_with_no_answer_is_not_reported_as_returned() {
    Rig r;
    r.api.failNext("return", Transport::Timeout);
    r.tag("BO");
    TEST_ASSERT_EQUAL_STRING("Server timeout", STR(r.l1()));
    TEST_ASSERT_TRUE(!r.buz.has(Tone::Success));
}

// ---- config ----------------------------------------------------------------------------------

void test_scan_refreshes_session_unless_disabled() {
    KioskConfig c; c.scanRefreshesSession = true;
    Rig on(c);
    on.tag("US"); on.advance(20000); on.tag("B2");        // scan at ~21.5 s resets the 30 s clock
    on.advance(15000);
    TEST_ASSERT_TRUE(on.kiosk.loggedIn());

    KioskConfig c0; c0.scanRefreshesSession = false;
    Rig off(c0);
    off.tag("US"); off.advance(20000); off.tag("B2");
    off.advance(15000);
    TEST_ASSERT_TRUE(!off.kiosk.loggedIn());
}

void test_server_error_is_reported_and_never_a_success() {
    Rig r;
    r.api.failNext("scan", Transport::ServerError);
    r.tag("US");
    TEST_ASSERT_EQUAL_STRING("Server error", STR(r.l1()));
    TEST_ASSERT_TRUE(r.buz.last() == Tone::NetFail);
    TEST_ASSERT_TRUE(!r.kiosk.loggedIn());
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_starts_idle_with_prompt);
    RUN_TEST(test_unknown_tag_shows_error_and_error_tone);
    RUN_TEST(test_deactivated_tag_is_an_error);
    RUN_TEST(test_same_tag_held_on_reader_is_read_once);
    RUN_TEST(test_user_tag_logs_in);
    RUN_TEST(test_countdown_updates_every_second);
    RUN_TEST(test_local_session_timeout_logs_out);
    RUN_TEST(test_no_button_logs_out);
    RUN_TEST(test_item_without_login_asks_for_id);
    RUN_TEST(test_book_borrow_happy_path);
    RUN_TEST(test_long_item_name_is_kept_whole_for_scrolling);
    RUN_TEST(test_hardware_needs_all_terms_pages_then_sends_agreed_true);
    RUN_TEST(test_declining_terms_with_no_borrows_nothing);
    RUN_TEST(test_next_on_the_accept_page_wraps_to_the_first_page);
    RUN_TEST(test_next_does_nothing_on_the_borrow_prompt);
    RUN_TEST(test_press_right_after_a_new_prompt_is_ignored);
    RUN_TEST(test_no_answer_to_borrow_prompt_cancels);
    RUN_TEST(test_no_cancels_borrow_prompt);
    RUN_TEST(test_scanning_another_item_replaces_the_pending_one);
    RUN_TEST(test_limit_reached_warns);
    RUN_TEST(test_item_not_available_when_server_says_so);
    RUN_TEST(test_return_by_scanning_item_without_login);
    RUN_TEST(test_return_shows_fine);
    RUN_TEST(test_return_while_logged_in_keeps_the_session);
    RUN_TEST(test_missing_item_that_turns_up_is_reported_found);
    RUN_TEST(test_blocked_user_sees_message_at_login_and_cannot_borrow);
    RUN_TEST(test_blocked_user_can_still_return);
    RUN_TEST(test_blocked_is_discovered_at_borrow_if_backend_does_not_announce_it);
    RUN_TEST(test_session_expired_on_server_sends_user_back_to_login);
    RUN_TEST(test_borrow_timeout_after_server_saved_is_unconfirmed_not_success_and_not_retried);
    RUN_TEST(test_borrow_timeout_not_saved_says_try_again);
    RUN_TEST(test_network_error_on_scan);
    RUN_TEST(test_bad_api_key);
    RUN_TEST(test_return_with_no_answer_is_not_reported_as_returned);
    RUN_TEST(test_scan_refreshes_session_unless_disabled);
    RUN_TEST(test_server_error_is_reported_and_never_a_success);
    return UNITY_END();
}
