package com.aegisandroid

import android.os.Build
import androidx.core.content.ContextCompat
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PasskeyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PasskeyModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && reactContext.currentActivity != null,
        )
    }

    @ReactMethod
    fun createPasskey(requestJson: String, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is not available.")
            return
        }

        val request = CreatePublicKeyCredentialRequest(requestJson)
        val credentialManager = CredentialManager.create(activity)

        credentialManager.createCredentialAsync(
            context = activity,
            request = request,
            cancellationSignal = null,
            executor = ContextCompat.getMainExecutor(activity),
            callback =
                object :
                    CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                    override fun onResult(result: CreateCredentialResponse) {
                        if (result !is CreatePublicKeyCredentialResponse) {
                            promise.reject(
                                "E_CREATE_PASSKEY",
                                "Credential provider returned an unsupported response.",
                            )
                            return
                        }

                        val map = Arguments.createMap()
                        map.putString(
                            "registrationResponseJson",
                            result.registrationResponseJson,
                        )
                        promise.resolve(map)
                    }

                    override fun onError(error: CreateCredentialException) {
                        promise.reject("E_CREATE_PASSKEY", error.message, error)
                    }
                },
        )
    }

    @ReactMethod
    fun authenticatePasskey(requestJson: String, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is not available.")
            return
        }

        val option = GetPublicKeyCredentialOption(requestJson)
        val request = GetCredentialRequest(listOf(option))
        val credentialManager = CredentialManager.create(activity)

        credentialManager.getCredentialAsync(
            context = activity,
            request = request,
            cancellationSignal = null,
            executor = ContextCompat.getMainExecutor(activity),
            callback =
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) {
                        val credential = result.credential
                        if (credential !is PublicKeyCredential) {
                            promise.reject(
                                "E_AUTH_PASSKEY",
                                "Credential provider returned an unsupported credential.",
                            )
                            return
                        }

                        val map = Arguments.createMap()
                        map.putString(
                            "authenticationResponseJson",
                            credential.authenticationResponseJson,
                        )
                        promise.resolve(map)
                    }

                    override fun onError(error: GetCredentialException) {
                        promise.reject("E_AUTH_PASSKEY", error.message, error)
                    }
                },
        )
    }
}
