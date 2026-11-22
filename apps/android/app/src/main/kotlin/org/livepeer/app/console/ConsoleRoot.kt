package org.livepeer.app.console

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ListAlt
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.MonitorHeart
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.People
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.livepeer.app.AppContainer
import org.livepeer.app.R
import org.livepeer.app.account.SignInOptions
import org.livepeer.app.design.BrandSymbol
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.Tray
import org.livepeer.app.design.pressable
import org.livepeer.app.design.rememberMotion
import org.livepeer.app.design.style
import org.livepeer.app.generated.OperatorApi
import org.livepeer.app.generated.OperatorAttentionKind
import org.livepeer.app.generated.OperatorAttentionOpens
import org.livepeer.app.generated.TypeSize

/** The console's session on this phone and what its four screens show. */
class Console(val session: ConsoleSession) {
    val status = StatusModel { session.read { it.operatorStatus() } }
    val jobs = JobsModel { status, before, limit -> session.read { it.operatorListJobs(limit.toDouble(), status, before) } }
    val reports = ReportsModel(
        read = { session.read { it.operatorListReports() } },
        resolve = { report, outcome ->
            session.confirm("operator_resolve_report", OperatorApi.operatorResolveReportInput(report.id, outcome.value), outcome.prompt(report)) { api, proof ->
                api.operatorResolveReport(report.id, outcome.value, proof)
            }
        },
    )
    val users = UsersModel(
        read = { query -> session.read { it.operatorListUsers(query) } },
        setStatus = { user, status ->
            session.confirm("operator_set_user_status", OperatorApi.operatorSetUserStatusInput(user.actorId, status.value, user.applicationId), status.prompt(user)) { api, proof ->
                api.operatorSetUserStatus(user.actorId, status.value, user.applicationId, proof).ok
            }
        },
    )

    val more = MoreModels(session)

    /** Reads every screen again: what was on screen before the console was last locked may be minutes old. */
    suspend fun load() = coroutineScope {
        launch { status.load() }
        launch { jobs.load() }
        launch { reports.load() }
        launch { users.load() }
    }
}

/**
 * The console, covering the whole app: its own place with its own tabs, never a tab among the user's. Until
 * this phone is signed in and unlocked, a cover is drawn over it and no data shows behind.
 */
@Composable
fun ConsoleRoot(container: AppContainer, consoleOnly: Boolean, openBrowser: (Uri) -> Unit) {
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val session = container.console.session
    val stage by session.stage.collectAsStateWithLifecycle()
    val unlocks by session.unlocks.collectAsStateWithLifecycle()
    val description by container.instance.description.collectAsStateWithLifecycle()
    val symbol by container.instance.symbol.collectAsStateWithLifecycle()
    val name = description?.name ?: LocalContext.current.getString(R.string.app_name)
    // An instance with no user app has nowhere to go back to.
    val back: (() -> Unit)? = if (consoleOnly) null else session::dismiss

    CompositionLocalProvider(LocalInstanceMark provides symbol, LocalInstanceName provides name) {
        // Nothing under the console answers a touch while it is up.
        Box(Modifier.fillMaxSize().background(palette.background).pointerInput(Unit) {}) {
            // The tabs stay where they were while the console is locked, under the cover, so unlocking returns
            // to the same place.
            if (stage != ConsoleSession.Stage.SignedOut && unlocks > 0) {
                Box(if (stage == ConsoleSession.Stage.Open) Modifier else Modifier.alpha(0f).clearAndSetSemantics {}) { ConsoleTabs(container.console, back) }
            }
            AnimatedVisibility(stage != ConsoleSession.Stage.Open, enter = fadeIn(motion.enter()), exit = fadeOut(motion.exit())) {
                ConsoleGate(container, back, openBrowser)
            }
        }
    }
    BackHandler(enabled = back != null && stage != ConsoleSession.Stage.Open) { session.dismiss() }
}

/**
 * The lock screen, and for a phone that isn't enrolled, the way in: the mark, one sentence, one ink button.
 * A phone with no fingerprint or face set up is told so, and offered nothing to press.
 */
