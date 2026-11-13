// STEP 1a: LCD test. Expect: I2C address printed on Serial, a two-line message,
// then a long text that scrolls. If the screen is blank, turn the contrast screw on the
// backpack. If the address is not 0x27, set LCD_I2C_ADDR in Pins.h.
#include <Arduino.h>
#include <Wire.h>
#include "LcdDisplay.h"
#include "Text.h"

static LcdDisplay lcd;

void setup() {
    Serial.begin(115200);
    delay(300);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Serial.println("I2C scan:");
    for (uint8_t a = 1; a < 127; a++) {
        Wire.beginTransmission(a);
        if (Wire.endTransmission() == 0) Serial.printf("  found device at 0x%02X\n", a);
    }
    lcd.begin();
    lcd.show("EquipFlow kiosk", "LCD test OK");
    delay(2000);
}

void loop() {
    const std::string longText = "Intro to Algorithms and Data Structures";
    uint32_t start = millis();
    while (millis() - start < 9000) {
        lcd.show(marqueeWindow(longText, millis() - start), "scrolling text");
        delay(100);
    }
}
