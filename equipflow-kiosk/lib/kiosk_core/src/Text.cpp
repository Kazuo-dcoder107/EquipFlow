#include "Text.h"
#include <cstdio>

std::string fit(const std::string& s, size_t width) {
    std::string r = s.substr(0, width);
    if (r.size() < width) r.append(width - r.size(), ' ');
    return r;
}

std::string rightAlign(const std::string& left, const std::string& right, size_t width) {
    std::string l = left;
    if (right.size() + 1 >= width) return right.substr(0, width);
    if (l.size() + right.size() + 1 > width) l = l.substr(0, width - right.size() - 1);
    return l + std::string(width - l.size() - right.size(), ' ') + right;
}

std::string firstWord(const std::string& s) {
    size_t p = s.find(' ');
    return p == std::string::npos ? s : s.substr(0, p);
}

std::string marqueeWindow(const std::string& text, uint32_t elapsedMs, size_t width,
                          uint32_t stepMs, uint32_t pauseMs) {
    if (text.size() <= width) return text;
    uint32_t maxShift = (uint32_t)(text.size() - width);
    uint32_t cycle = 2 * pauseMs + maxShift * stepMs;
    uint32_t t = elapsedMs % cycle;
    uint32_t shift = 0;
    if (t >= pauseMs) {
        shift = (t - pauseMs) / stepMs;
        if (shift > maxShift) shift = maxShift;
    }
    return text.substr(shift, width);
}

namespace {
// Howard Hinnant's civil-date algorithms (days since 1970-01-01).
long daysFromCivil(int y, int m, int d) {
    y -= m <= 2;
    long era = (y >= 0 ? y : y - 399) / 400;
    long yoe = y - era * 400;
    long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
    long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + doe - 719468;
}
void civilFromDays(long z, int& y, int& m, int& d) {
    z += 719468;
    long era = (z >= 0 ? z : z - 146096) / 146097;
    long doe = z - era * 146097;
    long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    long mp = (5 * doy + 2) / 153;
    d = (int)(doy - (153 * mp + 2) / 5 + 1);
    m = (int)(mp < 10 ? mp + 3 : mp - 9);
    y = (int)(yoe + era * 400 + (m <= 2));
}
}

std::string formatDue(const std::string& iso, int utcOffsetHours) {
    int Y, M, D, h, mi, s;
    if (std::sscanf(iso.c_str(), "%d-%d-%dT%d:%d:%d", &Y, &M, &D, &h, &mi, &s) != 6) return "";
    if (M < 1 || M > 12) return "";
    long secs = daysFromCivil(Y, M, D) * 86400L + h * 3600L + mi * 60L + s + utcOffsetHours * 3600L;
    long days = secs / 86400, rem = secs % 86400;
    if (rem < 0) { rem += 86400; days -= 1; }
    int y, m, d;
    civilFromDays(days, y, m, d);
    static const char* const kMonth[] = {"Jan","Feb","Mar","Apr","May","Jun",
                                         "Jul","Aug","Sep","Oct","Nov","Dec"};
    char buf[24];
    std::snprintf(buf, sizeof buf, "Due %s %d %02d:%02d", kMonth[m - 1], d,
                  (int)(rem / 3600), (int)((rem % 3600) / 60));
    return buf;
}

std::string toLcdAscii(const std::string& in) {
    // U+00C0..U+00FF without accents (index = codepoint - 0xC0)
    static const char kLatin1[] =
        "AAAAAAACEEEEIIIIDNOOOOOxOUUUUYTs"      // C0-DF
        "aaaaaaaceeeeiiiidnooooo/ouuuuyty";     // E0-FF
    std::string out;
    size_t i = 0;
    while (i < in.size()) {
        unsigned char c = (unsigned char)in[i];
        unsigned long cp = 0;
        size_t extra = 0;
        if (c < 0x80)              { cp = c; }
        else if ((c & 0xE0) == 0xC0) { cp = c & 0x1F; extra = 1; }
        else if ((c & 0xF0) == 0xE0) { cp = c & 0x0F; extra = 2; }
        else if ((c & 0xF8) == 0xF0) { cp = c & 0x07; extra = 3; }
        else { out += '?'; ++i; continue; }
        if (extra && i + extra >= in.size()) { out += '?'; break; }   // truncated sequence
        bool ok = true;
        for (size_t k = 1; k <= extra; ++k) {
            unsigned char cc = (unsigned char)in[i + k];
            if ((cc & 0xC0) != 0x80) { ok = false; break; }
            cp = (cp << 6) | (cc & 0x3F);
        }
        if (!ok) { out += '?'; ++i; continue; }
        i += extra + 1;
        if (cp >= 0x20 && cp < 0x7F) out += (char)cp;
        else if (cp >= 0xC0 && cp <= 0xFF) out += kLatin1[cp - 0xC0];
        else if (cp == 0x2018 || cp == 0x2019) out += '\'';
        else if (cp == 0x201C || cp == 0x201D) out += '"';
        else if (cp == 0x2013 || cp == 0x2014) out += '-';
        else if (cp == 0xA0) out += ' ';
        else out += '?';
    }
    return out;
}
