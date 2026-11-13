// STEP 1b: RC522 test. Expect a version of 0x91 or 0x92 (0x88 / 0xB2 are common clones),
// then every tapped tag's UID on Serial. 0x00 or 0xFF means wiring or power (3.3 V!) is wrong.
// Copy the UIDs you see into src/mock_data.h.
#include <Arduino.h>
#include "RfidReader.h"

static RfidReader rfid;

void setup() {
    Serial.begin(115200);
    delay(300);
    rfid.begin();
    Serial.printf("RC522 version: 0x%02X\n", rfid.version());
    Serial.println("Tap a tag...");
}

void loop() {
    std::string uid;
    if (rfid.poll(uid)) Serial.printf("UID: %s\n", uid.c_str());
    delay(50);
}
