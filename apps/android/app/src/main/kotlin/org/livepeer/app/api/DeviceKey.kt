package org.livepeer.app.api

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import kotlinx.coroutines.suspendCancellableCoroutine
import org.livepeer.app.BuildConfig
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Why the console's key couldn't be made or used. */
class DeviceKeyFailure(val kind: Kind) : Exception(kind.name) {
    enum class Kind {
        /** The phone has no fingerprint or face enrolled that is strong enough, or no secure hardware. */
        Unavailable,

        /** The person closed the prompt. */
        Cancelled,

        /** The key is no longer there: never made, or destroyed when the enrolled biometrics changed. */
        Gone,
        Failed,
    }
}

/** The console's key on this phone, as the console's session uses it. */
interface ConsoleKey {
    /** Whether the phone has a fingerprint or face enrolled that can guard the key. */
    val available: Boolean

    /** Makes a new key, replacing any earlier one, and answers with its public half as the instance stores it. */
    fun create(): String

    /** Signs the message after a new fingerprint or face match, showing [reason] in the prompt. base64url of the DER signature. */
    suspend fun sign(message: String, reason: String): String

    fun delete()
}

/**
 * A P-256 private key made in the phone's secure hardware (StrongBox where the phone has it, the trusted
 * execution environment otherwise). It never leaves, and signs only after a class 3 fingerprint or face match
 * made for that one signature. Enrolling a new fingerprint or face destroys it. There is no PIN, pattern or
 * password fallback.
 */
class DeviceKey(private val context: Context, private val alias: String = "operator-device-key") : ConsoleKey {
    override val available: Boolean
        get() {
            val manager = context.getSystemService(BiometricManager::class.java) ?: return false
            @Suppress("DEPRECATION")
            val answer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) else manager.canAuthenticate()
            return answer == BiometricManager.BIOMETRIC_SUCCESS
        }

    /** The public half is the key's SubjectPublicKeyInfo in base64. */
    override fun create(): String {
        delete()
        if (!available) throw DeviceKeyFailure(DeviceKeyFailure.Kind.Unavailable)
        val strongBox = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        val pair = try {
            // A phone that says it has StrongBox can still refuse a key there; the trusted environment is next.
            (if (strongBox) runCatching { generate(strongBox = true) }.getOrNull() else null) ?: generate(strongBox = false)
        } catch (error: Exception) {
            delete()
            throw DeviceKeyFailure(DeviceKeyFailure.Kind.Unavailable)
        }
        // A key held in software can be copied off a rooted phone. Only a development build, which runs in an
        // emulator with no secure hardware, accepts one.
        if (!BuildConfig.DEBUG && !hardwareBacked(pair.private)) {
            delete()
            throw DeviceKeyFailure(DeviceKeyFailure.Kind.Unavailable)
        }
        return Base64.getEncoder().encodeToString(pair.public.encoded)
    }

    private fun generate(strongBox: Boolean) = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE).apply {
        initialize(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .apply {
                    // Every signature needs its own match, and only a class 3 biometric counts: no device credential.
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                    } else {
                        @Suppress("DEPRECATION")
                        setUserAuthenticationValidityDurationSeconds(-1)
                    }
                    if (strongBox) setIsStrongBoxBacked(true)
                }
                .build(),
        )
    }.generateKeyPair()

    /** Whether the private key lives in StrongBox or the trusted execution environment, as the Keystore reports it. */
    private fun hardwareBacked(key: PrivateKey): Boolean {
        val info = runCatching { KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java) }.getOrNull() ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            info.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT || info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
        } else {
            @Suppress("DEPRECATION")
            info.isInsideSecureHardware
        }
    }

    private fun privateKey(): PrivateKey? = runCatching { KeyStore.getInstance(KEYSTORE).apply { load(null) }.getKey(alias, null) as? PrivateKey }.getOrNull()

    override suspend fun sign(message: String, reason: String): String {
        val key = privateKey() ?: throw DeviceKeyFailure(DeviceKeyFailure.Kind.Gone)
        val signature = try {
            Signature.getInstance("SHA256withECDSA").apply { initSign(key) }
        } catch (error: KeyPermanentlyInvalidatedException) {
            // A fingerprint or face was added since the key was made.
            delete()
            throw DeviceKeyFailure(DeviceKeyFailure.Kind.Gone)
        } catch (error: Exception) {
            throw DeviceKeyFailure(DeviceKeyFailure.Kind.Failed)
        }

        return suspendCancellableCoroutine { continuation ->
            val cancel = CancellationSignal()
            continuation.invokeOnCancellation { cancel.cancel() }
            val prompt = BiometricPrompt.Builder(context)
                .setTitle(reason)
                .setNegativeButton("Cancel", context.mainExecutor) { _, _ -> if (continuation.isActive) continuation.resumeWithException(DeviceKeyFailure(DeviceKeyFailure.Kind.Cancelled)) }
                .apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG) }
                .build()
            prompt.authenticate(BiometricPrompt.CryptoObject(signature), cancel, context.mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (!continuation.isActive) return
                    val signed = runCatching {
                        val unlocked = result.cryptoObject?.signature ?: signature
                        unlocked.update(message.toByteArray())
                        OperatorProofs.base64Url(unlocked.sign())
                    }
                    signed.fold({ continuation.resume(it) }, { continuation.resumeWithException(DeviceKeyFailure(DeviceKeyFailure.Kind.Failed)) })
                }

                override fun onAuthenticationError(code: Int, message: CharSequence?) {
                    if (!continuation.isActive) return
                    val kind = when (code) {
                        BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED, BiometricPrompt.BIOMETRIC_ERROR_CANCELED -> DeviceKeyFailure.Kind.Cancelled
                        BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS, BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT, BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE -> DeviceKeyFailure.Kind.Unavailable
                        else -> DeviceKeyFailure.Kind.Failed
                    }
                    continuation.resumeWithException(DeviceKeyFailure(kind))
                }
            })
        }
    }

    override fun delete() {
        runCatching { KeyStore.getInstance(KEYSTORE).apply { load(null) }.deleteEntry(alias) }
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
    }
}
