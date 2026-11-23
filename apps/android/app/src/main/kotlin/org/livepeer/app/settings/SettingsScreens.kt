package org.livepeer.app.settings

import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.PanTool
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.livepeer.app.account.Account
import org.livepeer.app.account.AccountMark
import org.livepeer.app.account.AccountWords
import org.livepeer.app.account.Avatar
import org.livepeer.app.account.initials
import org.livepeer.app.composer.Load
import org.livepeer.app.design.Chip
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.DeviceSession
import org.livepeer.app.generated.DeviceSessionPlatform
import org.livepeer.app.generated.PlanAllowancePeriod
import org.livepeer.app.generated.PreferencesDefaultAspect
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.TypeSize
import org.livepeer.app.generated.UsageEntryStatus
import org.livepeer.app.generated.WorkspaceRole
import org.livepeer.app.shell.EmptyState
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The pages under Settings, by route. */
enum class SettingsPage(val route: String, val title: String, val icon: ImageVector) {
    Plan("plan", "Plan and credits", Icons.Rounded.CreditCard),
    Usage("usage", "Usage", Icons.Rounded.BarChart),
    Preferences("preferences", "Preferences", Icons.Rounded.Tune),
    Devices("devices", "Devices", Icons.Rounded.Smartphone),
    Privacy("privacy", "Privacy", Icons.Rounded.PanTool),
}

private fun count(value: Double) = NumberFormat.getIntegerInstance(Locale.ENGLISH).format(value.toLong())

/**
 * Settings, opened from the account tray: who you are, then plan and credits, usage, preferences, devices and
 * privacy, and deleting the account.
 */
@Composable
fun SettingsScreen(account: Account, onBack: () -> Unit, open: (SettingsPage) -> Unit) {
    val palette = LocalPalette.current
    val me by account.me.collectAsStateWithLifecycle()
    val workspace = AccountWords.workspace(me)
    val scope = rememberCoroutineScope()
    var confirming by rememberSaveable { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { account.refresh() }

    Page("Settings", onBack) {
        Group {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(initials(me?.name), 48)
                Column {
                    BasicText(me?.name.orEmpty(), style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground))
                    me?.email?.let { BasicText(it, style = TypeSize.Body.style().copy(color = palette.mutedForeground)) }
                }
            }
            workspace?.let { current ->
                Divider()
                Row(Modifier.padding(14.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) { AccountMark(current, 28) }
                    BasicText(AccountWords.workingIn(current), style = TypeSize.Body.style().copy(color = palette.foreground))
                }
            }
        }
        if (workspace != null) Footer("Plan, credits and usage below are the workspace's. Members, roles and invitations are on the web.")
        Group {
            SettingsPage.entries.forEachIndexed { index, page ->
                if (index > 0) Divider()
                NavigationRow(page.title, page.icon, detail = if (page == SettingsPage.Plan) me?.balance?.credits?.let { "${count(it)} credits" } else null) { open(page) }
            }
        }
        Group {
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).pressable(enabled = !deleting) { confirming = true }.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                BasicText(if (deleting) "Deleting…" else "Delete account…", style = TypeSize.Lead.style().copy(color = palette.destructive))
            }
        }
        Footer("Removes your account, your characters and what you've made here, and signs out every device.")
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Delete your account?") },
            text = { Text("Your characters, conversations and library go, every device is signed out, and credits left on the account are lost. This can't be undone.") },
            confirmButton = {
                TextButton({
                    confirming = false
                    deleting = true
                    scope.launch {
                        if (account.deleteAccount()) onBack() else failed = true
                        deleting = false
                    }
                }) { Text("Delete account", color = palette.destructive) }
            },
            dismissButton = { TextButton({ confirming = false }) { Text("Keep my account", color = palette.foreground) } },
            containerColor = palette.popover,
            titleContentColor = palette.foreground,
            textContentColor = palette.mutedForeground,
        )
    }
    if (failed) {
        AlertDialog(
            onDismissRequest = { failed = false },
            title = { Text("Your account wasn't deleted") },
            text = { Text("Check your connection and try again.") },
            confirmButton = { TextButton({ failed = false }) { Text("OK", color = palette.foreground) } },
            containerColor = palette.popover,
            titleContentColor = palette.foreground,
            textContentColor = palette.mutedForeground,
        )
    }
}

