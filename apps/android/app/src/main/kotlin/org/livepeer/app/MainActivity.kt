package org.livepeer.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.browser.auth.AuthTabIntent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import org.livepeer.app.alerts.Alert
import org.livepeer.app.console.ConsoleSession
import org.livepeer.app.design.LocalDarkTheme
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.resolved
import org.livepeer.app.generated.Palette
import org.livepeer.app.shell.LivepeerRoot
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val container get() = (application as LivepeerApplication).container

    /** Sign-in in an Auth Tab. Where the browser has none, it opens as a Custom Tab and comes back through [onNewIntent]. */
    private lateinit var signIn: ActivityResultLauncher<Intent>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        signIn = AuthTabIntent.registerActivityResultLauncher(this) { result ->
            lifecycleScope.launch { finishSignIn(if (result.resultCode == AuthTabIntent.RESULT_OK) result.resultUri else null) }
        }
        intent?.let(::returnFromBrowser)
        intent?.let(::openedFromAlert)

        setContent {
            val instance by container.instance.description.collectAsStateWithLifecycle()
            val choice by container.theme.choice.collectAsStateWithLifecycle()
            val dark = when (choice) {
                ThemePreference.Choice.Dark -> true
                ThemePreference.Choice.Light -> false
                ThemePreference.Choice.System -> isSystemInDarkTheme()
            }
            val palette = Palette.resolved(dark, (if (dark) instance?.theme?.dark else instance?.theme?.light).orEmpty())

            DisposableEffect(dark) {
                val bars = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
                onDispose {}
            }
            val consoleUp by container.console.session.presented.collectAsStateWithLifecycle()
            LaunchedEffect(consoleUp) { hideFromRecents(consoleUp) }
            // The description and the account are read again each time the app comes to the front.
            LifecycleResumeEffect(Unit) {
                lifecycleScope.launch {
                    container.instance.refresh()
                    container.account.refresh()
                }
                onPauseOrDispose {}
            }

            CompositionLocalProvider(LocalPalette provides palette, LocalDarkTheme provides dark) {
                LivepeerRoot(container) { uri -> AuthTabIntent.Builder().build().launch(signIn, uri, BuildConfig.APPLICATION_ID) }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        returnFromBrowser(intent)
        openedFromAlert(intent)
    }

    /**
     * An alert was tapped. It brings up the console's cover, which asks for the match, and names one of three
     * places to go to after it. Nothing else is read from it, and nothing happens on a phone the console has
     * never been offered to.
     */
    private fun openedFromAlert(intent: Intent) {
        val place = Alert.place(intent) ?: return
        setIntent(Intent(this, MainActivity::class.java))
        val console = container.console
        val enrolled = console.session.stage.value != ConsoleSession.Stage.SignedOut
        if (enrolled || ConsoleSession.offered(container.account.me.value, container.instance.description.value) || InstanceStore.consoleOnly(container.instance.description.value)) console.arrive(place)
    }

    /** A Custom Tab returning to this app's own address at the end of a sign-in. */
    private fun returnFromBrowser(intent: Intent) {
        val uri: Uri = intent.data ?: return
        if (uri.scheme != BuildConfig.APPLICATION_ID || uri.host != "auth") return
        setIntent(Intent(this, MainActivity::class.java))
        lifecycleScope.launch { finishSignIn(uri) }
    }

    /** The browser came back from a sign-in: the console's when it started one, the user's otherwise. */
    private suspend fun finishSignIn(callback: Uri?) {
        val console = container.console.session
        if (console.awaitingBrowser) {
            console.finish(callback?.let { uri -> uri.queryParameterNames.associateWith { uri.getQueryParameter(it).orEmpty() } })
        } else {
            container.account.finish(callback)
        }
    }

    override fun onStop() {
        super.onStop()
        container.console.session.left()
    }

    override fun onStart() {
        super.onStart()
        container.console.session.returned()
    }

    /**
     * Keeps the console out of the app switcher's picture of the app. From Android 13 the system can be told
     * to leave that picture blank; before it, the only way is a window that can't be captured at all.
     */
    private fun hideFromRecents(hidden: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(!hidden)
        } else if (hidden) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
