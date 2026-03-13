package com.aegisandroid

import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class IntegrityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceIntegrity"

    @ReactMethod
    fun getIntegritySignals(promise: Promise) {
        try {
            val rootedPaths = findRootArtifacts()
            val rooted = rootedPaths.isNotEmpty() || canExecuteSu()
            val emulator = isEmulator()
            val debugBuild = BuildConfig.DEBUG
            val testKeys = (Build.TAGS ?: "").contains("test-keys")
            val adbEnabled = isAdbEnabled()

            var score = 100
            if (rooted) score -= 55
            if (testKeys) score -= 20
            if (debugBuild) score -= 10
            if (adbEnabled) score -= 10
            if (emulator) score -= 10
            if (score < 0) score = 0

            val riskLevel = when {
                score < 45 -> "critical"
                score < 65 -> "high"
                score < 80 -> "medium"
                else -> "low"
            }

            val reasons = Arguments.createArray()
            if (rooted) reasons.pushString("root_artifacts_detected")
            if (testKeys) reasons.pushString("test_keys_build")
            if (debugBuild) reasons.pushString("debug_build")
            if (adbEnabled) reasons.pushString("adb_enabled")
            if (emulator) reasons.pushString("emulator_environment")

            val artifacts = Arguments.createArray()
            rootedPaths.forEach { artifacts.pushString(it) }

            val result = Arguments.createMap().apply {
                putBoolean("rooted", rooted)
                putBoolean("emulator", emulator)
                putBoolean("debugBuild", debugBuild)
                putBoolean("testKeys", testKeys)
                putBoolean("adbEnabled", adbEnabled)
                putInt("score", score)
                putString("riskLevel", riskLevel)
                putArray("reasons", reasons)
                putArray("artifacts", artifacts)
                putString("checkedAt", System.currentTimeMillis().toString())
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("E_INTEGRITY_CHECK", e.message, e)
        }
    }

    private fun isEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.lowercase()
        val model = Build.MODEL.lowercase()
        val brand = Build.BRAND.lowercase()
        val device = Build.DEVICE.lowercase()
        val product = Build.PRODUCT.lowercase()
        val hardware = Build.HARDWARE.lowercase()

        return fingerprint.contains("generic") ||
            fingerprint.contains("unknown") ||
            model.contains("google_sdk") ||
            model.contains("emulator") ||
            model.contains("android sdk built for") ||
            brand.contains("generic") ||
            device.contains("generic") ||
            product.contains("sdk") ||
            product.contains("emulator") ||
            hardware.contains("goldfish") ||
            hardware.contains("ranchu")
    }

    private fun findRootArtifacts(): List<String> {
        val paths = listOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/system/xbin/daemonsu",
            "/system/etc/init.d/99SuperSUDaemon",
            "/su/bin/su",
            "/magisk/.core/bin/su",
            "/sbin/.magisk",
            "/data/adb/magisk",
        )
        return paths.filter { path -> File(path).exists() }
    }

    private fun canExecuteSu(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
            val rc = process.waitFor()
            rc == 0
        } catch (_: Exception) {
            false
        }
    }

    private fun isAdbEnabled(): Boolean {
        return try {
            Settings.Global.getInt(
                reactContext.contentResolver,
                Settings.Global.ADB_ENABLED,
                0,
            ) == 1
        } catch (_: Exception) {
            false
        }
    }
}
