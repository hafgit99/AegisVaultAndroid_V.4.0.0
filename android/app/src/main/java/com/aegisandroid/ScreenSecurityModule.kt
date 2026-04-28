package com.aegisandroid

import android.app.Activity
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * ScreenSecurityModule — Ekran Güvenliği Modülü
 *
 * Controls FLAG_SECURE to prevent screenshots, screen recording,
 * and sensitive content exposure in the recent-apps switcher.
 *
 * Ekran görüntüsü, ekran kaydı ve son uygulamalar listesinde
 * hassas içerik gösterimini engellemek için FLAG_SECURE kontrolü sağlar.
 *
 * SECURITY: FLAG_SECURE is applied at the window level, which means:
 *   - Screenshots are blocked system-wide (including ADB screencap)
 *   - Screen recording captures a black/blank frame
 *   - Recent apps switcher shows a blank preview
 *   - Cast/mirror displays show blank content
 *
 * Dark mode / tema uyumluluğu: Bu modül yalnızca pencere bayrakları
 * ile çalışır, tema veya renk değişikliği yapmaz. Tüm temalarda
 * (açık/koyu) sorunsuz çalışır.
 */
class ScreenSecurityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScreenSecurity"

    /**
     * Enables FLAG_SECURE on the current activity window.
     * Call this when the vault is unlocked or sensitive data is visible.
     *
     * Mevcut aktivite penceresinde FLAG_SECURE'u etkinleştirir.
     * Kasa açıkken veya hassas veri görünürken çağrılmalıdır.
     */
    @ReactMethod
    fun enable(promise: Promise) {
        val activity: Activity? = getCurrentActivity()
        if (activity == null) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            try {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SCREEN_SECURITY_ERROR", e.message, e)
            }
        }
    }

    /**
     * Disables FLAG_SECURE on the current activity window.
     * Only call this if the user explicitly opts out of screen protection
     * (e.g., for accessibility reasons or when vault is locked).
     *
     * FLAG_SECURE'u devre dışı bırakır.
     * Yalnızca kullanıcı ekran korumasını açıkça devre dışı bıraktığında çağrılmalıdır.
     */
    @ReactMethod
    fun disable(promise: Promise) {
        val activity: Activity? = getCurrentActivity()
        if (activity == null) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            try {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SCREEN_SECURITY_ERROR", e.message, e)
            }
        }
    }

    /**
     * Returns the current FLAG_SECURE state.
     * Geçerli FLAG_SECURE durumunu döndürür.
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        val activity: Activity? = getCurrentActivity()
        if (activity == null) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            try {
                val flags = activity.window.attributes.flags
                val secure = (flags and WindowManager.LayoutParams.FLAG_SECURE) != 0
                promise.resolve(secure)
            } catch (e: Exception) {
                promise.reject("SCREEN_SECURITY_ERROR", e.message, e)
            }
        }
    }
}
