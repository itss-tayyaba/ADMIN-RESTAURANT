# ☕ Ember & Brew — Native Flutter Mobile App

Official cross-platform Flutter Mobile Application for **Ember & Brew Artisan Café & Cuisine** (iOS & Android).

---

## 📱 Features

- **Luxury Obsidian & Gold UI:** Matches the restaurant branding with custom typography (*Playfair Display* & *DM Sans*).
- **Sizzling Splash Screen:** Animated flying wok opening sequence with real-time percentage loader.
- **45-Dish Catalog:** Complete menu with fast category filters (Bakery, Coffee, Desi, Fast Food, Pizza, Desserts, Salads, Sandwiches, Drinks) and instant search.
- **Interactive `[- 1 +]` Quantity Stepper:** Direct 1-tap cart additions directly on cards.
- **Multi-Currency Switcher:** Instant currency conversion (PKR `Rs`, USD `$`, GBP `£`, AUD `A$`).
- **Live Order Tracking:** Real-time order progress timeline and delivery OTP handoff code.
- **Table Reservation:** Interactive reservation booking form.

---

## 🚀 How to Run & Build the App

### 1. Install Flutter Dependencies
```bash
cd ember_and_brew_app
flutter pub get
```

### 2. Run on Emulator / Connected Device
```bash
flutter run
```

### 3. Build Android APK for Distribution
```bash
flutter build apk --release
```
*(The generated APK will be located at: `build/app/outputs/flutter-apk/app-release.apk`)*

### 4. Build iOS App
```bash
flutter build ios --release
```
