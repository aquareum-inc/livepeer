package org.livepeer.app.api

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Where a session's token is kept on this device. */
interface TokenStore {
    val token: String?

    /** Stores a new token, or removes it with null. */
    fun set(value: String?)
}

/**
 * Holds a session token, encrypted with a key that never leaves the Android Keystore, so the stored copy is
 * useless off this device. The app is excluded from backups, and a copy is kept in memory for the transport to
 * read. The user's device session and the operator's console session each have a vault of their own: a
 * separate file and a separate key.
 */
class TokenVault(context: Context, name: String = USER, private val alias: String = "device-session") : TokenStore {
    private val store = context.getSharedPreferences(name, Context.MODE_PRIVATE)

    @Volatile
    override var token: String? = read()
        private set

    override fun set(value: String?) {
        token = value
        if (value == null) {
            store.edit().remove(KEY).apply()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.iv + cipher.doFinal(value.toByteArray())
        store.edit().putString(KEY, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply()
    }

    private fun read(): String? = runCatching {
        val sealed = Base64.decode(store.getString(KEY, null) ?: return null, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, IV_BYTES)) }
        String(cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES))
    }.getOrNull()

    private fun key(): SecretKey {
        val keystore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keystore.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply { init(spec) }.generateKey()
    }

    companion object {
        /** The user's device session. */
        const val USER = "session"

        /** The operator's console session on this phone: its own entry, apart from the user's. */
        fun operator(context: Context) = TokenVault(context, name = "operator-session", alias = "operator-device-session")

        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY = "token"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_BYTES = 12
    }
}
