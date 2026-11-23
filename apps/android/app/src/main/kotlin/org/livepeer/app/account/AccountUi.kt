package org.livepeer.app.account

import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.livepeer.app.ThemePreference
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.Mono
import org.livepeer.app.design.PrimaryButton
import org.livepeer.app.design.SecondaryButton
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.AccountInvitation
import org.livepeer.app.generated.AccountList
import org.livepeer.app.generated.AccountSummary
import org.livepeer.app.generated.AccountSummaryKind
import org.livepeer.app.generated.InstanceDescription
import org.livepeer.app.generated.InstanceDescriptionSignInSignUp
import org.livepeer.app.generated.Radius
import org.livepeer.app.generated.SignInMethodName
import org.livepeer.app.generated.TypeSize
import kotlinx.coroutines.launch
import java.text.NumberFormat

/** The account menu: who is signed in and their credits, the theme, and signing out. For a guest, the way in. */
@Composable
fun AccountTray(account: Account, theme: ThemePreference, offersConsole: Boolean, openConsole: () -> Unit, signIn: () -> Unit, close: () -> Unit, openInvitation: (AccountInvitation) -> Unit, openSettings: () -> Unit) {
    val palette = LocalPalette.current
    val signedIn by account.signedIn.collectAsStateWithLifecycle()
    val me by account.me.collectAsStateWithLifecycle()
    val accounts by account.accounts.collectAsStateWithLifecycle()
    val switchingTo by account.switchingTo.collectAsStateWithLifecycle()
    val choice by theme.choice.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var confirming by remember { mutableStateOf(false) }
    var switchFailed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        account.refresh()
        account.loadAccounts()
    }

    val list = accounts
    if (signedIn && list != null && list.accounts.size > 1) {
        // The accounts the person can work in, the current one ticked. One tap works in another.
        Column {
            for (entry in list.accounts) {
                val current = entry.id == (me?.account?.id ?: list.current)
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp)
                        .pressable(enabled = switchingTo == null, label = if (current) null else "Works in this account") {
                            switchFailed = false
                            scope.launch {
                                if (account.switchAccount(entry.id)) {
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    close()
                                } else {
                                    switchFailed = true
                                }
                            }
                        }
                        .clearAndSetSemantics { contentDescription = AccountWords.spoken(entry, current); selected = current; role = Role.Button },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AccountMark(entry, 36)
                    Column(Modifier.weight(1f)) {
                        BasicText(entry.name, style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        BasicText(AccountWords.kind(entry), style = TypeSize.Caption.style().copy(color = palette.subtleForeground))
                    }
                    // The current account's balance is the live one; the others are as last read.
                    BasicText(NumberFormat.getIntegerInstance().format(((if (current) me?.balance?.credits else null) ?: entry.credits).toLong()), style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
                    Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) {
                        if (switchingTo == entry.id) {
                            CircularProgressIndicator(Modifier.size(16.dp), color = palette.mutedForeground, strokeWidth = 2.dp)
                        } else if (current) {
                            Icon(Icons.Rounded.Check, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
        if (switchFailed) BasicText("That didn't switch. Check your connection and try again.", style = TypeSize.Caption.style().copy(color = palette.destructive), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        Invitations(list, openInvitation)
    } else if (signedIn) {
        // At large text the credits go under the name and email instead of squeezing them.
        val stacked = LocalDensity.current.fontScale > 1.3f
        val credits: @Composable () -> Unit = {
            me?.balance?.credits?.let { credits ->
                BasicText(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontFamily = Mono, fontWeight = FontWeight.Medium)) { append(NumberFormat.getIntegerInstance().format(credits.toLong())) }
                        append(" credits")
                    },
                    style = TypeSize.Body.style().copy(color = palette.foreground),
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Avatar(initials(me?.name), 44)
            Column(Modifier.weight(1f)) {
                BasicText(me?.name.orEmpty(), style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground))
                me?.email?.let { BasicText(it, style = TypeSize.Body.style().copy(color = palette.mutedForeground), maxLines = if (stacked) 2 else 1, overflow = TextOverflow.MiddleEllipsis) }
                if (stacked) credits()
            }
            if (!stacked) credits()
        }
        list?.let { Invitations(it, openInvitation) }
    } else {
        BasicText("Sign in to generate and save your work.", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
        PrimaryButton("Sign in or sign up", onClick = signIn)
    }

    BasicText("Theme", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.mutedForeground), modifier = Modifier.padding(top = 4.dp))
    Segmented(listOf(ThemePreference.Choice.System to "System", ThemePreference.Choice.Dark to "Dark", ThemePreference.Choice.Light to "Light"), choice, theme::set)

    // Only for a signed-in person who runs the instance, where the instance offers its console to phones.
    if (offersConsole) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(label = "Opens with your fingerprint or face", onClick = openConsole),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Rounded.Speed, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(20.dp))
            BasicText("Operator console", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground), modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = palette.subtleForeground, modifier = Modifier.size(20.dp))
        }
    }

    if (signedIn) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(label = "Settings", onClick = openSettings),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Rounded.Settings, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(20.dp))
            BasicText("Settings", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground), modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = palette.subtleForeground, modifier = Modifier.size(20.dp))
        }
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable { haptics.performHapticFeedback(HapticFeedbackType.LongPress); confirming = true },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null, tint = palette.destructive, modifier = Modifier.size(20.dp))
            BasicText("Sign out", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.destructive))
        }
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Sign out of this phone?") },
            text = { Text("Your work stays in your account.") },
            confirmButton = { TextButton({ confirming = false; scope.launch { account.signOut() } }) { Text("Sign out", color = palette.destructive) } },
            dismissButton = { TextButton({ confirming = false }) { Text("Cancel", color = palette.foreground) } },
            containerColor = palette.popover,
            titleContentColor = palette.foreground,
            textContentColor = palette.mutedForeground,
        )
    }
}

