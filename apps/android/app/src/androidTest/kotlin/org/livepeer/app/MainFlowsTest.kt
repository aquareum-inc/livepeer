package org.livepeer.app

import android.net.Uri
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.livepeer.app.generated.SignInMethodName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The main flows, against a mock-only instance (`MOCK_ONLY=1`, the dev config) at the build's instance address:
 * what a guest can do, and what a signed-in person does most.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(AndroidJUnit4::class)
class MainFlowsTest {
    /** A local instance is a private address; from Android 17 the build needs this to reach it (see the debug manifest). */
    @get:Rule(order = 0)
    val localNetwork: GrantPermissionRule = GrantPermissionRule.grant("android.permission.ACCESS_LOCAL_NETWORK")

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

    private val container get() = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as LivepeerApplication).container
    private var scenario: ActivityScenario<MainActivity>? = null

    /**
     * Animations off, as UI tests run: the aurora and the orb redraw every frame and would keep the screen from
     * ever settling. The app reads this as reduced motion.
     */
    @Before
    fun stillness() {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        for (scale in listOf("animator_duration_scale", "transition_animation_scale", "window_animation_scale")) {
            automation.executeShellCommand("settings put global $scale 0").close()
        }
    }

    @After
    fun close() {
        scenario?.close()
    }

    /**
     * Starts the app signed in or out. Signing in is the app's own native flow without the browser: the app starts
     * it, the test follows the mock provider's redirects to the app's callback, and the app redeems the code.
     */
    private fun launch(signedIn: Boolean) = runBlocking {
        container.account.signOut()
        if (signedIn) {
            val start = container.account.start(SignInMethodName.Email, "adam@example.test")
            container.account.finish(followToApp(start))
        }
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    private suspend fun followToApp(start: Uri): Uri = withContext(Dispatchers.IO) {
        val http = OkHttpClient.Builder().followRedirects(false).build()
        var url = start.toString()
        var cookies = ""
        while (url.startsWith("http")) {
            http.newCall(Request.Builder().url(url).apply { if (cookies.isNotEmpty()) header("Cookie", cookies) }.build()).execute().use { response ->
                response.headers("Set-Cookie").takeIf { it.isNotEmpty() }?.let { set -> cookies = set.joinToString("; ") { it.substringBefore(';') } }
                val location = response.header("Location") ?: error("The sign-in stopped at $url")
                // The instance's own steps are relative or http; the last one is the app's own address.
                url = response.request.url.resolve(location)?.toString() ?: location
            }
        }
        Uri.parse(url)
    }

    private fun waitFor(matcher: androidx.compose.ui.test.SemanticsMatcher, seconds: Long = 15) =
        compose.waitUntilAtLeastOneExists(matcher, seconds * 1000)

    private fun tab(name: String) = compose.onAllNodes(hasText(name)).onFirst()

    @Test
    fun aGuestBrowsesAndIsAskedToSignInAtGenerate() {
        launch(signedIn = false)
        waitFor(hasText("Direct anything."))
        tab("Studio").performClick()
        waitFor(hasContentDescription("Prompt"))
        compose.onNode(hasContentDescription("Prompt")).performTextReplacement("A paper boat drifting down a rain-soaked street")
        compose.onNode(hasContentDescription("Generate", substring = true)).performClick()
        waitFor(hasText("Sign in to generate. Your draft stays here."), 5)
    }

    @Test
    fun generatingInTheStudioRendersAShot() {
        launch(signedIn = true)
        tab("Studio").performClick()
        waitFor(hasContentDescription("Prompt"))
        compose.onNode(hasContentDescription("Prompt")).performTextReplacement("A lighthouse at dusk, slow push in")
        waitFor(hasContentDescription("Generate,", substring = true))
        compose.onNode(hasContentDescription("Generate", substring = true)).performClick()
        waitFor(hasContentDescription("Shot: A lighthouse at dusk, slow push in"), 60)
    }

    @Test
    fun theLibraryAndACharacterOpen() {
        launch(signedIn = true)
        tab("Library").performClick()
        waitFor(hasContentDescription(", video", substring = true))
        tab("Characters").performClick()
        waitFor(hasText("Mara"))
        compose.onAllNodes(hasText("Mara")).onFirst().performClick()
        waitFor(hasContentDescription("More"), 10)
    }

    @Test
    fun settingsShowThePlanAndCredits() {
        launch(signedIn = true)
        waitFor(hasContentDescription("Account, ", substring = true))
        compose.onNode(hasContentDescription("Account, ", substring = true)).performClick()
        waitFor(hasText("Settings"), 5)
        compose.onNode(hasText("Settings")).performClick()
        waitFor(hasText("credits", substring = true, ignoreCase = true), 10)
    }

    @Test
    fun switchingToAWorkspaceAndBack() {
        launch(signedIn = true)
        waitFor(hasContentDescription("Account, ", substring = true))
        compose.onNode(hasContentDescription("Account, ", substring = true)).performClick()
        // The development user is an admin of the seeded workspace.
        waitFor(hasContentDescription("Northlight Studio, workspace", substring = true), 10)
        compose.onNode(hasContentDescription("Northlight Studio, workspace", substring = true)).performClick()

        // The tray closes, and the account button says where the app is working now.
        waitFor(hasContentDescription("working in Northlight Studio", substring = true), 10)
        tab("Library").performClick()
        waitFor(hasContentDescription(", video", substring = true))

        compose.onNode(hasContentDescription("working in Northlight Studio", substring = true)).performClick()
        waitFor(hasContentDescription("personal account", substring = true), 10)
        compose.onNode(hasContentDescription("personal account", substring = true)).performClick()
        compose.waitUntilDoesNotExist(hasContentDescription("working in Northlight Studio", substring = true), 10_000)
    }

    @Test
    fun anInvitationOpensFromTheAccountTray() {
        launch(signedIn = true)
        waitFor(hasContentDescription("Account, ", substring = true))
        compose.onNode(hasContentDescription("Account, ", substring = true)).performClick()
        // The development user has one invitation waiting. Declining it would leave the next run without one,
        // and joining can't be undone from a phone, so this reads the invitation and stops there.
        waitFor(hasContentDescription("Invitation to Harbour Films", substring = true), 10)
        compose.onNode(hasContentDescription("Invitation to Harbour Films", substring = true)).performClick()
        waitFor(hasText("Join Harbour Films"), 10)
        waitFor(hasText("You'll be a member"), 5)
        waitFor(hasText("Decline"), 5)
    }
}
