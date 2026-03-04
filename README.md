<p align="center">
  <img src="https://raw.githubusercontent.com/hafgit99/AegisVaultAndroid_V.4.0.0/main/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png" width="128" alt="Aegis Vault Logo">
</p>

<h1 align="center">🛡️ Aegis Vault Android — v4.1.0</h1>

<p align="center">
  <strong>Secure. Native. Uncompromising.</strong><br>
  The next generation of open-source password management and digital security for Android.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-4.1.0-blue?style=for-the-badge&logo=android" alt="Version">
  <img src="https://img.shields.io/badge/React--Native-0.84.0-61DAFB?style=for-the-badge&logo=react" alt="React Native">
  <img src="https://img.shields.io/badge/Security-AES--256--GCM-green?style=for-the-badge" alt="Security">
  <img src="https://img.shields.io/badge/Database-SQLCipher-9cf?style=for-the-badge&logo=sqlite" alt="SQLCipher">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/hafgit99/AegisVaultAndroid_V.4.0.0/main/AegisVaultAndroid.png" width="100%" alt="Aegis Vault Android Infographic">
</p>

---

## 🌟 Overview

**Aegis Vault** is a high-performance, privacy-first vault application engineered to protect your digital identity. In version 4.1.0, we've overhauled our security architecture to remove legacy fallback methods and embrace **native Android hardware security**. 

By leveraging the **Android Keystore (TEE/Secure Element)**, Aegis Vault ensures that your encryption keys never leave the secure hardware environment of your device.

## ✨ Key Enhancements in v4.1.0

- **🚫 Zero-UI Authentication:** Removed the legacy Master Password to streamline access. Aegis now relies exclusively on the device's native secure authentication.
- **🛡️ Universal Auth Fallback:** Full support for **PIN, Pattern, and Password** fallback. If biometric sensors fail or aren't available, the system seamlessly uses your device's native lock screen credentials.
- **🤖 Android 15 Ready:** Fully optimized for Android 15 (API 35), utilizing the latest BiometricPrompt and Credential Manager standards.
- **⚡ Nitro Modules Integration:** Significant performance boost by migrating to high-speed native Nitro Modules for core logic and cryptographic operations.
- **🎨 Dark Mode 2.0:** Completely polished dark theme with improved contrast, readable QR codes for donations, and a glassmorphism design system.

## 🛠️ Security Architecture

Aegis Vault is built on a "Zero-Knowledge" foundation:

- **Local-Only Processing:** No data is stored on our servers. Your vault is your own.
- **SQLCipher 4.0:** The entire database is encrypted using 256-bit AES encryption with multi-iteration PBKDF2.
- **Deterministic Hardware Keys:** Vault keys are derived using a unique combination of **Android Keystore-backed RSA public keys** and a **device-specific salt**.
- **Cryptographic Primitives:** 
  - **AES-256-GCM** for data encryption (authenticated encryption).
  - **Argon2id** for high-entropy key derivation.
  - **PBKDF2-SHA256** for hardware key stretching.

## 📱 Visual Showcase

The main infographic provided above showcases the refined user interface, including:
- High-security password generation with strength analysis.
- Intuitive categorization (Logins, Cards, Identities, Notes, WiFi).
- Seamless multi-language support (English & Turkish).

## 🚀 Installation & Build

### Prerequisites
- **Node.js**: v22.11.0 or higher
- **Android SDK**: API level 30+ (Android 11+)
- **ADB**: For device installation and debugging

### Build Instructions
1. **Clone the Repository:**
   ```bash
   git clone https://github.com/hafgit99/AegisVaultAndroid_V.4.0.0.git
   cd AegisVaultAndroid_V.4.0.0
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Assemble Release Bundle:**
   ```bash
   cd android && .\gradlew.bat assembleRelease
   ```
4. **Install on Device via ADB:**
   ```bash
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

## ⚖️ License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.

---

<p align="center">
  Developed by <a href="https://github.com/hafgit99"><strong>hafgit99</strong></a> — <em>Privacy is not a privilege, it's a right.</em>
</p>