/** Sign in or sign up with the methods the instance offers. The email method asks for the address first, as the web does. */
@Composable
fun SignInTray(account: Account, instance: InstanceDescription?, reason: String?, open: (android.net.Uri) -> Unit) {
    val palette = LocalPalette.current
    val progress by account.progress.collectAsStateWithLifecycle()
    val busy = progress is SignInProgress.Busy

    if (reason != null) BasicText(reason, style = TypeSize.Body.style().copy(color = palette.mutedForeground))

    SignInOptions(instance?.signIn?.methods.orEmpty(), busy = (progress as? SignInProgress.Busy)?.method, enabled = !busy) { method, email -> open(account.start(method, email)) }

    (progress as? SignInProgress.Failed)?.let { failed ->
        BasicText(failed.message, style = TypeSize.Body.style().copy(color = palette.destructive), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    }

    BasicText(
        when (instance?.signIn?.signUp) {
            InstanceDescriptionSignInSignUp.Invite -> "This service is invitation only. Sign in with the address you were invited at."
            InstanceDescriptionSignInSignUp.Closed -> "This service isn't taking new accounts."
            else -> "New here? Signing in for the first time creates your account."
        },
        style = TypeSize.Caption.style().copy(color = palette.subtleForeground),
        modifier = Modifier.padding(top = 4.dp),
    )
}

/**
 * The ways to sign in that an instance offers, for the app's sign-in and the console's. The email method asks
 * for the address first, as the web does; [start] gets it with that method and nothing with the others.
 */
@Composable
fun SignInOptions(methods: List<SignInMethodName>, busy: SignInMethodName?, enabled: Boolean, suggestedEmail: String = "", start: (SignInMethodName, String?) -> Unit) {
    val palette = LocalPalette.current
    var email by rememberSaveable { mutableStateOf(suggestedEmail) }
    val emailReady = email.trim().let { it.contains('@') && it.contains('.') }

    // Methods that hand off to a wallet app don't come back reliably from a browser tab, so phones don't offer
    // them until they've been tested against the provider.
    val providers = listOf(SignInMethodName.Google to "Continue with Google", SignInMethodName.Apple to "Continue with Apple", SignInMethodName.Discord to "Continue with Discord").filter { it.first in methods }
    for ((method, label) in providers) {
        SecondaryButton(label, enabled = enabled, busy = busy == method) { start(method, null) }
    }

    if (SignInMethodName.Email in methods) {
        if (providers.isNotEmpty()) {
            Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.weight(1f).height(1.dp).background(palette.hairline))
                BasicText("or", style = TypeSize.Caption.style().copy(color = palette.subtleForeground))
                Box(Modifier.weight(1f).height(1.dp).background(palette.hairline))
            }
        }
        val shape = RoundedCornerShape(Radius.Field.dp)
        BasicTextField(
            value = email,
            onValueChange = { email = it },
            singleLine = true,
            textStyle = TypeSize.Lead.style().copy(color = palette.foreground),
            cursorBrush = SolidColor(palette.foreground),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Go, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onGo = { if (emailReady && enabled) start(SignInMethodName.Email, email.trim()) }),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Email address" },
            decorationBox = { field ->
                Box(Modifier.fillMaxWidth().heightIn(min = 52.dp).background(palette.card, shape).border(1.dp, palette.input, shape).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                    if (email.isEmpty()) BasicText("you@example.com", style = TypeSize.Lead.style().copy(color = palette.subtleForeground))
                    field()
                }
            },
        )
        PrimaryButton("Continue", enabled = emailReady && enabled, busy = busy == SignInMethodName.Email) { start(SignInMethodName.Email, email.trim()) }
    }

    if (SignInMethodName.Passkey in methods) {
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(enabled = enabled) { start(SignInMethodName.Passkey, null) }, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Key, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            BasicText("Use a passkey instead", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
        }
    }
}

