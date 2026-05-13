package com.aegisandroid

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import kotlin.concurrent.thread

class DownloadExportModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DownloadExport"

    @ReactMethod
    fun saveTextToDownloads(fileName: String, content: String, mimeType: String, promise: Promise) {
        thread {
            try {
                val safeName = fileName.replace(Regex("""[<>:"/\\|?*]+"""), "_")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = reactContext.contentResolver
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType.ifBlank { "application/octet-stream" })
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/AegisVault")
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("Downloads MediaStore insert failed")
                    resolver.openOutputStream(uri)?.use { output ->
                        output.write(content.toByteArray(Charsets.UTF_8))
                    } ?: throw IllegalStateException("Downloads output stream could not be opened")
                    val done = ContentValues().apply {
                        put(MediaStore.Downloads.IS_PENDING, 0)
                    }
                    resolver.update(uri, done, null, null)
                    promise.resolve("Downloads/AegisVault/$safeName")
                    return@thread
                }

                val dir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "AegisVault",
                )
                if (!dir.exists() && !dir.mkdirs()) {
                    throw IllegalStateException("Downloads directory could not be created")
                }
                val outFile = File(dir, safeName)
                outFile.writeText(content, Charsets.UTF_8)
                promise.resolve(outFile.absolutePath)
            } catch (e: Exception) {
                promise.reject("E_DOWNLOAD_EXPORT", e.message, e)
            }
        }
    }
}
