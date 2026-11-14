#pragma once
#include <Arduino.h>

// ESP32 DevKit pin map. This is my assumption of your wiring: change it here, nowhere else.

// RC522 RFID reader (SPI, 3.3 V only!)
constexpr int PIN_SPI_SCK  = 18;
constexpr int PIN_SPI_MISO = 19;
constexpr int PIN_SPI_MOSI = 23;
constexpr int PIN_RC522_SS = 5;
constexpr int PIN_RC522_RST = 27;      // not 22: GPIO22 is the I2C clock

// 1602 LCD through an I2C "backpack" (PCF8574). Usual addresses: 0x27 or 0x3F.
constexpr int     PIN_I2C_SDA = 21;
constexpr int     PIN_I2C_SCL = 22;
constexpr uint8_t LCD_I2C_ADDR = 0x27;
constexpr int     LCD_COLS = 16;
constexpr int     LCD_ROWS = 2;

// Three arcade buttons: one leg of each to its pin, the other legs all to GND (internal pull-ups).
// GPIO32/33 are plain inputs on every ESP32 board (GPIO16/17 are taken by PSRAM on WROVER boards).
constexpr int PIN_BUTTON_YES  = 4;    // borrow / accept
constexpr int PIN_BUTTON_NO   = 32;   // cancel / decline / log out
constexpr int PIN_BUTTON_NEXT = 33;   // next terms page

// Buzzer driven through the 2N2222: GPIO -> ~1k resistor -> transistor base
constexpr int PIN_BUZZER = 25;
constexpr int BUZZER_LEDC_CHANNEL = 0;
