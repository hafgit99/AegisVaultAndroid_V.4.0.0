# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ── React Native ──────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}

-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# ── Hermes ────────────────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-keep class org.hermesvm.** { *; }

# ── JSC (fallback) ───────────────────────────────────────────
-keep class org.webkit.** { *; }

# ── SQLCipher / op-sqlite ─────────────────────────────────────
-keep class net.zetetic.** { *; }
-keep class com.op.sqlite.** { *; }
-keep class com.op.** { *; }

# ── OkHttp ────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ── React Native Biometrics ──────────────────────────────────
-keep class com.ReactNativeBiometrics.** { *; }

# ── React Native Quick Crypto ────────────────────────────────
-keep class com.margelo.** { *; }

# ── React Native Nitro Modules ───────────────────────────────
-keep class com.margelo.nitro.** { *; }

# ── React Native FS ──────────────────────────────────────────
-keep class com.rnfs.** { *; }

# ── React Native SVG ─────────────────────────────────────────
-keep class com.horcrux.svg.** { *; }

# ── React Native Safe Area Context ───────────────────────────
-keep class com.th3rdwave.safeareacontext.** { *; }

# ── React Native Argon2 ──────────────────────────────────────
-keep class com.nicola.** { *; }
-keep class com.nicola.RNArgon2.** { *; }

# ── AndroidX Credentials ─────────────────────────────────────
-keep class androidx.credentials.** { *; }

# ── General ───────────────────────────────────────────────────
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Suppress warnings for missing optional dependencies
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**
-dontwarn java.beans.**
