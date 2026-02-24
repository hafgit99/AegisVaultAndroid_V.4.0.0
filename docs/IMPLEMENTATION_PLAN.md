# Aegis Android Vault Implementation Plan

## 1. SQLCipher OP-SQLite Architectural Integration

The SQLCipher engine has been deeply integrated into the `AegisAndroid` React Native application bypassing standard bridges via JSI (JavaScript Interface), through the `@op-engineering/op-sqlite` C++ library.

### Technical Implementation:

1. **Gradle Layer:** 16-KB page size alignment is established `useLegacyPackaging = true` to support Android 15 & 16 devices properly since Android enforces 16KB native library structures directly causing alignment `UnsatisfiedLinkError` issues otherwise.
2. **Native Dependency:** `net.zetetic:sqlcipher-android:4.5.6@aar` has been explicitly added to `android/app/build.gradle` so SQLite operations are entirely overridden by Zetetic's Zero-Knowledge engine.
3. **Database Initialization:** `open({ name: '...sqlite', encryptionKey: hexKey })` triggers `PRAGMA key = ...` under the hood. No cleartext is ever dumped onto the disk. Any query will fail (SQLite error 26 - File is not a database) if the key is incorrect.
4. **Validation:** Right after unlock, we execute `PRAGMA integrity_check;` to ensure no database corruption occurred and that headers are correctly aligned.

## 2. Cryptographic Key Derivation (PBKDF2 310k Iterations) 

For AES-256 (used natively by SQLCipher), we securely derive the user's Master Password into a consistent 256-bit (32 bytes) key.

1. **C++ Native Node.Crypto Polyfill:** Instead of standard JS `crypto.subtle` which introduces huge React Native overhead and lacks certain PBKDF2 configurations, we injected `react-native-quick-crypto` providing pure C++ speed.
2. **Parameters:** 310,000 Iterations. 256-Bit Length. SHA-256 HMAC wrapper.
3. **Brute Force Resistance:** Even with high-end GPUs/TPUs attempting brute force, scaling up to 310k derivations for each guess exponentially decelerates dictionary and rainbow table attacks. The PBKDF2 operation executes seamlessly within the native C++ realm without locking the RN JavaScript Core (JSC/Hermes) thread for optimal UX.

## 3. Critical Memory Scrubbing

Passwords and encryption keys are extremely sensitive. JavaScript Garbage Collection (GC) behavior is unpredictable and might leave strings/buffers scattered in RAM for prolonged periods. 

To mitigate Cold-Boot & memory-dump attacks:
1. The derived PBKDF2 Key is returned as an explicit mutable `Buffer` (Uint8Array behind the scenes).
2. Right after SQLCipher OP-SQLite consumes the hex value to invoke `PRAGMA key`, we iterate through the actual RAM bytes:
```ts
for (let i = 0; i < keyBuffer.length; i++) {
  keyBuffer[i] = 0; // Explicitly zero-out 256 bits immediately!
}
```
3. This physically mutates the array in memory, dropping the raw secret out of existence even before standard Garbage Collection operates.