@Composable
private fun ConsoleGate(container: AppContainer, back: (() -> Unit)?, openBrowser: (Uri) -> Unit) {
    val palette = LocalPalette.current
    val session = container.console.session
    val scope = rememberCoroutineScope()
    val stage by session.stage.collectAsStateWithLifecycle()
    val working by session.working.collectAsStateWithLifecycle()
    val failure by session.failure.collectAsStateWithLifecycle()
    var signingIn by rememberSaveable { mutableStateOf(false) }
    val signedOut = stage == ConsoleSession.Stage.SignedOut
    // Read again each time the app comes back: a fingerprint may have been set up in Settings since.
    var biometrics by remember { mutableStateOf(session.biometrics) }
    LifecycleResumeEffect(stage, working) {
        biometrics = session.biometrics
        onPauseOrDispose {}
    }

    // Signed in: the tray has done its job, and the match that opens the console follows.
    LaunchedEffect(signedOut) { if (!signedOut) signingIn = false }

    Column(Modifier.fillMaxSize().background(palette.background).pointerInput(Unit) {}.safeDrawingPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 32.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BrandSymbol(LocalInstanceMark.current, LocalInstanceName.current, palette.foreground, Modifier.size(44.dp))
            BasicText("CONSOLE", style = TypeSize.Caption.style(FontWeight.Medium, mono = true).copy(color = palette.mutedForeground, letterSpacing = 1.6.sp), modifier = Modifier.clearAndSetSemantics {})
            BasicText(
                if (signedOut) "Sign in to run ${LocalInstanceName.current}" else "Unlock the console",
                style = TypeSize.Title.style(FontWeight.SemiBold).copy(color = palette.foreground, textAlign = TextAlign.Center),
                modifier = Modifier.semantics { heading() },
            )
            if (!biometrics) {
                BasicText(ConsoleSession.NEEDS_BIOMETRICS, style = TypeSize.Body.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
            } else if (signedOut) {
                BasicText("For the people who run this service. It opens with your fingerprint or face on this phone.", style = TypeSize.Body.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
            }
            failure?.takeIf { !signingIn }?.let {
                BasicText(it, style = TypeSize.Body.style().copy(color = palette.destructive, textAlign = TextAlign.Center), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            }
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (biometrics) {
                PrimaryButton(if (signedOut) "Sign in" else "Unlock", busy = working && !signingIn) {
                    if (signedOut) {
                        session.clearFailure()
                        signingIn = true
                    } else {
                        scope.launch { session.unlock() }
                    }
                }
            }
            if (back != null) {
                Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(onClick = back), contentAlignment = Alignment.Center) {
                    BasicText("Back to the app", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.mutedForeground))
                }
            }
        }
    }

    if (signingIn) {
        Tray("Sign in to the console", onDismiss = { signingIn = false }) { ConsoleSignIn(container, consoleOnly = back == null, openBrowser) }
    }
}

/**
 * The console's own sign-in: the instance's methods, a new sign-in at the provider every time, and only for
 * an account that runs the instance.
 */