/** The balance and the plan. Nothing here buys anything. */
@Composable
fun PlanSettingsScreen(model: SettingsModel, account: Account, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val me by account.me.collectAsStateWithLifecycle()
    val workspace = AccountWords.workspace(me)
    Loaded(SettingsPage.Plan.title, model.plan, "Your plan didn't load. Check your connection and try again.", { model.loadPlan() }, onBack) { details ->
        Label(workspace?.let { "${it.name}'s balance" } ?: "Balance")
        Group {
            Column(Modifier.padding(14.dp)) {
                me?.balance?.credits?.let { BasicText(count(it), style = TypeSize.Title.style(FontWeight.Medium, mono = true).copy(color = palette.foreground)) }
                BasicText("credits left", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
            }
        }
        Label("Plan")
        Group {
            val plan = details.plan
            if (plan == null) {
                BasicText(workspace?.let { "${it.name} isn't on a plan. Work here uses the credits on the workspace." } ?: "You're not on a plan. Your work uses the credits on your account.", style = TypeSize.Body.style().copy(color = palette.mutedForeground), modifier = Modifier.padding(14.dp))
            } else {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BasicText(plan.name, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground), modifier = Modifier.weight(1f))
                        BasicText(SettingsModel.price(plan), style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
                    }
                    BasicText("${count(plan.allowance.credits)} credits a ${if (plan.allowance.period == PlanAllowancePeriod.Year) "year" else "month"}", style = TypeSize.Body.style().copy(color = palette.foreground))
                    if (plan.description.isNotEmpty()) BasicText(plan.description, style = TypeSize.Body.style().copy(color = palette.mutedForeground))
                    for (feature in plan.features) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Check, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(16.dp))
                            BasicText(feature, style = TypeSize.Body.style().copy(color = palette.foreground))
                        }
                    }
                }
            }
        }
        workspace?.let { Footer(if (it.role == WorkspaceRole.Owner) "You own this workspace. Add credit or change its plan on the web." else "The workspace's owner adds credit and chooses its plan.") }
    }
}

/** What has been spent, by capability, and the most recent jobs. */
@Composable
fun UsageSettingsScreen(model: SettingsModel, account: Account, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val me by account.me.collectAsStateWithLifecycle()
    val workspace = AccountWords.workspace(me)
    val labels by model.labels.collectAsStateWithLifecycle()
    val name = { app: String -> labels[app] ?: app }
    Loaded(SettingsPage.Usage.title, model.usage, "Usage didn't load. Check your connection and try again.", { model.loadUsage() }, onBack) { usage ->
        if (usage.entries.isEmpty()) {
            Box(Modifier.fillMaxWidth().heightIn(min = 360.dp)) { EmptyState(Icons.Rounded.BarChart, "No usage yet", workspace?.let { "Nothing has been charged to ${it.name} yet. Each generation, analysis and session made here is listed with what it cost." } ?: "Each generation, analysis and session you run is listed here with what it cost.") }
            return@Loaded
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Total("Credits used", usage.summary.credits, Modifier.weight(1f))
            Total("Jobs run", usage.summary.jobs, Modifier.weight(1f))
        }
        workspace?.let { Footer(if (it.role == WorkspaceRole.Member) "What you've used in ${it.name}. Its owner and admins see everyone's." else "Everything made in ${it.name}, by everyone and every API key. Usage by member is on the web.") }
        Label("By capability")
        Group {
            val top = usage.summary.byApp.firstOrNull()?.credits ?: 1.0
            usage.summary.byApp.forEachIndexed { index, row ->
                if (index > 0) Divider()
                Column(Modifier.padding(14.dp).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BasicText(name(row.app), style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground), modifier = Modifier.weight(1f))
                        BasicText("${count(row.credits)} · ${row.jobs.toLong()} jobs", style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
                    }
                    Box(Modifier.fillMaxWidth().height(4.dp).background(palette.secondary, CircleShape)) {
                        Box(Modifier.fillMaxWidth((row.credits / top.coerceAtLeast(1.0)).toFloat().coerceIn(0.02f, 1f)).height(4.dp).background(palette.foreground.copy(alpha = 0.7f), CircleShape))
                    }
                }
            }
        }
        Label("Recent")
        Group {
            usage.entries.forEachIndexed { index, entry ->
                if (index > 0) Divider()
                Row(Modifier.padding(14.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        BasicText(name(entry.app), style = TypeSize.Body.style().copy(color = palette.foreground))
                        val note = when (entry.status) { UsageEntryStatus.FailedAfterPayment -> " · failed after payment"; UsageEntryStatus.Pending -> " · pending"; else -> "" }
                        BasicText(moment(entry.createdAt) + note, style = TypeSize.Caption.style(mono = true).copy(color = if (entry.status == UsageEntryStatus.FailedAfterPayment) palette.destructive else palette.subtleForeground))
                    }
                    BasicText(count(entry.credits), style = TypeSize.Body.style(mono = true).copy(color = palette.foreground), modifier = Modifier.semantics { contentDescription = "${entry.credits.toLong()} credits" })
                }
            }
        }
    }
}

