#include "RfidReader.h"
#include <SPI.h>

void RfidReader::begin() {
    SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI, PIN_RC522_SS);
    rc_.PCD_Init();
}

uint8_t RfidReader::version() { return rc_.PCD_ReadRegister(MFRC522::VersionReg); }

bool RfidReader::poll(std::string& uidHex) {
    byte atqa[2];
    byte len = sizeof(atqa);
    auto st = rc_.PICC_WakeupA(atqa, &len);   // answers cards that are IDLE or HALTed
    uint32_t now = millis();

    if (st != MFRC522::STATUS_OK && st != MFRC522::STATUS_COLLISION) {
        // nothing in the field; after 400 ms of absence, the next tap counts as new
        if (held_ && now - lastSeen_ > 400) held_ = false;
        return false;
    }
    lastSeen_ = now;

    if (!rc_.PICC_ReadCardSerial()) return false;
    rc_.PICC_HaltA();
    rc_.PCD_StopCrypto1();

    if (held_) return false;                  // same tag still resting on the reader
    held_ = true;

    static const char* kHex = "0123456789ABCDEF";
    uidHex.clear();
    for (byte i = 0; i < rc_.uid.size; i++) {
        uidHex += kHex[rc_.uid.uidByte[i] >> 4];
        uidHex += kHex[rc_.uid.uidByte[i] & 0x0F];
    }
    return true;
}