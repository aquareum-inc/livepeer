package org.livepeer.app.console

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.livepeer.app.api.ApiError
import org.livepeer.app.api.ConsoleKey
import org.livepeer.app.api.DeviceKeyFailure
import org.livepeer.app.api.OperatorProofs
import org.livepeer.app.api.TokenStore
import org.livepeer.app.generated.InstanceDescription
import org.livepeer.app.generated.Me
import org.livepeer.app.generated.MeRole
import org.livepeer.app.generated.OperatorApi
import org.livepeer.app.generated.OperatorProof
import org.livepeer.app.generated.SignInMethodName
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * The operator's console on this phone: its own session, apart from the user's. Signing in enrols a key made
 * in the phone's secure hardware; the console then opens for a few minutes at a time, each time after a
 * fingerprint or face match. The token alone reads nothing.
 */
class ConsoleSession(
    private val api: OperatorApi,
    private val vault: TokenStore,
    private val key: ConsoleKey,
    private val scope: CoroutineScope,
    /** The instance's address, where sign-in starts. */
    private val baseUrl: String,
    /** How this phone appears in the web console's list of operator phones. */
    private val deviceName: String,
    private val instanceName: () -> String,
    private val refreshInstance: suspend () -> Unit,
    /** The time, in milliseconds: for how long the instance says the console stays open. */
    private val now: () -> Long = System::currentTimeMillis,
    /** Milliseconds that only go forward, for timing the background. */
    private val elapsed: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    enum class Stage {
        /** This phone has no console session. */
        SignedOut,

        /** It has one, and reading needs a new match. */
        Locked,
        Open,
    }

    private val _stage = MutableStateFlow(if (vault.token == null) Stage.SignedOut else Stage.Locked)
    private val _presented = MutableStateFlow(false)
    private val _working = MutableStateFlow(false)
    private val _failure = MutableStateFlow<String?>(null)
    private val _unlocks = MutableStateFlow(0)
    private val _signingIn = MutableStateFlow<SignInMethodName?>(null)

    val stage: StateFlow<Stage> = _stage

    /** Whether the console covers the app. */
    val presented: StateFlow<Boolean> = _presented

    /** Signing in or unlocking is under way. */
    val working: StateFlow<Boolean> = _working

    /** Why the last sign-in or unlock didn't finish, in words to show. */
    val failure: StateFlow<String?> = _failure

    /** Counts each unlock, so screens read again when the console reopens. */
    val unlocks: StateFlow<Int> = _unlocks

    /** The method a sign-in in the browser was started with, until it comes back. */
    val signingIn: StateFlow<SignInMethodName?> = _signingIn

    private class Pending(val verifier: String, val state: String, val publicKey: String)

    private var pending: Pending? = null
    private var relock: Job? = null
    private var leftAt: Long? = null

    /** Whether the phone can open the console at all: a fingerprint or face is set up. */
    val biometrics: Boolean get() = key.available

    /** A console sign-in is in the browser: what comes back from it belongs here, not to the user's sign-in. */
    val awaitingBrowser: Boolean get() = pending != null

    /** Covers the app with the console, asking for a match at once when this phone is already enrolled. */
    fun present() {
        _failure.value = null
        _presented.value = true
        if (_stage.value == Stage.Locked) scope.launch { unlock() }
    }

    /** Back to the app. The console locks behind it. */
    fun dismiss() {
        lock()
        _presented.value = false
    }

    fun lock() {
        relock?.cancel()
        relock = null
        if (_stage.value == Stage.Open) _stage.value = Stage.Locked
    }

    /** The app went to the background. */
    fun left() {
        leftAt = elapsed()
    }

    /** The app came back. More than a minute away locks the console. */
    fun returned() {
        leftAt?.let { if (elapsed() - it > AWAY_LIMIT) lock() }
        leftAt = null
    }

    /** Starting over: what went wrong last time has been read. */
    fun clearFailure() {
        _failure.value = null
    }

    /**
     * Begins a sign-in with one of the instance's own methods: makes this phone's key, and answers with where to
     * send the browser. The instance asks the provider for a new sign-in and refuses anyone it doesn't mark as
     * an operator. Null when the phone can't hold the key, with [failure] saying why.
     */
    fun start(method: SignInMethodName, email: String?): String? {
        if (_working.value) return null
        _failure.value = null
        val publicKey = try {
            if (!key.available) throw DeviceKeyFailure(DeviceKeyFailure.Kind.Unavailable)
            key.create()
        } catch (error: DeviceKeyFailure) {
            _failure.value = NEEDS_BIOMETRICS
            return null
        }
        val verifier = randomText(32)
        val state = randomText(16)
        pending = Pending(verifier, state, publicKey)
        _signingIn.value = method
        _working.value = true
        return (baseUrl.trimEnd('/') + "/auth/start").toHttpUrl().newBuilder()
            .addQueryParameter("method", method.value)
            .addQueryParameter("purpose", "operator")
            .addQueryParameter("client", "android")
            .addQueryParameter("challenge", OperatorProofs.base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())))
            .addQueryParameter("state", state)
            .apply { if (email != null) addQueryParameter("email", email) }
            .build().toString()
    }

    /**
     * The browser came back: with what the instance put in the app's address, or with nothing when the person
     * closed it. A code is exchanged, with the key's public half, for the console session; then the console asks
     * for the match that opens it.
     */
    suspend fun finish(callback: Map<String, String>?) {
        val sent = pending ?: return
        pending = null
        if (callback == null) {
            key.delete()
            _signingIn.value = null
            _working.value = false
            return
        }
        try {
            if (callback["state"] != sent.state) throw SignInRefusal("failed")
            callback["error"]?.let { throw SignInRefusal(it) }
            val code = callback["code"]
            if (callback["purpose"] != "operator" || code == null) throw SignInRefusal("failed")
            val issued = api.createOperatorDeviceSession(code, sent.verifier, "android", sent.publicKey, deviceName)
            vault.set(issued.token)
            _stage.value = Stage.Locked
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            key.delete()
            if ((error as? SignInRefusal)?.reason == "mobile_console_off") scope.launch { refreshInstance() }
            _failure.value = signInMessage(error, instanceName())
            return
        } finally {
            _signingIn.value = null
            _working.value = false
        }
        unlock()
    }

    /** Asks the instance for a nonce, has the phone's key sign it after a match, and opens the console. */
    suspend fun unlock() {
        if (_stage.value != Stage.Locked || _working.value) return
        _working.value = true
        _failure.value = null
        try {
            val challenge = api.createOperatorChallenge("unlock")
            val signature = key.sign(OperatorProofs.unlockMessage(challenge.nonce), "Unlock the console")
            val unlocked = api.unlockOperatorDeviceSession(challenge.nonce, signature)
            opened(ConsoleFormat.millis(unlocked.unlockedUntil))
        } catch (error: CancellationException) {
            throw error
        } catch (error: DeviceKeyFailure) {
            when (error.kind) {
                DeviceKeyFailure.Kind.Cancelled -> Unit
                DeviceKeyFailure.Kind.Gone -> {
                    forget()
                    _failure.value = KEY_GONE
                }
                DeviceKeyFailure.Kind.Unavailable -> _failure.value = NEEDS_BIOMETRICS
                DeviceKeyFailure.Kind.Failed -> _failure.value = "The console didn't unlock. Try again."
            }
        } catch (error: ApiError) {
            refused(error)
            if (_stage.value != Stage.SignedOut) _failure.value = error.message
        } catch (error: IOException) {
            _failure.value = "Can't reach ${instanceName()}. Check your connection."
        } catch (error: Exception) {
            _failure.value = "The console didn't unlock. Try again."
        } finally {
            _working.value = false
        }
    }

    /** One of the console's reads. A refusal that locks or ends the session changes the console at once. */
    suspend fun <T> read(request: suspend (OperatorApi) -> T): T = try {
        request(api)
    } catch (error: ApiError) {
        refused(error)
        throw error
    }

    /**
     * One change, confirmed: the instance gives a nonce for exactly this operation and input, the phone's key
     * signs it after a new fingerprint or face match, and the change is sent with that proof. Nothing here
     * assumes the change happened: the caller updates the screen from the instance's answer. Throws a
     * [DeviceKeyFailure] of kind Cancelled when the person closes the prompt.
     */
    suspend fun <T> confirm(operation: String, input: Map<String, JsonElement>, reason: String, change: suspend (OperatorApi, OperatorProof) -> T): T {
        try {
            val hash = OperatorProofs.inputHash(input)
            val challenge = api.createOperatorChallenge(operation, hash)
            val signature = try {
                key.sign(OperatorProofs.confirmMessage(challenge.nonce, operation, hash), reason)
            } catch (error: DeviceKeyFailure) {
                if (error.kind == DeviceKeyFailure.Kind.Gone) {
                    forget()
                    _failure.value = KEY_GONE
                }
                throw error
            }
            return change(api, OperatorProof(challenge.nonce, signature))
        } catch (error: ApiError) {
            refused(error)
            throw error
        }
    }

    /**
     * Signs this phone out of the console: ends the session on the instance, then drops the token and the key.
     * Signed out here even when the instance can't be reached.
     */
    suspend fun signOut() {
        try {
            api.deleteOperatorDeviceSession()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // Signed out on this phone all the same.
        }
        forget()
        _failure.value = null
    }

    private fun opened(until: Long?) {
        _stage.value = Stage.Open
        _unlocks.value += 1
        val open = ((until?.minus(now())) ?: LONGEST_OPEN).coerceIn(1_000, LONGEST_OPEN)
        relock?.cancel()
        relock = scope.launch {
            delay(open)
            lock()
        }
    }

    private fun refused(error: ApiError) {
        when {
            error.code == "locked" -> lock()
            // The change was refused and the session stands; the caller says so.
            error.code == "proof_required" -> Unit
            error.status == 401 || error.code == "mobile_console_off" || error.code == "operator_session" -> {
                forget()
                if (error.code == "mobile_console_off") {
                    _failure.value = "${instanceName()} doesn't offer its console on phones."
                    scope.launch { refreshInstance() }
                } else {
                    _failure.value = "The console was signed out on this phone. Sign in again."
                }
            }
        }
    }

    /** The session is over on the instance: drop the token and the key it was bound to. */
    private fun forget() {
        relock?.cancel()
        relock = null
        vault.set(null)
        key.delete()
        _stage.value = Stage.SignedOut
    }

    /** The instance sent the person back without a code, and said why. */
    class SignInRefusal(val reason: String) : Exception(reason)

    companion object {
        /** How long the app can be in the background before the console locks itself. */
        const val AWAY_LIMIT = 60_000L

        /** The longest the console stays open on one match, whatever the instance says. */
        const val LONGEST_OPEN = 300_000L

        const val NEEDS_BIOMETRICS = "The console needs a fingerprint or face unlock. Set one up in Settings, or use the console on the web."
        const val KEY_GONE = "This phone's console key is gone. Sign in again."

        private val random = SecureRandom()
        private fun randomText(bytes: Int): String = OperatorProofs.base64Url(ByteArray(bytes).also(random::nextBytes))

        /**
         * Whether to show someone the way in: they are signed in as a person who runs the instance, and the
         * instance serves its console to phones. Offering is not access: the instance decides that at the
         * console's own sign-in and on every request.
         */
        fun offered(me: Me?, instance: InstanceDescription?): Boolean = me?.role == MeRole.Operator && instance?.surfaces?.mobileConsole == true

        fun signInMessage(error: Exception, instance: String): String = when (error) {
            is SignInRefusal -> when (error.reason) {
                "not_operator" -> "This account doesn't run $instance."
                "mobile_console_off" -> "$instance doesn't offer its console on phones."
                "method" -> "That way of signing in isn't offered here."
                else -> "Sign-in didn't finish. Try again."
            }
            is ApiError -> error.message
            else -> "Sign-in didn't finish. Check your connection and try again."
        }

        /** Why a change didn't happen, in words to show under it. */
        fun changeMessage(error: Exception, instance: String): String = when {
            error is ApiError -> error.message
            error is IOException -> "Can't reach $instance. Nothing was changed."
            error is DeviceKeyFailure && error.kind == DeviceKeyFailure.Kind.Unavailable -> NEEDS_BIOMETRICS
            else -> "That wasn't confirmed, so nothing was changed. Try again."
        }
    }
}