/** The settings that follow the account to every surface. Adult content is shown, never switched, here. */
@Composable
fun PreferencesSettingsScreen(model: SettingsModel, adultContentOffered: Boolean, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val error by model.error.collectAsStateWithLifecycle()
    Loaded(SettingsPage.Preferences.title, model.preferences, "Your preferences didn't load. Check your connection and try again.", { model.loadPreferences() }, onBack) { preferences ->
        error?.let { BasicText(it, style = TypeSize.Body.style().copy(color = palette.destructive)) }
        Label("New videos")
        Group {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                BasicText("Shape", style = TypeSize.Body.style().copy(color = palette.foreground))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (aspect in listOf(PreferencesDefaultAspect.V16x9, PreferencesDefaultAspect.V9x16, PreferencesDefaultAspect.V1x1)) {
                        Chip(aspect.value, selected = preferences.defaultAspect == aspect) { scope.launch { model.update { it.copy(defaultAspect = aspect) } } }
                    }
                }
                BasicText("Length", style = TypeSize.Body.style().copy(color = palette.foreground), modifier = Modifier.padding(top = 4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (seconds in listOf(5.0, 10.0, 15.0)) {
                        Chip("${seconds.toInt()}s", selected = preferences.defaultDuration == seconds) { scope.launch { model.update { it.copy(defaultDuration = seconds) } } }
                    }
                }
            }
        }
        Footer("Saved to your account, for new video requests.")
        Group {
            Toggle("Save my conversations", preferences.saveChats) { value -> scope.launch { model.update { it.copy(saveChats = value) } } }
            Divider()
            Toggle("Ask before spending credits", preferences.confirmBeforeSpending) { value -> scope.launch { model.update { it.copy(confirmBeforeSpending = value) } } }
        }
        Footer("Off, new conversations disappear when you close them. Asking first, the agent shows the cost and waits for you before it generates video.")
        if (adultContentOffered) {
            Group {
                Row(Modifier.fillMaxWidth().padding(14.dp)) {
                    BasicText("Adult content", style = TypeSize.Lead.style().copy(color = palette.foreground), modifier = Modifier.weight(1f))
                    BasicText(if (preferences.adultContent) "On" else "Off", style = TypeSize.Lead.style().copy(color = palette.mutedForeground))
                }
            }
            Footer("You can change this on the web, in Settings.")
        }
    }
}

/** The phones and tablets signed in to this account. Any but this one can be signed out from here. */
@Composable
fun DevicesSettingsScreen(model: SettingsModel, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val error by model.error.collectAsStateWithLifecycle()
    var signingOut by remember { mutableStateOf<DeviceSession?>(null) }
    Loaded(SettingsPage.Devices.title, model.devices, "Your devices didn't load. Check your connection and try again.", { model.loadDevices() }, onBack) { devices ->
        error?.let { BasicText(it, style = TypeSize.Body.style().copy(color = palette.destructive)) }
        Group {
            devices.forEachIndexed { index, device ->
                if (index > 0) Divider()
                Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Rounded.Smartphone, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(22.dp))
                    Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                        BasicText(device.name, style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground))
                        BasicText(if (device.current) "This phone" else "${if (device.platform == DeviceSessionPlatform.Ios) "iPhone or iPad" else "Android"} · last used ${moment(device.lastUsedAt)}", style = TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground))
                    }
                    if (!device.current) {
                        TextButton({ signingOut = device }) { Text("Sign out", color = palette.destructive) }
                    }
                }
            }
        }
        Footer("To sign out this phone, use Sign out in the account menu.")
    }
    signingOut?.let { device ->
        AlertDialog(
            onDismissRequest = { signingOut = null },
            title = { Text("Sign out “${device.name}”?") },
            text = { Text("It's signed out the next time it's used.") },
            confirmButton = { TextButton({ signingOut = null; scope.launch { model.revoke(device) } }) { Text("Sign out", color = palette.destructive) } },
            dismissButton = { TextButton({ signingOut = null }) { Text("Cancel", color = palette.foreground) } },
            containerColor = palette.popover,
            titleContentColor = palette.foreground,
            textContentColor = palette.mutedForeground,
        )
    }
}

/** Who can see a job: the instance operator and the compute operator, for each way of running it. */
@Composable
fun PrivacySettingsScreen(model: SettingsModel, onBack: () -> Unit) {
    val palette = LocalPalette.current
    Loaded(SettingsPage.Privacy.title, model.privacy, "This didn't load. Check your connection and try again.", { model.loadPrivacy() }, onBack) { privacy ->
        BasicText("Two parties can potentially see a job: the instance operator, who runs this app, and the compute operator, whose GPU on the network runs it.", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
        BasicText(
            "This service ${if (privacy.retainsChats) "keeps your prompts and outputs on its servers so you can return to them" else "does not keep your prompts or outputs on its servers"}. Compute operators are independent; treat a job's content as visible to the operator that runs it.",
            style = TypeSize.Body.style().copy(color = palette.mutedForeground),
        )
        for (tier in privacy.tiers) {
            Group {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BasicText(tier.name, style = TypeSize.Body.style(FontWeight.SemiBold).copy(color = palette.foreground))
                        tier.status?.let { BasicText(it, style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground), modifier = Modifier.background(palette.secondary, CircleShape).padding(horizontal = 7.dp, vertical = 2.dp)) }
                    }
                    BasicText(tier.summary, style = TypeSize.Body.style().copy(color = palette.mutedForeground))
                    Fact("Instance operator can see", tier.instanceSees)
                    Fact("Compute operator can see", tier.computeSees)
                }
            }
        }
    }
}

