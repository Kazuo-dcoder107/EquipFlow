#pragma once
#include <map>
#include <string>
#include <vector>

// Just enough JSON for the kiosk API: one object per response with string, number, boolean and
// null values. A nested value is skipped, except that a field holding an ARRAY OF FLAT OBJECTS
// (e.g. {"users":[{"sr_code":"..",...}]}) can be read with objects(). Strictly validates what it
// reads: anything malformed returns false.
struct JsonValue {
    enum Type { Null, Bool, Number, String, Other };
    Type type = Null;
    std::string text;        // string contents (UTF-8), the raw number text, or the raw text of a nested value
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

    // Reads field `key` as an array of flat objects. False if it is missing, not an array,
    // or an element is not a flat object.
    bool objects(const std::string& key, std::vector<JsonObject>& out) const;

private:
    std::map<std::string, JsonValue> values_;
};
