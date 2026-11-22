package org.livepeer.app.alerts

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.UserManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.livepeer.app.LivepeerApplication
import org.livepeer.app.MainActivity
import org.livepeer.app.R

/**
 * An alert that arrives while the app is in front. The system shows alerts itself when the app is in the
 * background or not running; in front, it hands them here. With the console open there is no banner: the
 * console reads its screens again and shows what the alert is about. Otherwise the alert is shown as it
 * would have been.
 */
class AlertsService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val alert = message.notification ?: return
        // After a restart and before the first unlock, nothing the app keeps can be read: there is no console to ask.
        if (!getSystemService(UserManager::class.java).isUserUnlocked) return
        val console = (application as LivepeerApplication).container.console
        if (console.watching) {
            console.heard()
            return
        }
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return
        AlertChannels.create(this)
        val notification = NotificationCompat.Builder(this, alert.channelId ?: AlertChannels.SERVICE)
            .setSmallIcon(R.drawable.ic_alert)
            .setContentTitle(alert.title)
            .setContentText(alert.body)
            .setAutoCancel(true)
            .setContentIntent(opening(this, message.data[Alert.KIND], message.data[Alert.OPENS]))
            .build()
        // One line per kind: a newer alert of a kind replaces the older one.
        try {
            NotificationManagerCompat.from(this).notify(alert.tag, 0, notification)
        } catch (refused: SecurityException) {
            // Notifications were switched off between the check and here; there is nothing to show.
        }
    }

    private fun opening(context: Context, kind: String?, opens: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra(Alert.KIND, kind).putExtra(Alert.OPENS, opens)
        return PendingIntent.getActivity(context, (kind ?: "").hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}

/**
 * What an alert carries besides its words: its kind, and the place in the console it points at. Nothing else,
 * and never an address to open. The same two values arrive whether the system showed the alert or this app did.
 */
object Alert {
    const val KIND = "kind"
    const val OPENS = "opens"

    /** Where a tapped alert leads. Anything this build doesn't know is Status. */
    enum class Place { Status, Jobs, Reports }

    /** The place an alert in this intent points at, or null when the intent isn't from an alert. */
    fun place(intent: Intent?): Place? {
        if (intent?.getStringExtra(KIND).isNullOrEmpty()) return null
        return place(intent?.getStringExtra(OPENS))
    }

    fun place(opens: String?): Place = when (opens) {
        "jobs" -> Place.Jobs
        "reports" -> Place.Reports
        else -> Place.Status
    }
}
