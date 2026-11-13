#include "LcdDisplay.h"
#include <Wire.h>
#include "Text.h"

void LcdDisplay::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    lcd_.init();
    lcd_.backlight();
    lcd_.clear();
}

// Lines are padded to 16 chars so leftovers from the previous text are overwritten.
void LcdDisplay::show(const std::string& line1, const std::string& line2) {
    lcd_.setCursor(0, 0); lcd_.print(fit(line1, LCD_COLS).c_str());
    lcd_.setCursor(0, 1); lcd_.print(fit(line2, LCD_COLS).c_str());
}