/** A row of choices, one selected. */
@Composable
private fun <T> Segmented(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    val palette = LocalPalette.current
    Row(Modifier.fillMaxWidth().background(palette.secondary, CircleShape).padding(3.dp)) {
        for ((value, label) in options) {
            val on = value == selected
            Box(
                Modifier.weight(1f).heightIn(min = 40.dp).background(if (on) palette.card else palette.secondary, CircleShape)
                    .then(if (on) Modifier.border(1.dp, palette.hairline, CircleShape) else Modifier)
                    .pressable { onSelect(value) }
                    .semantics { this.selected = on; role = Role.RadioButton },
                contentAlignment = Alignment.Center,
            ) {
                BasicText(label, style = TypeSize.Body.style(if (on) FontWeight.Medium else FontWeight.Normal).copy(color = if (on) palette.foreground else palette.mutedForeground))
            }
        }
    }
}

/** A person's initials, from their name. */
fun initials(name: String?): String = name.orEmpty().split(' ').filter(String::isNotBlank).take(2).joinToString("") { it.first().uppercase() }

/** A person's initials in a circle, or a silhouette for a guest. */
@Composable
fun Avatar(initials: String, size: Int = 32) {
    val palette = LocalPalette.current
    Box(Modifier.size(size.dp).background(palette.secondary, CircleShape).border(1.dp, palette.hairline, CircleShape), contentAlignment = Alignment.Center) {
        if (initials.isEmpty()) {
            Icon(Icons.Rounded.Person, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size((size * 0.55).dp))
        } else {
            BasicText(initials, style = TypeSize.Body.style(FontWeight.SemiBold).copy(color = palette.foreground, fontSize = androidx.compose.ui.unit.TextUnit((size * 0.38).toFloat(), androidx.compose.ui.unit.TextUnitType.Sp)))
        }
    }
}

/** Invitations waiting: each a row like an account, with a dashed mark for a workspace you aren't in yet. */
@Composable
private fun Invitations(list: AccountList, open: (AccountInvitation) -> Unit) {
    val palette = LocalPalette.current
    for (invitation in list.invitations) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp)
                .pressable(label = "Shows the invitation") { open(invitation) }
                .clearAndSetSemantics { contentDescription = "Invitation to ${invitation.workspaceName} from ${invitation.invitedByName}"; role = Role.Button },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            InvitationMark(invitation.workspaceName, 36)
            Column(Modifier.weight(1f)) {
                BasicText(invitation.workspaceName, style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground), maxLines = 1, overflow = TextOverflow.Ellipsis)
                BasicText("Invited by ${invitation.invitedByName}", style = TypeSize.Caption.style().copy(color = palette.subtleForeground), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(Modifier.heightIn(min = 28.dp).background(palette.secondary, CircleShape).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                BasicText("Join", style = TypeSize.Caption.style(FontWeight.Medium).copy(color = palette.foreground))
            }
        }
    }
}

/** A workspace you've been invited to and aren't in yet: its initial in a dashed rounded square. */
@Composable
fun InvitationMark(name: String, size: Int = 32) {
    val palette = LocalPalette.current
    val outline = palette.input
    Box(
        Modifier.size(size.dp).drawBehind {
            val radius = (size * 0.28f).dp.toPx()
            drawRoundRect(outline, cornerRadius = CornerRadius(radius, radius), style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))))
        },
        contentAlignment = Alignment.Center,
    ) {
        BasicText(AccountWords.initial(name), style = TypeSize.Body.style(FontWeight.SemiBold).copy(color = palette.mutedForeground, fontSize = androidx.compose.ui.unit.TextUnit((size * 0.4).toFloat(), androidx.compose.ui.unit.TextUnitType.Sp)))
    }
}

