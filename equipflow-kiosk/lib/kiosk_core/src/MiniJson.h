#pragma once
#include <map>
#include <string>

// Just enough JSON for the kiosk API: one flat object per response, with string, number,
// boolean and null values. Nested objects/arrays (e.g. FastAPI's {"detail": [...]}) are
// skipped, not parsed. Strictly validates what it reads: anything malformed returns false.
struct JsonValue {
    enum Type { Null, Bool, Number, String, Other };
    Type type = Null;
    std::string text;        // string contents (UTF-8) or the raw number text
    bool boolean = false;
};

class JsonObject {
public:
    static bool parse(const std::string& text, JsonObject& out);

    bool has(const std::string& key) const;
    bool isNull(const std::string& key) const;                    // missing or JSON null
    std::string str(const std::string& key, const std::string& def = "") const;
    bool boolean(const std::string& key, bool def = false) const;
    long integer(const std::string& key, long def = 0) const;

private:
    std::map<std::string, JsonValue> values_;
};
