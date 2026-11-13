#pragma once
#include <string>
#include "Tone.h"

// Server result code -> two 16-char lines + the tone to play.
struct CodeMessage { const char* code; const char* line1; const char* line2; Tone tone; };
const CodeMessage* findMessage(const std::string& code);

// Terms shown before a hardware borrow: one text line per page (16 chars; longer lines scroll).
// The kiosk adds a "NEXT > 1/3" hint line and a final "Accept terms?" page by itself.
// PLACEHOLDER WORDING: replace with your real terms (or fetch from the API later).
extern const char* const kTermsText[];
extern const int kTermsTextCount;
