# Ember & Brew — Android Mobile Application (Flutter)

Standalone, lightweight Android mobile application for **Ember & Brew Artisan Culinary & Café**.

- **Target URL**: `https://admin-restaurant-six.vercel.app/`
- **Application ID / Package**: `com.restaurant.app`
- **Branding**: Official Ember & Brew logo emblem and dark luxury theme.

---

## 📱 How to Build the APK & App Bundle

### 1. Requirements
- Flutter SDK (`>= 3.0.0`)
- Java / OpenJDK 17 or 11
- Android Studio / Android SDK

### 2. Generate Debug APK (For immediate device testing)
```bash
cd restaurant-mobile
flutter pub get
flutter build apk --debug
```
**Output location:**
`restaurant-mobile/build/app/outputs/flutter-apk/app-debug.apk`

---

### 3. Generate Release APK (For distribution & direct download on website)
```bash
cd restaurant-mobile
flutter pub get
flutter build apk --release
```
**Output location:**
`restaurant-mobile/build/app/outputs/flutter-apk/app-release.apk`

---

### 4. Generate Google Play Store App Bundle (AAB)
```bash
cd restaurant-mobile
flutter build appbundle --release
```
**Output location:**
`restaurant-mobile/build/app/outputs/bundle/release/app-release.aab`

---

## 🌐 Hosting the APK for Website "Download App" Button

To make the APK downloadable directly from your website:
1. Copy the generated `app-release.apk` file to your website's public downloads folder:
   ```bash
   cp restaurant-mobile/build/app/outputs/flutter-apk/app-release.apk ember-and-brew/public/downloads/ember-and-brew.apk
   ```
2. Push to GitHub: Vercel will automatically host the APK at:
   `https://admin-restaurant-six.vercel.app/downloads/ember-and-brew.apk`
3. Visitors can tap the **"Download App"** button on the website to download and install the APK on Android.
