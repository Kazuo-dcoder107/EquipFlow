#pragma once
#include <string>
#include "ApiTypes.h"
#include "Tone.h"

// The state machine only sees these three interfaces. Real hardware and the
// real HTTP client (step 3) plug in behind them; tests use mocks.
class IApi {
public:
    virtual ~IApi() {}
    virtual ScanResp      scan(const std::string& uid) = 0;
    virtual LoginResp     login(const std::string& uid) = 0;
    virtual BorrowResp    borrow(const std::string& itemUid, bool agreed) = 0;
    virtual ReturnResp    returnItem(const std::string& itemUid) = 0;
    virtual EquipmentResp equipment(const std::string& itemUid) = 0;
    virtual ApiResult     logout() = 0;
};

class IDisplay {          // 16x2 character LCD: each line is at most 16 characters
public:
    virtual ~IDisplay() {}
    virtual void show(const std::string& line1, const std::string& line2) = 0;
};

class IBuzzer {
public:
    virtual ~IBuzzer() {}
    virtual void play(Tone t) = 0;
};
