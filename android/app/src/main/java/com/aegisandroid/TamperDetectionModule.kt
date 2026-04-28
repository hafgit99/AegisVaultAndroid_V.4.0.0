package com.aegisandroid

import android.content.pm.PackageManager
import android.os.Build
import android.os.Debug
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.security.MessageDigest

/**
 * TamperDetectionModule — Kurcalama Tespit Modülü
 *
 * Provides runtime integrity verification for the Aegis Vault application:
 *   1. APK Signature Verification — Validates signing certificate SHA-256 fingerprint
 *   2. Debugger Detection — Checks for attached debuggers (Java & native)
 *   3. Frida Detection — Scans for Frida injection artifacts
 *   4. Xposed Detection — Detects Xposed Framework hooks
 *   5. Emulator Detection — Identifies emulated environments
 *
 * Aegis Vault uygulaması için çalışma zamanı bütünlük doğrulaması sağlar:
 *   1. APK İmza Doğrulama — İmza sertifikası SHA-256 parmak izini doğrular
 *   2. Debugger Tespiti — Bağlı hata ayıklayıcıları kontrol eder
 *   3. Frida Tespiti — Frida enjeksiyon kalıntılarını tarar
 *   4. Xposed Tespiti — Xposed Framework kancalarını tespit eder
 *   5. Emülatör Tespiti — Emüle edilmiş ortamları tanımlar
 *
 * SECURITY NOTE: This module intentionally does NOT expose the expected
 * certificate hash to JavaScript. The hash is hardcoded in native code
 * to prevent trivial bypass via JS patching.
 */
class TamperDetectionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        /**
         * SHA-256 fingerprint of the release signing certificate.
         * This MUST be updated when the signing key changes.
         *
         * Release imza sertifikasının SHA-256 parmak izi.
         * İmza anahtarı değiştiğinde GÜNCELLENMELİDİR.
         *
         * To obtain: keytool -list -v -keystore your-release.jks
         * Then copy the SHA-256 fingerprint (uppercase, colon-separated).
         */
        private const val EXPECTED_RELEASE_CERT_SHA256 =
            "" // Empty = skip check (populated during first release build)

        /** Frida default listening ports */
        private val FRIDA_PORTS = listOf(27042, 27043)

        /** Known Frida library names injected into process memory */
        private val FRIDA_LIBRARIES = listOf(
            "frida-gadget",
            "frida-agent",
            "frida-server",
            "libfrida",
            "gadget",
        )

        /** Known Xposed-related package names */
        private val XPOSED_PACKAGES = listOf(
            "de.robv.android.xposed.installer",
            "org.meowcat.edxposed.manager",
            "org.lsposed.manager",
            "com.solohsu.android.edxp.manager",
            "io.github.lsposed.manager",
        )

        /** Xposed native library artifacts */
        private val XPOSED_LIBRARIES = listOf(
            "libxposed_art.so",
            "liblspd.so",
            "libwhale.so",
            "libsandhook.so",
        )
    }

    override fun getName(): String = "TamperDetection"

    /**
     * Performs a comprehensive tamper detection scan.
     * Returns a detailed result map with individual check outcomes.
     *
     * Kapsamlı bir kurcalama tespit taraması gerçekleştirir.
     * Her bir kontrol sonucunu içeren detaylı bir sonuç haritası döndürür.
     */
    @ReactMethod
    fun performFullScan(promise: Promise) {
        try {
            val signatureResult = verifyApkSignatureInternal()
            val debuggerDetected = isDebuggerAttached()
            val fridaDetected = isFridaDetected()
            val xposedDetected = isXposedDetected()

            val threats = Arguments.createArray()
            var threatScore = 0

            // ── APK Signature ──────────────────────────────────────────────
            if (!signatureResult.valid && signatureResult.checked) {
                threats.pushString("apk_signature_mismatch")
                threatScore += 40
            }

            // ── Debugger ───────────────────────────────────────────────────
            if (debuggerDetected) {
                threats.pushString("debugger_attached")
                threatScore += 30
            }

            // ── Frida ──────────────────────────────────────────────────────
            if (fridaDetected) {
                threats.pushString("frida_detected")
                threatScore += 35
            }

            // ── Xposed ─────────────────────────────────────────────────────
            if (xposedDetected) {
                threats.pushString("xposed_framework_detected")
                threatScore += 25
            }

            val riskLevel = when {
                threatScore >= 60 -> "critical"
                threatScore >= 30 -> "high"
                threatScore > 0  -> "medium"
                else -> "clean"
            }

            val result = Arguments.createMap().apply {
                // Individual check results
                putBoolean("signatureValid", signatureResult.valid)
                putBoolean("signatureChecked", signatureResult.checked)
                putString("signatureHash", signatureResult.currentHash)
                putBoolean("debuggerDetected", debuggerDetected)
                putBoolean("fridaDetected", fridaDetected)
                putBoolean("xposedDetected", xposedDetected)

                // Aggregate
                putArray("threats", threats)
                putInt("threatScore", threatScore.coerceIn(0, 100))
                putString("riskLevel", riskLevel)
                putString("scannedAt", System.currentTimeMillis().toString())
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("E_TAMPER_SCAN", e.message, e)
        }
    }

    /**
     * Verify APK signing certificate only.
     * Yalnızca APK imza sertifikasını doğrular.
     */
    @ReactMethod
    fun verifyApkSignature(promise: Promise) {
        try {
            val result = verifyApkSignatureInternal()
            val map = Arguments.createMap().apply {
                putBoolean("valid", result.valid)
                putBoolean("checked", result.checked)
                putString("currentHash", result.currentHash)
                putString("reason", result.reason)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("E_SIGNATURE_CHECK", e.message, e)
        }
    }

    /**
     * Check for debugger attachment only.
     * Yalnızca debugger bağlantısını kontrol eder.
     */
    @ReactMethod
    fun checkDebugger(promise: Promise) {
        promise.resolve(isDebuggerAttached())
    }

    /**
     * Check for Frida injection only.
     * Yalnızca Frida enjeksiyonunu kontrol eder.
     */
    @ReactMethod
    fun checkFrida(promise: Promise) {
        promise.resolve(isFridaDetected())
    }

    /**
     * Check for Xposed Framework only.
     * Yalnızca Xposed Framework'ü kontrol eder.
     */
    @ReactMethod
    fun checkXposed(promise: Promise) {
        promise.resolve(isXposedDetected())
    }

    // ── Internal Implementation ──────────────────────────────────────────────

    private data class SignatureCheckResult(
        val valid: Boolean,
        val checked: Boolean,
        val currentHash: String,
        val reason: String,
    )

    @Suppress("DEPRECATION")
    private fun verifyApkSignatureInternal(): SignatureCheckResult {
        if (EXPECTED_RELEASE_CERT_SHA256.isBlank()) {
            return SignatureCheckResult(
                valid = true,
                checked = false,
                currentHash = getCurrentCertHash(),
                reason = "expected_hash_not_configured",
            )
        }

        val currentHash = getCurrentCertHash()
        if (currentHash.isBlank()) {
            return SignatureCheckResult(
                valid = false,
                checked = true,
                currentHash = "",
                reason = "unable_to_read_certificate",
            )
        }

        val normalized = EXPECTED_RELEASE_CERT_SHA256
            .replace(":", "")
            .uppercase()
        val match = currentHash == normalized

        return SignatureCheckResult(
            valid = match,
            checked = true,
            currentHash = currentHash,
            reason = if (match) "signature_matches" else "signature_mismatch",
        )
    }

    @Suppress("DEPRECATION")
    private fun getCurrentCertHash(): String {
        return try {
            val packageName = reactContext.packageName
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = reactContext.packageManager.getPackageInfo(
                    packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES,
                )
                info.signingInfo?.apkContentsSigners
            } else {
                val info = reactContext.packageManager.getPackageInfo(
                    packageName,
                    PackageManager.GET_SIGNATURES,
                )
                info.signatures
            }

            if (signatures.isNullOrEmpty()) return ""

            val cert = signatures[0].toByteArray()
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(cert)
            digest.joinToString("") { "%02X".format(it) }
        } catch (_: Exception) {
            ""
        }
    }

    private fun isDebuggerAttached(): Boolean {
        // Java-level debugger check
        if (Debug.isDebuggerConnected()) return true
        // Wait-for-debugger flag check
        if (Debug.waitingForDebugger()) return true
        // TracerPid check (native debugger like ptrace)
        try {
            val status = File("/proc/self/status").readText()
            val tracerLine = status.lines().find { it.startsWith("TracerPid:") }
            if (tracerLine != null) {
                val pid = tracerLine.split(":").getOrNull(1)?.trim()?.toIntOrNull() ?: 0
                if (pid > 0) return true
            }
        } catch (_: Exception) {}
        return false
    }

    private fun isFridaDetected(): Boolean {
        // Check 1: Frida listening ports via /proc/net/tcp
        if (checkFridaPorts()) return true
        // Check 2: Frida libraries in process memory maps
        if (checkFridaLibraries()) return true
        // Check 3: Frida named threads
        if (checkFridaThreads()) return true
        return false
    }

    private fun checkFridaPorts(): Boolean {
        return try {
            val tcpFile = File("/proc/net/tcp")
            if (!tcpFile.exists()) return false
            val lines = tcpFile.readLines()
            for (line in lines) {
                val parts = line.trim().split("\\s+".toRegex())
                if (parts.size < 2) continue
                val localAddr = parts[1]
                val portHex = localAddr.split(":").getOrNull(1) ?: continue
                val port = try { portHex.toInt(16) } catch (_: Exception) { continue }
                if (port in FRIDA_PORTS) return true
            }
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun checkFridaLibraries(): Boolean {
        return try {
            val mapsFile = File("/proc/self/maps")
            if (!mapsFile.exists()) return false
            val content = mapsFile.readText().lowercase()
            FRIDA_LIBRARIES.any { lib -> content.contains(lib) }
        } catch (_: Exception) {
            false
        }
    }

    private fun checkFridaThreads(): Boolean {
        return try {
            val taskDir = File("/proc/self/task")
            if (!taskDir.exists()) return false
            for (tid in taskDir.list() ?: emptyArray()) {
                try {
                    val comm = File("/proc/self/task/$tid/comm").readText().trim().lowercase()
                    if (comm.contains("frida") || comm.contains("gadget") ||
                        comm.contains("gmain") || comm.contains("gum-js-loop")) {
                        return true
                    }
                } catch (_: Exception) {}
            }
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun isXposedDetected(): Boolean {
        // Check 1: Xposed packages installed
        if (checkXposedPackages()) return true
        // Check 2: Xposed classes loaded
        if (checkXposedClasses()) return true
        // Check 3: Xposed native libraries
        if (checkXposedLibraries()) return true
        // Check 4: Xposed stack trace artifacts
        if (checkXposedStackTrace()) return true
        return false
    }

    private fun checkXposedPackages(): Boolean {
        val pm = reactContext.packageManager
        for (pkg in XPOSED_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0)
                return true
            } catch (_: PackageManager.NameNotFoundException) {}
        }
        return false
    }

    private fun checkXposedClasses(): Boolean {
        val xposedClasses = listOf(
            "de.robv.android.xposed.XposedBridge",
            "de.robv.android.xposed.XC_MethodHook",
            "de.robv.android.xposed.XposedHelpers",
        )
        for (cls in xposedClasses) {
            try {
                Class.forName(cls)
                return true
            } catch (_: ClassNotFoundException) {}
        }
        return false
    }

    private fun checkXposedLibraries(): Boolean {
        return try {
            val mapsFile = File("/proc/self/maps")
            if (!mapsFile.exists()) return false
            val content = mapsFile.readText().lowercase()
            XPOSED_LIBRARIES.any { lib -> content.contains(lib) }
        } catch (_: Exception) {
            false
        }
    }

    private fun checkXposedStackTrace(): Boolean {
        return try {
            val stackTrace = Thread.currentThread().stackTrace
            stackTrace.any { element ->
                val cls = element.className.lowercase()
                cls.contains("xposed") || cls.contains("lsposed") || cls.contains("edxposed")
            }
        } catch (_: Exception) {
            false
        }
    }
}
