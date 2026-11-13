#pragma once
#include <cstdint>
#include <string>

std::string fit(const std::string& s, size_t width);                 // truncate / pad right
std::string rightAlign(const std::string& left, const std::string& right, size_t width);
std::string firstWord(const std::string& s);

// The 16-char window of `text` to show `elapsedMs` after it appeared. Short text is
// returned unchanged; long text pauses, scrolls to the end, pauses, then restarts.
std::string marqueeWindow(const std::string& text, uint32_t elapsedMs, size_t width = 16,
                          uint32_t stepMs = 400, uint32_t pauseMs = 1200);

// "2026-11-12T09:30:00Z" + 8h -> "Due Nov 12 17:30" (16 chars). Empty string if unparsable.
std::string formatDue(const std::string& isoUtc, int utcOffsetHours);

// The 1602 (HD44780) shows plain ASCII only. Turns UTF-8 text from the server into ASCII:
// accented Latin letters lose their accent (Peña -> Pena), curly quotes/dashes become plain,
// anything else becomes '?'.
std::string toLcdAscii(const std::string& utf8);
