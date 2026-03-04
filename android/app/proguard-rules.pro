# Aegis Vault Android — ProGuard / R8 Rules
# Activated in build.gradle: enableProguardInReleaseBuilds = true

# ── React Native ─────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.**

# ── Aegis Native Modules ─────────────────────────────────
-keep class com.aegisandroid.** { *; }

# ── SQLCipher ────────────────────────────────────────────
-keep class net.zetetic.** { *; }
-dontwarn net.zetetic.**

# ── QuickCrypto (react-native-quick-crypto) ──────────────
-keep class com.margelo.** { *; }
-dontwarn com.margelo.**

# ── React Native Biometrics ──────────────────────────────
-keep class com.rnbiometrics.** { *; }

# ── React Native FS ──────────────────────────────────────
-keep class com.rnfs.** { *; }

# ── Argon2 ───────────────────────────────────────────────
-keep class com.AegisArgon2.** { *; }
-keep class com.nicola.argon2.** { *; }
-dontwarn com.nicola.**

# ── op-sqlite ────────────────────────────────────────────
-keep class com.op.sqlite.** { *; }
-dontwarn com.op.sqlite.**

# ── Nitro Modules ────────────────────────────────────────
-keep class com.margelo.nitro.** { *; }
-dontwarn com.margelo.nitro.**

# ── General ──────────────────────────────────────────────
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-dontwarn javax.annotation.**
-dontwarn sun.misc.**

