package com.aegisandroid

import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SecureStorageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SecureStorage"

    private val securePrefs: SharedPreferences by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        EncryptedSharedPreferences.create(
            reactContext,
            "aegis_secure_storage",
            MasterKey.Builder(reactContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private fun prefs() = securePrefs

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        try {
            val value = prefs().getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("E_SECURE_STORAGE_GET", e.message, e)
        }
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        try {
            val ok = prefs().edit().putString(key, value).commit()
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("E_SECURE_STORAGE_SET", e.message, e)
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        try {
            val ok = prefs().edit().remove(key).commit()
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("E_SECURE_STORAGE_REMOVE", e.message, e)
        }
    }
}
