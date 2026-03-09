package com.aegisandroid

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class CloudSyncSecureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "CloudSyncSecure"

    @ReactMethod
    fun uploadFile(
        apiUrl: String,
        filePath: String,
        authHeader: String,
        certificatePin: String,
        promise: Promise,
    ) {
        thread {
            try {
                val endpoint = java.net.URL(apiUrl)
                val host = endpoint.host
                val normalizedPin = normalizePin(certificatePin)

                val client = secureClient(host, normalizedPin)
                val body = File(filePath).asRequestBody("application/octet-stream".toMediaType())

                val request = Request.Builder()
                    .url(apiUrl)
                    .put(body)
                    .header("Authorization", authHeader)
                    .build()

                client.newCall(request).execute().use { response ->
                    promise.resolve(response.code)
                }
            } catch (e: Exception) {
                promise.reject("CLOUD_UPLOAD_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun downloadFile(
        apiUrl: String,
        destinationPath: String,
        authHeader: String,
        certificatePin: String,
        promise: Promise,
    ) {
        thread {
            try {
                val endpoint = java.net.URL(apiUrl)
                val host = endpoint.host
                val normalizedPin = normalizePin(certificatePin)

                val client = secureClient(host, normalizedPin)
                val request = Request.Builder()
                    .url(apiUrl)
                    .get()
                    .header("Authorization", authHeader)
                    .build()

                client.newCall(request).execute().use { response ->
                    val code = response.code
                    if (code in 200..299) {
                        val bodyBytes = response.body?.bytes()
                            ?: throw IllegalStateException("Empty response body")
                        val destinationFile = File(destinationPath)
                        destinationFile.parentFile?.mkdirs()
                        destinationFile.writeBytes(bodyBytes)
                    }
                    promise.resolve(code)
                }
            } catch (e: Exception) {
                promise.reject("CLOUD_DOWNLOAD_ERROR", e.message, e)
            }
        }
    }

    private fun secureClient(host: String, certificatePin: String): OkHttpClient {
        val pinner = CertificatePinner.Builder()
            .add(host, certificatePin)
            .build()

        return OkHttpClient.Builder()
            .certificatePinner(pinner)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .build()
    }

    private fun normalizePin(rawPin: String): String {
        val pin = rawPin.trim()
        if (pin.isBlank()) {
            throw IllegalArgumentException("Certificate pin is required")
        }
        return if (pin.startsWith("sha256/")) pin else "sha256/$pin"
    }
}
