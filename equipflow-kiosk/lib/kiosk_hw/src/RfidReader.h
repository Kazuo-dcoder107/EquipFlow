#pragma once
#include <MFRC522.h>
#include <string>
#include "Pins.h"

class RfidReader {
public:
    void begin();
    // true when a tag was read; uidHex is upper-case hex, e.g. "04A1B2C3"
    bool poll(std::string& uidHex);
    uint8_t version();             // 0x91/0x92 = genuine, 0x88/0xB2 = common clones, 0x00/0xFF = wiring problem
private:
    MFRC522 rc_{PIN_RC522_SS, PIN_RC522_RST};
};
