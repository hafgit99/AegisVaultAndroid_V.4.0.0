package com.aegisandroid

import android.os.Build
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import java.io.File
import java.security.SecureRandom

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

            val reasons = mutableListOf<String>()
            var score = 100

            if (rooted) {
                score -= 55
                reasons.add("root_artifacts_detected")
            }
            if (testKeys) {
                score -= 20
                reasons.add("test_keys_build")
            }
            if (debugBuild) {
                score -= 10
                reasons.add("debug_build")
            }
            if (adbEnabled) {
                score -= 10
                reasons.add("adb_enabled")
            }
            if (emulator) {
                score -= 10
                reasons.add("emulator_environment")
            }

            val playIntegrityProjectNumber = BuildConfig.PLAY_INTEGRITY_PROJECT_NUMBER
            val playIntegritySupported = playIntegrityProjectNumber > 0L

            if (!playIntegritySupported) {
                score -= 20
                reasons.add("play_integrity_not_configured")
                resolveResult(
                    promise = promise,
                    rooted = rooted,
                    emulator = emulator,
                    debugBuild = debugBuild,
                    testKeys = testKeys,
                    adbEnabled = adbEnabled,
                    rootedPaths = rootedPaths,
                    reasons = reasons,
                    score = score,
                    playServicesAvailable = true,
                    playIntegritySupported = false,
                    playIntegrityStatus = "not_configured",
                    playIntegrityTokenReceived = false,
                    playIntegrityTokenLength = 0,
                    playIntegrityNonce = null,
                )
                return
            }

            val nonce = generateNonce()
            requestIntegrityToken(nonce)
                .addOnSuccessListener { response ->
                    val token = response.token()
                    var finalScore = score
                    val finalReasons = reasons.toMutableList()
                    if (token.isBlank()) {
                        finalScore -= 15
                        finalReasons.add("play_integrity_empty_token")
                    }
                    resolveResult(
                        promise = promise,
                        rooted = rooted,
                        emulator = emulator,
                        debugBuild = debugBuild,
                        testKeys = testKeys,
                        adbEnabled = adbEnabled,
                        rootedPaths = rootedPaths,
                        reasons = finalReasons,
                        score = finalScore,
                        playServicesAvailable = true,
                        playIntegritySupported = true,
                        playIntegrityStatus = if (token.isBlank()) "request_failed" else "token_obtained",
                        playIntegrityTokenReceived = token.isNotBlank(),
                        playIntegrityTokenLength = token.length,
                        playIntegrityNonce = nonce,
                    )
                }
                .addOnFailureListener { e ->
                    val finalReasons = reasons.toMutableList()
                    finalReasons.add("play_integrity_request_failed")
                    finalReasons.add("play_services_unavailable_or_request_blocked")
                    finalReasons.add("request_error_detail_hidden")
                    resolveResult(
                        promise = promise,
                        rooted = rooted,
                        emulator = emulator,
                        debugBuild = debugBuild,
                        testKeys = testKeys,
                        adbEnabled = adbEnabled,
                        rootedPaths = rootedPaths,
                        reasons = finalReasons,
                        score = score - 15,
                        playServicesAvailable = true,
                        playIntegritySupported = true,
                        playIntegrityStatus = "request_failed",
                        playIntegrityTokenReceived = false,
                        playIntegrityTokenLength = 0,
                        playIntegrityNonce = nonce,
                    )
                }
        } catch (e: Exception) {
            promise.reject("E_INTEGRITY_CHECK", e.message, e)
        }
    }

    @ReactMethod
    fun requestPlayIntegrityToken(nonce: String, promise: Promise) {
        try {
            if (nonce.isBlank() || nonce.length < 16) {
                promise.reject("E_INVALID_NONCE", "Nonce must be at least 16 characters")
                return
            }
            if (BuildConfig.PLAY_INTEGRITY_PROJECT_NUMBER <= 0L) {
                promise.reject("E_PLAY_INTEGRITY_NOT_CONFIGURED", "PLAY_INTEGRITY_PROJECT_NUMBER is missing")
                return
            }

            requestIntegrityToken(nonce)
                .addOnSuccessListener { response ->
                    val token = response.token()
                    if (token.isBlank()) {
                        promise.reject("E_PLAY_INTEGRITY_EMPTY_TOKEN", "Play Integrity returned an empty token")
                        return@addOnSuccessListener
                    }
                    val result = Arguments.createMap().apply {
                        putString("nonce", nonce)
                        putString("token", token)
                        putInt("tokenLength", token.length)
                        putString("status", "token_obtained")
                    }
                    promise.resolve(result)
                }
                .addOnFailureListener { e ->
                    promise.reject("E_PLAY_INTEGRITY_REQUEST_FAILED", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("E_PLAY_INTEGRITY_REQUEST_FAILED", e.message, e)
        }
    }

    private fun requestIntegrityToken(nonce: String) =
        IntegrityManagerFactory.create(reactContext).requestIntegrityToken(
            IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .setCloudProjectNumber(BuildConfig.PLAY_INTEGRITY_PROJECT_NUMBER)
                .build(),
        )

    private fun resolveResult(
        promise: Promise,
        rooted: Boolean,
        emulator: Boolean,
        debugBuild: Boolean,
        testKeys: Boolean,
        adbEnabled: Boolean,
        rootedPaths: List<String>,
        reasons: List<String>,
        score: Int,
        playServicesAvailable: Boolean,
        playIntegritySupported: Boolean,
        playIntegrityStatus: String,
        playIntegrityTokenReceived: Boolean,
        playIntegrityTokenLength: Int,
        playIntegrityNonce: String?,
    ) {
        val boundedScore = score.coerceIn(0, 100)
        val riskLevel = when {
            boundedScore < 45 -> "critical"
            boundedScore < 65 -> "high"
            boundedScore < 80 -> "medium"
            else -> "low"
        }

        val reasonArray = Arguments.createArray()
        reasons.forEach { reasonArray.pushString(it) }

        val artifacts = Arguments.createArray()
        rootedPaths.forEach { artifacts.pushString(it) }

        val result = Arguments.createMap().apply {
            putBoolean("rooted", rooted)
            putBoolean("emulator", emulator)
            putBoolean("debugBuild", debugBuild)
            putBoolean("testKeys", testKeys)
            putBoolean("adbEnabled", adbEnabled)
            putBoolean("playServicesAvailable", playServicesAvailable)
            putBoolean("playIntegritySupported", playIntegritySupported)
            putString("playIntegrityStatus", playIntegrityStatus)
            putBoolean("playIntegrityTokenReceived", playIntegrityTokenReceived)
            putInt("playIntegrityTokenLength", playIntegrityTokenLength)
            putString("playIntegrityNonce", playIntegrityNonce)
            putInt("score", boundedScore)
            putString("riskLevel", riskLevel)
            putArray("reasons", reasonArray)
            putArray("artifacts", artifacts)
            putString("checkedAt", System.currentTimeMillis().toString())
        }

        promise.resolve(result)
    }

    private fun generateNonce(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
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
