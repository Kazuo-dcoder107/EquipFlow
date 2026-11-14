#pragma once
#include <string>
#include "Tone.h"

// Server result code -> two 16-char lines + the tone to play.
struct CodeMessage { const char* code; const char* line1; const char* line2; Tone tone; };
const CodeMessage* findMessage(const std::string& code);