@Composable
private fun ConsoleSignIn(container: AppContainer, consoleOnly: Boolean, openBrowser: (Uri) -> Unit) {
    val palette = LocalPalette.current
    val session = container.console.session
    val description by container.instance.description.collectAsStateWithLifecycle()
    val me by container.account.me.collectAsStateWithLifecycle()
    val working by session.working.collectAsStateWithLifecycle()
    val method by session.signingIn.collectAsStateWithLifecycle()
    val failure by session.failure.collectAsStateWithLifecycle()

    // Where there is a user app, the person may already be signed in to it, and is told this is separate.
    BasicText(
        if (consoleOnly) "Only accounts that run this service can open the console." else "You'll sign in again, even if you're signed in to the app. Only accounts that run this service can open the console.",
        style = TypeSize.Body.style().copy(color = palette.mutedForeground),
    )
    SignInOptions(description?.signIn?.methods.orEmpty(), busy = method, enabled = !working, suggestedEmail = me?.email.orEmpty()) { chosen, email ->
        session.start(chosen, email)?.let { openBrowser(Uri.parse(it)) }
    }
    failure?.let { BasicText(it, style = TypeSize.Body.style().copy(color = palette.destructive), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
}

private enum class ConsoleTab(val route: String, val label: String, val icon: ImageVector) {
    Status("status", "Status", Icons.Rounded.MonitorHeart),
    Jobs("jobs", "Jobs", Icons.AutoMirrored.Rounded.ListAlt),
    Reports("reports", "Reports", Icons.Rounded.Flag),
    Users("users", "Users", Icons.Rounded.People),
    More("more", "More", Icons.Rounded.MoreHoriz),
}

/** The console's own navigation bar: is anything wrong, what ran, what was reported, who uses it, and the numbers. */
@Composable
private fun ConsoleTabs(console: Console, back: (() -> Unit)?) {
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val session = console.session
    val navigation = rememberNavController()
    val entry by navigation.currentBackStackEntryAsState()
    val unlocks by session.unlocks.collectAsStateWithLifecycle()
    val reports by console.reports.state.collectAsStateWithLifecycle()
    val users by console.users.state.collectAsStateWithLifecycle()
    val waiting = reports.waiting.size

    // Read again each time the console is unlocked.
    LaunchedEffect(unlocks) { console.load() }
    // A decision changes what Status says is waiting, so it is read again once the instance has made one.
    LaunchedEffect(reports.changes) { if (reports.changes > 0) console.status.load() }
    // When Status hears of a different number of waiting reports than the queue holds, the queue is read again,
    // so the count on the Reports tab never disagrees with the sentence on Status.
    val status by console.status.state.collectAsStateWithLifecycle()
    val reported = status.status?.let { answer -> answer.attention.firstOrNull { it.kind == OperatorAttentionKind.ReportsWaiting }?.count?.toInt() ?: 0 }
    LaunchedEffect(reported) { if (reported != null && reported != console.reports.state.value.waiting.size) console.reports.load() }
    // One haptic for each change the instance confirmed.
    var felt by remember { mutableIntStateOf(reports.changes + users.changes) }
    LaunchedEffect(reports.changes + users.changes) {
        if (reports.changes + users.changes > felt) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        felt = reports.changes + users.changes
    }

    val go: (ConsoleTab) -> Unit = { tab ->
        navigation.navigate(tab.route) {
            popUpTo(navigation.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    val onTab = ConsoleTab.entries.any { it.route == entry?.destination?.route }
    val leave: () -> Unit = { navigation.popBackStack() }

    Scaffold(
        containerColor = palette.background,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (onTab) {
                NavigationBar(containerColor = palette.panel, contentColor = palette.foreground) {
                    for (tab in ConsoleTab.entries) {
                        val count = if (tab == ConsoleTab.Reports) waiting else 0
                        NavigationBarItem(
                            selected = entry?.destination?.route == tab.route,
                            onClick = { go(tab) },
                            icon = {
                                // Waiting work is ink, never red: a report in the queue isn't an outage.
                                BadgedBox(badge = { if (count > 0) Badge(containerColor = palette.primary, contentColor = palette.primaryForeground) { Text(count.toString(), style = barStyle(TypeSize.Caption, FontWeight.Medium, mono = true)) } }) {
                                    Icon(tab.icon, contentDescription = null)
                                }
                            },
                            // Five labels share the bar, so they stop growing where the bar's other text does and stay one size.
                            label = { Text(tab.label, maxLines = 1, softWrap = false, style = barStyle(TypeSize.Caption, FontWeight.Medium)) },
                            modifier = if (count > 0) Modifier.semantics { contentDescription = "${tab.label}, $count waiting" } else Modifier,
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = palette.foreground,
                                selectedTextColor = palette.foreground,
                                unselectedIconColor = palette.mutedForeground,
                                unselectedTextColor = palette.mutedForeground,
                                indicatorColor = palette.active,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navigation,
            startDestination = ConsoleTab.Status.route,
            modifier = Modifier.padding(bottom = padding.calculateBottomPadding()).consumeWindowInsets(padding),
            enterTransition = { fadeIn(motion.enter()) },
            exitTransition = { fadeOut(motion.exit()) },
        ) {
            composable(ConsoleTab.Status.route) {
                StatusScreen(console.status, back, signOut = session::signOut) { place ->
                    // Goes to where something that needs attention is dealt with.
                    when (place) {
                        OperatorAttentionOpens.Jobs -> {
                            go(ConsoleTab.Jobs)
                            scope.launch { console.jobs.show(JobFilter.Failed) }
                        }
                        OperatorAttentionOpens.Reports -> go(ConsoleTab.Reports)
                        OperatorAttentionOpens.Status, OperatorAttentionOpens.Unknown -> Unit
                    }
                }
            }
            composable(ConsoleTab.Jobs.route) { JobsScreen(console.jobs, back) { navigation.navigate("job/${Uri.encode(it.id)}") } }
            composable(ConsoleTab.Reports.route) { ReportsScreen(console.reports, back) { navigation.navigate("report/${Uri.encode(it.id)}") } }
            composable(ConsoleTab.Users.route) { UsersScreen(console.users, back) { navigation.navigate("user/${Uri.encode(it.actorId)}") } }
            composable(ConsoleTab.More.route) { MoreScreen(back) { navigation.navigate("more/${it.route}") } }
            composable("more/{page}") { entry ->
                when (MorePage.entries.firstOrNull { it.route == entry.arguments?.getString("page") }) {
                    MorePage.Revenue -> RevenueScreen(console.more.overview, unlocks, leave)
                    MorePage.Costs -> CostsScreen(console.more.costs, unlocks, leave)
                    MorePage.Grants -> GrantsScreen(console.more.grants, unlocks, leave)
                    MorePage.Plans -> PlansScreen(console.more.plans, unlocks, leave)
                    MorePage.Compute -> ComputeScreen(console.more.compute, unlocks, leave)
                    MorePage.Offered -> OfferedScreen(console.more.offered, unlocks, leave)
                    MorePage.System -> SystemScreen(console.more.health, unlocks, leave)
                    null -> Spacer(Modifier.fillMaxSize())
                }
            }
            composable("job/{id}") { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                // The job as it was when its row was pressed: a refresh of the list doesn't change the page under the reader.
                val job = remember(id) { console.jobs.job(id) }
                if (job != null) JobDetailScreen(job, leave) else Spacer(Modifier.fillMaxSize())
            }
            composable("report/{id}") { entry -> ReportDetailScreen(console.reports, entry.arguments?.getString("id").orEmpty(), leave) }
            composable("user/{id}") { entry -> UserDetailScreen(console.users, entry.arguments?.getString("id").orEmpty(), leave) }
        }
    }
    // From the first tab, back leaves the console, which locks behind it.
    BackHandler(enabled = back != null && entry?.destination?.route == ConsoleTab.Status.route) { back?.invoke() }
}
