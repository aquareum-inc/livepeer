package org.livepeer.app.shell

import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Camera
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.MobileOff
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import org.livepeer.app.AppContainer
import org.livepeer.app.InstanceStore
import org.livepeer.app.R
import org.livepeer.app.account.AccountButton
import org.livepeer.app.account.AccountTray
import org.livepeer.app.account.SignInTray
import org.livepeer.app.characters.CharacterScreen
import org.livepeer.app.characters.CharactersScreen
import org.livepeer.app.characters.NewCharacterScreen
import org.livepeer.app.chat.ConversationScreen
import org.livepeer.app.chat.ConversationViewModel
import org.livepeer.app.console.ConsoleRoot
import org.livepeer.app.console.ConsoleSession
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.SecondaryButton
import org.livepeer.app.design.Tray
import org.livepeer.app.design.glass
import org.livepeer.app.design.rememberMotion
import org.livepeer.app.design.style
import org.livepeer.app.generated.TypeSize
import org.livepeer.app.home.HomeScreen
import org.livepeer.app.home.HomeViewModel
import org.livepeer.app.history.HistoryScreen
import org.livepeer.app.history.HistoryViewModel
import org.livepeer.app.library.LibraryScreen
import org.livepeer.app.settings.DevicesSettingsScreen
import org.livepeer.app.settings.PlanSettingsScreen
import org.livepeer.app.settings.PreferencesSettingsScreen
import org.livepeer.app.settings.PrivacySettingsScreen
import org.livepeer.app.settings.SettingsPage
import org.livepeer.app.settings.SettingsScreen
import org.livepeer.app.settings.UsageSettingsScreen
import org.livepeer.app.library.LibraryViewModel
import org.livepeer.app.studio.StudioScreen
import org.livepeer.app.chat.LocalOpenInStudio
import androidx.compose.runtime.CompositionLocalProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Home("home", "Home", Icons.Rounded.Home),
    Studio("studio", "Studio", Icons.Rounded.Camera),
    Library("library", "Library", Icons.Rounded.GridView),
    Characters("characters", "Characters", Icons.Rounded.Groups),
}

/** The app, or why it can't be used with this instance right now. */
@Composable
fun LivepeerRoot(container: AppContainer, openBrowser: (android.net.Uri) -> Unit) {
    val description by container.instance.description.collectAsStateWithLifecycle()
    val settled by container.instance.settled.collectAsStateWithLifecycle()
    val console = container.console.session
    val consoleUp by console.presented.collectAsStateWithLifecycle()
    val motion = rememberMotion()
    when (InstanceStore.availability(description)) {
        InstanceStore.Availability.Available -> when {
            // A first launch that hasn't heard from the instance: it may serve the app, the console or both.
            !settled -> Box(Modifier.fillMaxSize().background(LocalPalette.current.background))
            // No user app here: the console is the whole app, with no tabs, tray or guest state behind it.
            InstanceStore.consoleOnly(description) -> {
                LaunchedEffect(Unit) { console.present() }
                ConsoleRoot(container, consoleOnly = true, openBrowser)
            }
            // The console is its own place: it covers the app, navigation bar and all, and the app waits under it.
            else -> Box {
                Box(if (consoleUp) Modifier.clearAndSetSemantics {} else Modifier) { MainTabs(container, openBrowser) }
                AnimatedVisibility(consoleUp, enter = fadeIn(motion.enter()), exit = fadeOut(motion.exit())) { ConsoleRoot(container, consoleOnly = false, openBrowser) }
            }
        }
        InstanceStore.Availability.NotOffered -> Unavailable(container, Icons.Rounded.MobileOff, "Not on phones right now", "${description?.name ?: ""} doesn't offer its app on phones right now. You can still use it on the web.")
        InstanceStore.Availability.UpdateRequired -> Unavailable(container, Icons.Rounded.SystemUpdate, "Update to carry on", "This version of the app is too old for ${description?.name ?: ""}. Update it from Google Play, then open it again.")
    }
}

