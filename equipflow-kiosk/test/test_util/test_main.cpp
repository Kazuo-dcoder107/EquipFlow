#include <unity.h>
#include "Buttons.h"
#include "Text.h"
#include "Tone.h"

void setUp() {}
void tearDown() {}

// ---- PressDetector -------------------------------------------------------------------

static int presses(PressDetector& d, bool level, uint32_t from, uint32_t to) {
    int n = 0;
    for (uint32_t t = from; t <= to; t += 5) if (d.update(level, t)) n++;
    return n;
}

void test_press_fires_once_when_debounced() {
    PressDetector d;
    TEST_ASSERT_EQUAL_INT(1, presses(d, true, 0, 300));
}

void test_holding_does_not_repeat_and_release_fires_nothing() {
    PressDetector d;
    int n = presses(d, true, 0, 5000);                // held for 5 s
    n += presses(d, false, 5005, 5300);               // released
    TEST_ASSERT_EQUAL_INT(1, n);
}

void test_two_separate_presses_give_two_events() {
    PressDetector d;
    int n = presses(d, true, 0, 200);
    n += presses(d, false, 205, 400);
    n += presses(d, true, 405, 600);
    TEST_ASSERT_EQUAL_INT(2, n);
}

void test_contact_bounce_is_ignored() {
    PressDetector d;
    int n = 0;
    bool lv = false;
    for (uint32_t t = 0; t < 20; t += 2) { lv = !lv; if (d.update(lv, t)) n++; }   // chatter < 25 ms
    for (uint32_t t = 20; t < 200; t += 5) if (d.update(false, t)) n++;
    TEST_ASSERT_EQUAL_INT(0, n);
}

void test_each_button_has_its_own_detector() {
    PressDetector yes, no;
    int ny = 0, nn = 0;
    for (uint32_t t = 0; t <= 200; t += 5) { if (yes.update(true, t)) ny++; if (no.update(false, t)) nn++; }
    TEST_ASSERT_EQUAL_INT(1, ny);
    TEST_ASSERT_EQUAL_INT(0, nn);
}

// ---- Text ----------------------------------------------------------------------------

void test_fit_and_right_align() {
    TEST_ASSERT_EQUAL_STRING("abc       ", fit("abc", 10).c_str());
    TEST_ASSERT_EQUAL_STRING("abcde", fit("abcdefgh", 5).c_str());
    TEST_ASSERT_EQUAL_STRING("Scan item   25s", rightAlign("Scan item", "25s", 15).c_str());
    TEST_ASSERT_EQUAL_INT(16, (int)rightAlign("Scan item", "5s", 16).size());
}

void test_first_word() {
    TEST_ASSERT_EQUAL_STRING("Juan", firstWord("Juan Dela Cruz").c_str());
    TEST_ASSERT_EQUAL_STRING("Madonna", firstWord("Madonna").c_str());
}

void test_marquee_short_text_is_static() {
    TEST_ASSERT_EQUAL_STRING("Laptop 1", marqueeWindow("Laptop 1", 99999).c_str());
}

void test_marquee_scrolls_pauses_and_restarts() {
    std::string t = "ABCDEFGHIJKLMNOPQRSTUVWX";             // 24 chars -> maxShift 8
    TEST_ASSERT_EQUAL_STRING("ABCDEFGHIJKLMNOP", marqueeWindow(t, 0).c_str());
    TEST_ASSERT_EQUAL_STRING("ABCDEFGHIJKLMNOP", marqueeWindow(t, 1100).c_str());   // still pausing
    TEST_ASSERT_EQUAL_STRING("BCDEFGHIJKLMNOPQ", marqueeWindow(t, 1200 + 400).c_str());
    TEST_ASSERT_EQUAL_STRING("IJKLMNOPQRSTUVWX", marqueeWindow(t, 1200 + 8 * 400 + 100).c_str());  // end
    uint32_t cycle = 2 * 1200 + 8 * 400;
    TEST_ASSERT_EQUAL_STRING("ABCDEFGHIJKLMNOP", marqueeWindow(t, cycle).c_str());   // restarted
}

void test_format_due_converts_to_local_time() {
    TEST_ASSERT_EQUAL_STRING("Due Nov 12 17:30", formatDue("2026-11-12T09:30:00Z", 8).c_str());
    TEST_ASSERT_EQUAL_STRING("Due Nov 13 04:00", formatDue("2026-11-12T20:00:00+00:00", 8).c_str());
    TEST_ASSERT_EQUAL_STRING("Due Jan 1 00:00", formatDue("2026-12-31T16:00:00.123456Z", 8).c_str());   // year rollover
    TEST_ASSERT_EQUAL_STRING("Due Mar 1 08:00", formatDue("2028-02-29T00:00:00Z", 32).c_str());  // leap-year rollover
    TEST_ASSERT_EQUAL_STRING("", formatDue("garbage", 8).c_str());
}

void test_lcd_ascii_strips_accents_and_replaces_the_rest() {
    TEST_ASSERT_EQUAL_STRING("Pena", toLcdAscii("Pe\xC3\xB1" "a").c_str());              // Peña
    TEST_ASSERT_EQUAL_STRING("Jose Nino", toLcdAscii("Jos\xC3\xA9 Ni\xC3\xB1o").c_str());
    TEST_ASSERT_EQUAL_STRING("It's - ok", toLcdAscii("It\xE2\x80\x99s \xE2\x80\x93 ok").c_str());
    TEST_ASSERT_EQUAL_STRING("A?B", toLcdAscii("A\xE4\xB8\xAD" "B").c_str());           // CJK -> ?
    TEST_ASSERT_EQUAL_STRING("plain", toLcdAscii("plain").c_str());
    TEST_ASSERT_EQUAL_STRING("bad?", toLcdAscii("bad\xC3").c_str());                      // truncated UTF-8
}

// ---- ToneSequencer -------------------------------------------------------------------

void test_tone_sequence_plays_steps_then_stops() {
    ToneSequencer s;
    s.start(Tone::Success, 1000);                        // 1500Hz/100ms, silence/40ms, 2200Hz/160ms
    TEST_ASSERT_EQUAL_INT(1500, s.update(1000));
    TEST_ASSERT_EQUAL_INT(1500, s.update(1099));
    TEST_ASSERT_EQUAL_INT(0,    s.update(1120));
    TEST_ASSERT_EQUAL_INT(2200, s.update(1150));
    TEST_ASSERT_TRUE(s.active());
    TEST_ASSERT_EQUAL_INT(0,    s.update(1300));
    TEST_ASSERT_TRUE(!s.active());
}

void test_tone_none_is_silent() {
    ToneSequencer s;
    s.start(Tone::None, 0);
    TEST_ASSERT_TRUE(!s.active());
    TEST_ASSERT_EQUAL_INT(0, s.update(10));
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_press_fires_once_when_debounced);
    RUN_TEST(test_holding_does_not_repeat_and_release_fires_nothing);
    RUN_TEST(test_two_separate_presses_give_two_events);
    RUN_TEST(test_contact_bounce_is_ignored);
    RUN_TEST(test_each_button_has_its_own_detector);
    RUN_TEST(test_fit_and_right_align);
    RUN_TEST(test_first_word);
    RUN_TEST(test_marquee_short_text_is_static);
    RUN_TEST(test_marquee_scrolls_pauses_and_restarts);
    RUN_TEST(test_format_due_converts_to_local_time);
    RUN_TEST(test_lcd_ascii_strips_accents_and_replaces_the_rest);
    RUN_TEST(test_tone_sequence_plays_steps_then_stops);
    RUN_TEST(test_tone_none_is_silent);
    return UNITY_END();
}
