#include "MiniJson.h"
#include <cstdlib>

namespace {

void appendUtf8(std::string& out, unsigned long cp) {
    if (cp < 0x80) out += (char)cp;
    else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) {
        out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F));
        out += (char)(0x80 | (cp & 0x3F));
    } else {
        out += (char)(0xF0 | (cp >> 18)); out += (char)(0x80 | ((cp >> 12) & 0x3F));
        out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F));
    }
}

class Parser {
public:
    explicit Parser(const std::string& s) : s_(s) {}

    bool object(std::map<std::string, JsonValue>& out) {
        ws();
        if (!eat('{')) return false;
        ws();
        if (peek() == '}') { ++i_; return atEnd(); }
        for (;;) {
            ws();
            std::string key;
            if (!string(key)) return false;
            ws();
            if (!eat(':')) return false;
            ws();
            JsonValue v;
            if (!value(v)) return false;
            out[key] = v;
            ws();
            if (peek() == ',') { ++i_; continue; }
            if (peek() == '}') { ++i_; return atEnd(); }
            return false;
        }
    }

private:
    const std::string& s_;
    size_t i_ = 0;

    char peek() const { return i_ < s_.size() ? s_[i_] : '\0'; }
    bool eat(char c) { if (peek() == c && i_ < s_.size()) { ++i_; return true; } return false; }
    void ws() { while (i_ < s_.size() && (s_[i_] == ' ' || s_[i_] == '\t' || s_[i_] == '\n' || s_[i_] == '\r')) ++i_; }
    bool atEnd() { ws(); return i_ == s_.size(); }

    bool literal(const char* word) {
        size_t n = 0;
        while (word[n]) ++n;
        if (s_.compare(i_, n, word) != 0) return false;
        i_ += n;
        return true;
    }

    bool hex4(unsigned long& v) {
        if (i_ + 4 > s_.size()) return false;
        v = 0;
        for (int k = 0; k < 4; ++k) {
            char c = s_[i_ + k];
            v <<= 4;
            if (c >= '0' && c <= '9') v |= (unsigned long)(c - '0');
            else if (c >= 'a' && c <= 'f') v |= (unsigned long)(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F') v |= (unsigned long)(c - 'A' + 10);
            else return false;
        }
        i_ += 4;
        return true;
    }

    bool string(std::string& out) {
        if (!eat('"')) return false;
        out.clear();
        while (i_ < s_.size()) {
            char c = s_[i_++];
            if (c == '"') return true;
            if ((unsigned char)c < 0x20) return false;            // raw control characters are illegal
            if (c != '\\') { out += c; continue; }
            if (i_ >= s_.size()) return false;
            char e = s_[i_++];
            switch (e) {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'n': out += '\n'; break;
                case 'r': out += '\r'; break;
                case 't': out += '\t'; break;
                case 'u': {
                    unsigned long cp;
                    if (!hex4(cp)) return false;
                    if (cp >= 0xD800 && cp <= 0xDBFF) {              // surrogate pair
                        unsigned long lo;
                        if (s_.compare(i_, 2, "\\u") == 0) {
                            i_ += 2;
                            if (!hex4(lo)) return false;
                            if (lo >= 0xDC00 && lo <= 0xDFFF) cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            else cp = '?';
                        } else cp = '?';
                    } else if (cp >= 0xDC00 && cp <= 0xDFFF) cp = '?';
                    appendUtf8(out, cp);
                    break;
                }
                default: return false;
            }
        }
        return false;                                                // unterminated string
    }

    bool number(JsonValue& v) {
        size_t start = i_;
        if (peek() == '-') ++i_;
        bool digits = false;
        while (i_ < s_.size() && ((s_[i_] >= '0' && s_[i_] <= '9') || s_[i_] == '.' ||
                                  s_[i_] == 'e' || s_[i_] == 'E' || s_[i_] == '+' || s_[i_] == '-')) {
            if (s_[i_] >= '0' && s_[i_] <= '9') digits = true;
            ++i_;
        }
        if (!digits) return false;
        v.type = JsonValue::Number;
        v.text = s_.substr(start, i_ - start);
        return true;
    }

    bool skipNested() {                                              // skips a balanced {...} or [...]
        int depth = 0;
        while (i_ < s_.size()) {
            char c = s_[i_];
            if (c == '"') { std::string ignored; if (!string(ignored)) return false; continue; }
            ++i_;
            if (c == '{' || c == '[') ++depth;
            else if (c == '}' || c == ']') { if (--depth == 0) return true; }
        }
        return false;
    }

    bool value(JsonValue& v) {
        char c = peek();
        if (c == '"') { v.type = JsonValue::String; return string(v.text); }
        if (c == '{' || c == '[') { v.type = JsonValue::Other; return skipNested(); }
        if (c == 't') { v.type = JsonValue::Bool; v.boolean = true;  return literal("true"); }
        if (c == 'f') { v.type = JsonValue::Bool; v.boolean = false; return literal("false"); }
        if (c == 'n') { v.type = JsonValue::Null; return literal("null"); }
        return number(v);
    }
};

}  // namespace

bool JsonObject::parse(const std::string& text, JsonObject& out) {
    out.values_.clear();
    Parser p(text);
    if (!p.object(out.values_)) { out.values_.clear(); return false; }
    return true;
}

bool JsonObject::has(const std::string& key) const { return values_.count(key) > 0; }

bool JsonObject::isNull(const std::string& key) const {
    auto it = values_.find(key);
    return it == values_.end() || it->second.type == JsonValue::Null;
}

std::string JsonObject::str(const std::string& key, const std::string& def) const {
    auto it = values_.find(key);
    return (it != values_.end() && it->second.type == JsonValue::String) ? it->second.text : def;
}

bool JsonObject::boolean(const std::string& key, bool def) const {
    auto it = values_.find(key);
    return (it != values_.end() && it->second.type == JsonValue::Bool) ? it->second.boolean : def;
}

long JsonObject::integer(const std::string& key, long def) const {
    auto it = values_.find(key);
    if (it == values_.end() || it->second.type != JsonValue::Number) return def;
    return std::strtol(it->second.text.c_str(), nullptr, 10);
}
