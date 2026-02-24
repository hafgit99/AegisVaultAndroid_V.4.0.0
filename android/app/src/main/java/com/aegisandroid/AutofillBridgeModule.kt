package com.aegisandroid

import android.os.Build
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.*

/**
 * React Native Native Module – bridges vault data to the Android Autofill Service.
 * 
 * When the vault is unlocked and items are loaded, the JS side calls
 * updateAutofillEntries() to sync vault data with the native autofill service.
 */
class AutofillBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AutofillBridge"

    /**
     * Update the autofill service with current vault entries.
     * Called from JS whenever items are loaded/updated.
     */
    @ReactMethod
    fun updateAutofillEntries(entries: ReadableArray) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val vaultEntries = mutableListOf<AegisAutofillService.VaultEntry>()

        for (i in 0 until entries.size()) {
            val map = entries.getMap(i) ?: continue
            vaultEntries.add(
                AegisAutofillService.VaultEntry(
                    id = map.getInt("id"),
                    title = map.getString("title") ?: "",
                    username = map.getString("username") ?: "",
                    password = map.getString("password") ?: "",
                    url = map.getString("url") ?: "",
                    category = map.getString("category") ?: "login"
                )
            )
        }

        AegisAutofillService.updateVaultEntries(vaultEntries)
    }

    /**
     * Notify the autofill service about vault lock/unlock state.
     */
    @ReactMethod
    fun setVaultUnlocked(unlocked: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        AegisAutofillService.setUnlocked(unlocked)
    }

    /**
     * Clear all autofill entries (on vault lock).
     */
    @ReactMethod
    fun clearAutofillEntries() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        AegisAutofillService.updateVaultEntries(emptyList())
        AegisAutofillService.setUnlocked(false)
    }

    /**
     * Open the system Autofill settings page.
     */
    @ReactMethod
    fun openSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                // Try to open the "Select Autofill Service" dialog directly for our app
                val intent = Intent("android.settings.REQUEST_SET_AUTOFILL_SERVICE")
                intent.setData(Uri.parse("package:" + reactApplicationContext.packageName))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            } catch (e: Exception) {
                try {
                    // Fallback 1: General Autofill Settings page
                    val fallback = Intent("android.settings.AUTOFILL_SETTINGS")
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactApplicationContext.startActivity(fallback)
                } catch (e2: Exception) {
                    try {
                        // Fallback 2: Languages & Input (common on older or custom ROMs)
                        val inputIntent = Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)
                        inputIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        reactApplicationContext.startActivity(inputIntent)
                    } catch (e3: Exception) {
                        // Final fallback: Main Settings
                        val mainSettings = Intent(Settings.ACTION_SETTINGS)
                        mainSettings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        reactApplicationContext.startActivity(mainSettings)
                    }
                }
            }
        }
    }
}
