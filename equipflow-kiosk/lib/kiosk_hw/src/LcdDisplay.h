#pragma once
#include <LiquidCrystal_I2C.h>
#include <string>
#include "Interfaces.h"
#include "Pins.h"

class LcdDisplay : public IDisplay {
public:
    void begin();
    void show(const std::string& line1, const std::string& line2) override;
private:
    LiquidCrystal_I2C lcd_{LCD_I2C_ADDR, LCD_COLS, LCD_ROWS};
};
