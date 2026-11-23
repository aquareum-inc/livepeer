package org.livepeer.app.alerts

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.livepeer.app.MainActivity
import org.livepeer.app.R

/**
 * The console's alerts as the system shows them: one line per kind, stacked under a summary of the app's own.
 * A tap on a line opens the console at the place it points at; a tap on the stack opens it at Status. Left to
 * itself the system makes a summary of its own, which opens the user app and says nothing of the console.
 */
object AlertNotifications {
    private const val STACK_KEY = "console"
    private const val STACK_TAG = "console-stack"

    fun show(context: Context, alert: Alert) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        AlertChannels.create(context)
        // The system heads every notification with the app's name. The instance's name under it would say it twice.
        val title = alert.title.takeIf { it.isNotBlank() && it != context.applicationInfo.loadLabel(context.packageManager).toString() }
        val line = NotificationCompat.Builder(context, alert.channel)
            .setSmallIcon(R.drawable.ic_alert)
            .setContentTitle(title)
            .setContentText(alert.body)
            .setAutoCancel(true)
            .setGroup(STACK_KEY)
            .setContentIntent(opening(context, alert.kind, alert.place))
            .build()
        // Only the lines make themselves heard. The summary is there to hold them and to be tapped.
        val stack = NotificationCompat.Builder(context, alert.channel)
            .setSmallIcon(R.drawable.ic_alert)
            .setContentTitle(title)
            .setAutoCancel(true)
            .setGroup(STACK_KEY)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setContentIntent(opening(context, Alert.STACK, Alert.Place.Status))
            .build()
        try {
            // One line per kind: a newer alert of a kind replaces the older one.
            manager.notify(alert.tag, 0, line)
            manager.notify(STACK_TAG, 0, stack)
        } catch (refused: SecurityException) {
            // Notifications were switched off between the check and here; there is nothing to show.
        }
    }

    /** Takes the summary away once no line is left under it, so an empty stack never sits in the shade. */
    fun tidy(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val shown = manager.activeNotifications.filter { it.notification.group == STACK_KEY }
        if (shown.isNotEmpty() && shown.all { it.tag == STACK_TAG }) manager.cancel(STACK_TAG, 0)
    }

    private fun opening(context: Context, kind: String, place: Alert.Place): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(Alert.KIND, kind)
            .putExtra(Alert.OPENS, place.word)
        return PendingIntent.getActivity(context, kind.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
