package org.livepeer.app.alerts

import android.content.Intent
import android.os.UserManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.livepeer.app.LivepeerApplication

/**
 * An alert arriving. The instance sends the words as data and this shows them, whether the app is in front,
 * in the background or not running, so every alert and the stack the system makes of them open the console.
 * With the console open and unlocked nothing is shown: the console reads its screens again and shows what the
 * alert is about. Nothing here calls the instance.
 */
class AlertsService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val alert = Alert.read(message.data) ?: return
        // After a restart and before the first unlock, nothing the app keeps can be read: there is no console to ask.
        if (!getSystemService(UserManager::class.java).isUserUnlocked) return
        val console = (application as LivepeerApplication).container.console
        if (console.watching) {
            console.heard()
            return
        }
        AlertNotifications.show(this, alert)
    }
}

/**
 * What an alert carries: its words, its kind, the place in the console it points at, the channel it arrives
 * in and the line it replaces. Nothing else, and never an address to open.
 */
data class Alert(val title: String, val body: String, val kind: String, val place: Place, val channel: String, val tag: String) {
    /** Where a tapped alert leads. Anything this build doesn't know is Status. */
    enum class Place(val word: String) { Status("status"), Jobs("jobs"), Reports("reports") }

    companion object {
        const val KIND = "kind"
        const val OPENS = "opens"

        /** The kind a tap on the stack of alerts carries: it points at no one alert, so it leads to Status. */
        const val STACK = "stack"

        /**
         * The alert in a message's data, or null when the message isn't one this build can show: it has no
         * words or no kind. A channel this build doesn't know is Service, as a place it doesn't know is Status.
         */
        fun read(data: Map<String, String>): Alert? {
            val body = data["body"]?.takeIf { it.isNotBlank() } ?: return null
            val kind = data[KIND]?.takeIf { it.isNotBlank() } ?: return null
            return Alert(
                title = data["title"].orEmpty(),
                body = body,
                kind = kind,
                place = place(data[OPENS]),
                channel = data["channel"]?.takeIf { it in AlertChannels.ALL } ?: AlertChannels.SERVICE,
                tag = data["tag"]?.takeIf { it.isNotBlank() } ?: "console-$kind",
            )
        }

        /** The place an alert in this intent points at, or null when the intent isn't from an alert. */
        fun place(intent: Intent?): Place? {
            if (intent?.getStringExtra(KIND).isNullOrEmpty()) return null
            return place(intent?.getStringExtra(OPENS))
        }

        fun place(opens: String?): Place = Place.entries.firstOrNull { it.word == opens } ?: Place.Status
    }
}