/** A settings page: a back button and a title, then what it shows, scrolling. */
@Composable
private fun Page(title: String, onBack: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxSize().background(palette.background).windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).pressable(round = true, onClick = onBack).semantics { contentDescription = "Back" }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(22.dp))
            }
            BasicText(title, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground), modifier = Modifier.padding(start = 4.dp).semantics { heading() })
        }
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

/** A page that loads what it shows, with its loading and failure states. */
@Composable
private fun <T> Loaded(title: String, state: kotlinx.coroutines.flow.StateFlow<Load<T>>, failure: String, load: suspend () -> Unit, onBack: () -> Unit, content: @Composable ColumnScope.(T) -> Unit) {
    val palette = LocalPalette.current
    val current by state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { load() }
    Page(title, onBack) {
        when (val value = current) {
            is Load.Loaded -> content(value.value)
            Load.Failed -> LoadFailure(failure, Modifier.padding(top = 80.dp)) { scope.launch { load() } }
            else -> Box(Modifier.fillMaxWidth().padding(top = 120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.mutedForeground) }
        }
    }
}

@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Card.dp)
    Column(Modifier.fillMaxWidth().background(palette.card, shape).border(1.dp, palette.hairline, shape), content = content)
}

@Composable
private fun Divider() = HorizontalDivider(Modifier.padding(start = 14.dp), color = LocalPalette.current.hairline)

@Composable
private fun Label(text: String) {
    BasicText(text, style = TypeSize.Body.style(FontWeight.SemiBold).copy(color = LocalPalette.current.mutedForeground), modifier = Modifier.padding(start = 4.dp, top = 8.dp).semantics { heading() })
}

@Composable
private fun Footer(text: String) {
    BasicText(text, style = TypeSize.Caption.style().copy(color = LocalPalette.current.mutedForeground), modifier = Modifier.padding(horizontal = 4.dp))
}

@Composable
private fun NavigationRow(title: String, icon: ImageVector, detail: String?, open: () -> Unit) {
    val palette = LocalPalette.current
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).pressable(label = title, onClick = open).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(20.dp))
        // At large text the detail goes under the title instead of squeezing it.
        if (LocalDensity.current.fontScale > 1.3f) {
            Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                BasicText(title, style = TypeSize.Lead.style().copy(color = palette.foreground))
                detail?.let { BasicText(it, style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground)) }
            }
        } else {
            BasicText(title, style = TypeSize.Lead.style().copy(color = palette.foreground), modifier = Modifier.weight(1f))
            detail?.let { BasicText(it, style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground)) }
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = palette.subtleForeground, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun Toggle(label: String, checked: Boolean, change: (Boolean) -> Unit) {
    val palette = LocalPalette.current
    Row(Modifier.fillMaxWidth().pressable { change(!checked) }.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        BasicText(label, style = TypeSize.Lead.style().copy(color = palette.foreground), modifier = Modifier.weight(1f))
        Switch(checked, onCheckedChange = change, colors = SwitchDefaults.colors(checkedTrackColor = palette.primary, checkedThumbColor = palette.primaryForeground, uncheckedTrackColor = palette.muted, uncheckedThumbColor = palette.mutedForeground, uncheckedBorderColor = palette.hairline))
    }
}

@Composable
private fun Total(label: String, value: Double, modifier: Modifier) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(Radius.Card.dp)
    Column(modifier.background(palette.card, shape).border(1.dp, palette.hairline, shape).padding(14.dp).semantics(mergeDescendants = true) {}) {
        BasicText(label, style = TypeSize.Caption.style().copy(color = palette.subtleForeground))
        BasicText(count(value), style = TypeSize.Title.style(FontWeight.Medium, mono = true).copy(color = palette.foreground))
    }
}

@Composable
private fun Fact(label: String, value: String) {
    val palette = LocalPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        BasicText(label, style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.subtleForeground))
        BasicText(value, style = TypeSize.Body.style().copy(color = palette.foreground))
    }
}

private val WHEN = DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.ENGLISH)

/** A moment as people read it: "Nov 17, 3:00 PM". */
private fun moment(value: String): String = runCatching { WHEN.format(Instant.parse(value).atZone(ZoneId.systemDefault())) }.getOrDefault(value)
