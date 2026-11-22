package org.livepeer.app.alerts

import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.content.Context

/**
 * Where the console's alerts arrive, named for the person who will find them in the system's settings. The
 * ids are the ones the instance sends. Service may make itself heard at once; the others arrive quietly.
 * On an instance with both surfaces this keeps an operator's alerts apart from anything the app sends users.
 */
object AlertChannels {
    const val SERVICE = "console_service"
    const val REPORTS = "console_reports"
    const val SIGN_INS = "console_sign_ins"
    private const val GROUP = "console"

    /** Makes the channels. Safe to call again: the system keeps what the person has since changed. */
    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannelGroup(NotificationChannelGroup(GROUP, "Console"))
        val channel = { id: String, name: String, about: String, importance: Int ->
            NotificationChannel(id, name, importance).apply {
                description = about
                group = GROUP
            }
        }
        manager.createNotificationChannels(
            listOf(
                channel(SERVICE, "Service", "The engine isn't ready, or jobs are failing.", NotificationManager.IMPORTANCE_HIGH),
                channel(REPORTS, "Reports", "A report is waiting.", NotificationManager.IMPORTANCE_DEFAULT),
                channel(SIGN_INS, "Console sign-ins", "A phone was added to the console, or this phone's alerts are about to end.", NotificationManager.IMPORTANCE_DEFAULT),
            ),
        )
    }
}
