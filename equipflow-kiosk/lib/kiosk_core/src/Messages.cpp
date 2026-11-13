#include "Messages.h"

namespace {
const CodeMessage kTable[] = {
    // tag / account problems -> error tone
    {"unknown_tag",        "Unknown tag",    "Not registered",  Tone::Error},
    {"unknown_item",       "Unknown tag",    "Not registered",  Tone::Error},
    {"wrong_tag_type",     "Wrong tag type", "Use correct tag", Tone::Error},
    {"tag_deactivated",    "Tag disabled",   "Ask the admin",   Tone::Error},
    {"not_approved",       "Awaiting",       "approval",        Tone::Error},
    {"user_not_active",    "Account",        "inactive",        Tone::Error},
    {"unknown_user",       "User not found", "",                Tone::Error},
    {"no_session",         "Session ended",  "Tap ID again",    Tone::Error},
    // rules the user can fix -> warning tone
    {"unpaid_fine",        "Unpaid fine",    "Pay to borrow",   Tone::Warning},
    {"has_overdue",        "Overdue item",   "Return it first", Tone::Warning},
    {"limit_reached",      "Limit reached",  "Return an item",  Tone::Warning},
    {"item_unavailable",   "Not available",  "",                Tone::Warning},
    {"agreement_required", "Accept terms",   "first",           Tone::Warning},
    {"not_borrowed",       "Not borrowed",   "",                Tone::Warning},
};
}

const CodeMessage* findMessage(const std::string& code) {
    for (const CodeMessage& m : kTable) if (code == m.code) return &m;
    return nullptr;
}

const char* const kTermsText[] = {
    "Handle with care",
    "Return on time",
};
const int kTermsTextCount = sizeof(kTermsText) / sizeof(kTermsText[0]);
