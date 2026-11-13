#include "RfidReader.h"
#include <SPI.h>

void RfidReader::begin() {
    SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI, PIN_RC522_SS);
    rc_.PCD_Init();
}

uint8_t RfidReader::version() { return rc_.PCD_ReadRegister(MFRC522::VersionReg); }

bool RfidReader::poll(std::string& uidHex) {
    if (!rc_.PICC_IsNewCardPresent() || !rc_.PICC_ReadCardSerial()) return false;
    static const char* kHex = "0123456789ABCDEF";
    uidHex.clear();
    for (byte i = 0; i < rc_.uid.size; i++) {
        uidHex += kHex[rc_.uid.uidByte[i] >> 4];
        uidHex += kHex[rc_.uid.uidByte[i] & 0x0F];
    }
    rc_.PICC_HaltA();              // a held tag is not re-read until it leaves the field
    rc_.PCD_StopCrypto1();
    return true;
}
