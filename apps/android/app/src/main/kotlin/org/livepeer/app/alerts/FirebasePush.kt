package org.livepeer.app.alerts

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailabilityLight
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import org.livepeer.app.console.PushDevice
import org.livepeer.app.console.PushSupport
import org.livepeer.app.console.PushUnavailable
import org.livepeer.app.generated.InstanceFirebase
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Alerts on Android arrive through Firebase Cloud Messaging. The build carries nothing of any Firebase project:
 * the instance says which one in its description, and the app starts Firebase from that. It is started when
 * the app starts, from the cached description, so an alert that arrives while the app isn't running is shown;
 * no push token is asked for until the operator turns alerts on.
 */
class FirebasePush(private val context: Context, private val project: () -> InstanceFirebase?) : PushDevice {
    override val support: PushSupport
        get() = when {
            project() == null -> PushSupport.NotSetUp
            GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(context) != ConnectionResult.SUCCESS -> PushSupport.NoPlayServices
            else -> PushSupport.Ready
        }

    override val allowed: Boolean get() = NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** Starts Firebase with the instance's project, once. False while the instance hasn't named one. */
    fun start(): Boolean {
        if (FirebaseApp.getApps(context).isNotEmpty()) return true
        val values = project() ?: return false
        FirebaseApp.initializeApp(context, FirebaseOptions.Builder().setProjectId(values.projectId).setApplicationId(values.appId).setApiKey(values.apiKey).setGcmSenderId(values.senderId).build())
        return true
    }

    override suspend fun token(): String {
        if (support != PushSupport.Ready || !start()) throw PushUnavailable()
        return try {
            FirebaseMessaging.getInstance().token.await().takeIf { it.isNotEmpty() } ?: throw PushUnavailable()
        } catch (error: PushUnavailable) {
            throw error
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: Exception) {
            throw PushUnavailable()
        }
    }

    override fun prepare() = AlertChannels.create(context)

    override fun forget() {
        // Nothing was ever asked for unless Firebase was started.
        if (FirebaseApp.getApps(context).isNotEmpty()) FirebaseMessaging.getInstance().deleteToken()
    }
}

/** Waits for one of Google's tasks without a library for it. */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
        val failure = task.exception
        if (failure != null) continuation.resumeWithException(failure) else if (task.isCanceled) continuation.cancel() else continuation.resume(task.result)
    }
}