/** The app's destinations as the system navigation bar, with the account and sign-in trays over all of them. */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun MainTabs(container: AppContainer, openBrowser: (android.net.Uri) -> Unit) {
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val scope = rememberCoroutineScope()
    val account = container.account
    val description by container.instance.description.collectAsStateWithLifecycle()
    val prompt by account.prompt.collectAsStateWithLifecycle()
    val navigation = rememberNavController()
    val entry by navigation.currentBackStackEntryAsState()
    val signedIn by account.signedIn.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { container.composer.load() }
    LaunchedEffect(signedIn) {
        if (!signedIn) {
            container.composer.signedOut()
            container.settings.signedOut()
            navigation.popBackStack(Tab.Home.route, inclusive = false)
        }
    }
    // Saved, so the tray stays open through a rotation or a theme change.
    var accountOpen by rememberSaveable { mutableStateOf(false) }
    // Set when the account tray hands over to sign-in, which opens once it has closed.
    var signInNext by rememberSaveable { mutableStateOf(false) }
    // Set when the account tray hands over to Settings, which opens once it has closed.
    var settingsNext by rememberSaveable { mutableStateOf(false) }
    // Set when the account tray hands over to the console, which covers the app once it has closed.
    var consoleNext by rememberSaveable { mutableStateOf(false) }
    // Set when the account tray hands over to an invitation, which opens once it has closed.
    // Kept by id, so the tray survives a rotation or a theme change, and read from the accounts as they stand.
    var invitationNext by rememberSaveable { mutableStateOf<String?>(null) }
    var invitationOpenId by rememberSaveable { mutableStateOf<String?>(null) }
    val accountList by account.accounts.collectAsStateWithLifecycle()
    val invitationOpen = accountList?.invitations?.firstOrNull { it.id == invitationOpenId }
    val me by account.me.collectAsStateWithLifecycle()
    // A different account is a different app's worth of things: back to Home, and everything is read again.
    val accountEpoch by account.accountEpoch.collectAsStateWithLifecycle()
    var seenEpoch by rememberSaveable { mutableStateOf(accountEpoch) }
    LaunchedEffect(accountEpoch) {
        if (accountEpoch == seenEpoch) return@LaunchedEffect
        seenEpoch = accountEpoch
        navigation.popBackStack(Tab.Home.route, inclusive = false)
        container.conversations.clear()
        container.composer.signedOut()
        container.settings.signedOut()
        container.studio.switchedAccount()
        container.composer.load()
        container.characters.load()
    }

    val tabs = Tab.entries.filter { it != Tab.Characters || description?.content?.characters == true }
    val onTab = tabs.any { tab -> entry?.destination?.route == tab.route }
    val signIn: () -> Unit = { scope.launch { account.requireSignIn() } }
    val accountButton: @Composable () -> Unit = { AccountButton(account) { accountOpen = true } }
    val appName = LocalContext.current.getString(R.string.app_name)

    Scaffold(
        containerColor = palette.background,
        // Each screen places itself under the status bar; the scaffold only makes room for the navigation bar.
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (onTab) {
                NavigationBar(containerColor = palette.panel, contentColor = palette.foreground) {
                    for (tab in tabs) {
                        NavigationBarItem(
                            selected = entry?.destination?.route == tab.route,
                            onClick = {
                                navigation.navigate(tab.route) {
                                    popUpTo(navigation.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            // One line at any text size: at the largest, a label shrinks rather than breaking mid-word.
                            label = { Text(tab.label, maxLines = 1, softWrap = false, autoSize = TextAutoSize.StepBased(minFontSize = 9.sp, maxFontSize = 12.sp * LocalDensity.current.fontScale.coerceAtMost(1.3f))) },
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
        // The composer is one object that travels: it is shared between Home and a conversation.
        val openInStudio: (org.livepeer.app.generated.MediaKind, String) -> Unit = { kind, prompt ->
            container.studio.open(kind, prompt)
            navigation.navigate(Tab.Studio.route) {
                popUpTo(navigation.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
            }
        }
        CompositionLocalProvider(LocalOpenInStudio provides openInStudio) {
        SharedTransitionLayout(Modifier.padding(bottom = padding.calculateBottomPadding()).consumeWindowInsets(padding)) {
            NavHost(navigation, startDestination = Tab.Home.route, enterTransition = { fadeIn(motion.enter()) }, exitTransition = { fadeOut(motion.exit()) }) {
                composable(Tab.Home.route) {
                    val model = viewModel<HomeViewModel>(factory = viewModelFactory { initializer { HomeViewModel(container.api, account, container.composer) } })
                    HomeScreen(model, account, container.composer, description, Modifier.sharedBounds(rememberSharedContentState("composer"), this, boundsTransform = { _, _ -> motion.layout() }), accountButton, openHistory = { navigation.navigate("history") }) { conversation ->
                        container.conversations[conversation.id] = conversation
                        navigation.navigate("conversation/${conversation.id}")
                    }
                }
                composable(Tab.Studio.route) { StudioScreen(container.studio, account, accountButton) }
                composable(Tab.Library.route) {
                    val model = viewModel<LibraryViewModel>(factory = viewModelFactory { initializer { LibraryViewModel(container.api, account) } })
                    LibraryScreen(model, org.livepeer.app.account.AccountWords.workspace(me)?.name, signIn, accountButton) { conversation ->
                        container.conversations[conversation.id] = conversation
                        navigation.navigate("conversation/${conversation.id}")
                    }
                }
                composable(Tab.Characters.route) {
                    LaunchedEffect(signedIn) {
                        if (!signedIn) container.characters.signedOut()
                        container.characters.load()
                    }
                    CharactersScreen(container.characters, account, accountButton, open = { navigation.navigate("character/${it.slug}") }) {
                        scope.launch { if (account.requireSignIn("Sign in to make a character of your own.")) navigation.navigate("characters/new") }
                    }
                }
                composable("character/{slug}") { entry ->
                    val slug = entry.arguments?.getString("slug").orEmpty()
                    val state by container.characters.state.collectAsStateWithLifecycle()
                    // Gone once blocked; the screen leaves as it goes.
                    state.all.firstOrNull { it.slug == slug }?.let { character ->
                        CharacterScreen(character, container.characters, account, description?.name ?: appName, onBack = { navigation.popBackStack() }) { cast ->
                            container.composer.pendingCast.value = cast
                            navigation.navigate(Tab.Home.route) {
                                popUpTo(navigation.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                            }
                        }
                    }
                }
                composable("characters/new") {
                    NewCharacterScreen(container.characters, onClose = { navigation.popBackStack() }) { made ->
                        navigation.navigate("character/${made.slug}") { popUpTo(Tab.Characters.route) }
                    }
                }
                composable("settings") {
                    SettingsScreen(account, onBack = { navigation.popBackStack() }) { page -> navigation.navigate("settings/${page.route}") }
                }
                composable("settings/{page}") { entry ->
                    val back = { navigation.popBackStack(); Unit }
                    when (SettingsPage.entries.firstOrNull { it.route == entry.arguments?.getString("page") }) {
                        SettingsPage.Plan -> PlanSettingsScreen(container.settings, account, back)
                        SettingsPage.Usage -> UsageSettingsScreen(container.settings, account, back)
                        SettingsPage.Preferences -> PreferencesSettingsScreen(container.settings, description?.content?.adultContent == true, back)
                        SettingsPage.Devices -> DevicesSettingsScreen(container.settings, back)
                        SettingsPage.Privacy -> PrivacySettingsScreen(container.settings, back)
                        null -> back()
                    }
                }
                composable("history") {
                    val model = viewModel<HistoryViewModel>(factory = viewModelFactory { initializer { HistoryViewModel(container.api) } })
                    HistoryScreen(model, onBack = { navigation.popBackStack() }) { summary -> navigation.navigate("conversation/${summary.id}") }
                }
                composable("conversation/{id}") { entry ->
                    val id = entry.arguments?.getString("id").orEmpty()
                    val model = viewModel<ConversationViewModel>(factory = viewModelFactory { initializer { ConversationViewModel(container.api, id, container.conversations[id]) } })
                    ConversationScreen(model, container.composer, description?.content?.characters == true, Modifier.sharedBounds(rememberSharedContentState("composer"), this, boundsTransform = { _, _ -> motion.layout() })) {
                        navigation.popBackStack()
                    }
                }
            }
        }
        }
    }

    if (accountOpen) {
        Tray("Account", onDismiss = {
            accountOpen = false
            if (signInNext) {
                signInNext = false
                signIn()
            } else if (settingsNext) {
                settingsNext = false
                navigation.navigate("settings")
            } else if (consoleNext) {
                consoleNext = false
                container.console.session.present()
            } else if (invitationNext != null) {
                invitationOpenId = invitationNext
                invitationNext = null
            }
        }) { close ->
            AccountTray(account, container.theme, offersConsole = signedIn && ConsoleSession.offered(me, description), openConsole = {
                consoleNext = true
                close()
            }, signIn = {
                signInNext = true
                close()
            }, close = close, openInvitation = { invitation ->
                invitationNext = invitation.id
                close()
            }) {
                settingsNext = true
                close()
            }
        }
    }
    invitationOpen?.let { invitation ->
        Tray("Invitation", onDismiss = { invitationOpenId = null }) { close -> org.livepeer.app.account.InvitationTray(account, invitation, close) }
    }
    prompt?.let { current ->
        Tray("Sign in or sign up", onDismiss = account::promptClosed) { SignInTray(account, description, current.reason, openBrowser) }
    }
    NoticeBanner(container)
}

/** A short message at the top of the screen, such as "You've been signed out." It goes after a few seconds. */
@Composable
private fun NoticeBanner(container: AppContainer) {
    val palette = LocalPalette.current
    val motion = rememberMotion()
    val notice by container.account.notice.collectAsStateWithLifecycle()
    LaunchedEffect(notice) {
        if (notice == null) return@LaunchedEffect
        delay(4000)
        container.account.notice.value = null
    }
    Box(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 8.dp), contentAlignment = Alignment.TopCenter) {
        AnimatedVisibility(notice != null, enter = fadeIn(motion.enter()) + slideInVertically(motion.enter()) { -it / 2 }, exit = fadeOut(motion.exit())) {
            BasicText(
                notice.orEmpty(),
                style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground),
                modifier = Modifier.glass(CircleShape).heightIn(min = 40.dp).padding(horizontal = 16.dp, vertical = 10.dp).semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

/** A tab's page: a large title with the account button, then the content. */
@Composable
fun TabPage(title: String, accountButton: @Composable () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxSize().background(palette.background).windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), horizontalArrangement = Arrangement.End) { accountButton() }
        BasicText(title, style = TypeSize.Title.style(FontWeight.Bold).copy(color = palette.foreground, fontSize = 32.sp, lineHeight = 38.sp), modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp).semantics { heading() })
        Box(Modifier.weight(1f)) { Column { content() } }
    }
}

/** What a tab shows a guest: what it's for, and the way in. */
@Composable
fun SignedOutState(icon: ImageVector, title: String, message: String, signIn: () -> Unit) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(32.dp))
        BasicText(title, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground, textAlign = TextAlign.Center))
        BasicText(message, style = TypeSize.Body.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
        PrimaryButton("Sign in or sign up", Modifier.widthIn(max = 280.dp).padding(top = 8.dp), onClick = signIn)
    }
}

/** What a tab shows when there's nothing in it yet. */
@Composable
fun EmptyState(icon: ImageVector, title: String, message: String) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(32.dp))
        BasicText(title, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground, textAlign = TextAlign.Center))
        BasicText(message, style = TypeSize.Body.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
    }
}

/** Shown instead of the app when it can't be used with this instance right now. */
@Composable
private fun Unavailable(container: AppContainer, icon: ImageVector, title: String, message: String) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var checking by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(palette.background).padding(32.dp), verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(36.dp))
        BasicText(title, style = TypeSize.Title.style(FontWeight.SemiBold).copy(color = palette.foreground, textAlign = TextAlign.Center), modifier = Modifier.semantics { heading() })
        BasicText(message, style = TypeSize.Lead.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
        Box(Modifier.widthIn(max = 240.dp).padding(top = 10.dp)) {
            SecondaryButton(if (checking) "Checking…" else "Check again", enabled = !checking) {
                checking = true
                scope.launch { container.instance.refresh(); checking = false }
            }
        }
    }
}