/**
 * An invitation, opened from the account tray: which workspace and who asked, what joining changes, then join
 * or decline. Joining starts working in the workspace at once.
 */
@Composable
fun InvitationTray(account: Account, invitation: AccountInvitation, close: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var busy by remember { mutableStateOf<Boolean?>(null) }
    var failed by remember { mutableStateOf(false) }
    val answer: (Boolean) -> Unit = { join ->
        busy = join
        failed = false
        scope.launch {
            val done = if (join) account.acceptInvitation(invitation) else account.declineInvitation(invitation)
            busy = null
            if (done) {
                if (join) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                close()
            } else {
                failed = true
            }
        }
    }

    Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        InvitationMark(invitation.workspaceName, 44)
        Column {
            BasicText(invitation.workspaceName, style = TypeSize.Lead.style(FontWeight.SemiBold).copy(color = palette.foreground))
            BasicText("${invitation.invitedByName} invited you to join", style = TypeSize.Body.style().copy(color = palette.mutedForeground))
        }
    }

    val card = RoundedCornerShape(Radius.Card.dp)
    Column(Modifier.fillMaxWidth().background(palette.card, card).border(1.dp, palette.hairline, card)) {
        InvitationFact(Icons.Rounded.Verified, AccountWords.youWillBe(invitation.role), AccountWords.forYou(invitation.role))
        Box(Modifier.fillMaxWidth().height(1.dp).background(palette.hairline))
        InvitationFact(Icons.Rounded.Layers, "One balance, one library", "What you make here uses the workspace's credit and is saved where everyone in it can see.")
        Box(Modifier.fillMaxWidth().height(1.dp).background(palette.hairline))
        InvitationFact(Icons.Rounded.Person, "Your own account stays as it is", "Switch between the two from this menu whenever you like.")
    }

    if (failed) {
        BasicText("That didn't go through. The invitation may have been cancelled. Check your connection and try again.", style = TypeSize.Caption.style().copy(color = palette.destructive), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    }

    PrimaryButton("Join ${invitation.workspaceName}", enabled = busy == null, busy = busy == true) { answer(true) }
    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(enabled = busy == null) { answer(false) }, contentAlignment = Alignment.Center) {
        BasicText(if (busy == false) "Declining…" else "Decline", style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.mutedForeground))
    }
}

@Composable
private fun InvitationFact(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String) {
    val palette = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(14.dp).semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.padding(top = 2.dp).size(18.dp))
        Column {
            BasicText(title, style = TypeSize.Body.style(FontWeight.Medium).copy(color = palette.foreground))
            BasicText(detail, style = TypeSize.Caption.style().copy(color = palette.mutedForeground))
        }
    }
}

/**
 * An account's mark: the person's initials in a circle for their own, and a workspace's initial in a rounded
 * square, so the two never read as each other.
 */
@Composable
fun AccountMark(account: AccountSummary, size: Int = 32) {
    if (account.kind != AccountSummaryKind.Workspace) return Avatar(initials(account.name), size)
    val palette = LocalPalette.current
    val shape = RoundedCornerShape((size * 0.28).dp)
    Box(Modifier.size(size.dp).background(palette.secondary, shape).border(1.dp, palette.hairline, shape), contentAlignment = Alignment.Center) {
        BasicText(AccountWords.initial(account.name), style = TypeSize.Body.style(FontWeight.SemiBold).copy(color = palette.foreground, fontSize = androidx.compose.ui.unit.TextUnit((size * 0.4).toFloat(), androidx.compose.ui.unit.TextUnitType.Sp)))
    }
}

/**
 * The account button at the top right of each tab. Opens the account tray. In a workspace it is the
 * workspace's mark, so the shape says whose credit a request will spend.
 */
@Composable
fun AccountButton(account: Account, open: () -> Unit) {
    val signedIn by account.signedIn.collectAsStateWithLifecycle()
    val me by account.me.collectAsStateWithLifecycle()
    val workspace = AccountWords.workspace(me)
    val label = when {
        !signedIn -> "Account, not signed in"
        workspace != null -> "Account, ${me?.name ?: "signed in"}, working in ${workspace.name}"
        else -> "Account, ${me?.name ?: "signed in"}"
    }
    Box(
        Modifier.size(48.dp).pressable(round = true, onClick = open).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { if (workspace != null && signedIn) AccountMark(workspace, 34) else Avatar(if (signedIn) initials(me?.name) else "", 34) }
}
