#pragma once
#include "MockApi.h"

// Fake server data for step 2, so the kiosk works with no Wi-Fi.
// Tap your real tags with hwtests/rfid_test (or this firmware, it prints every UID) and
// replace the placeholder UIDs below. They disappear in step 3 when the real API is used.
inline void seedMockData(MockApi& api) {
    api.addUser("AAAAAAAA", "Juan Dela Cruz");                     // normal user
    api.addUser("BBBBBBBB", "Bob Blocked", "unpaid_fine");         // blocked user
    api.addUser("CCCCCCCC", "Stan Staff", "", true, "staff");      // staff: NEXT opens enrollment
    api.addPending("21-00001", "Maria Cruz");                      // accounts waiting for an ID tag
    api.addPending("21-00002", "Juan Santos");
    api.addItem("11111111", "Intro to Algorithms and Data Structures", "book");
    api.addItem("22222222", "Laptop 1", "hardware");               // asks for the terms
    api.addItem("33333333", "Old Book (borrowed)", "book", "borrowed");
    api.addItem("44444444", "Late Laptop", "hardware", "overdue", 50);   // return shows a fine
}
