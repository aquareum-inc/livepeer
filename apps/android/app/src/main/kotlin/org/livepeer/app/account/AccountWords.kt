package org.livepeer.app.account

import org.livepeer.app.generated.AccountInvitationRole
import org.livepeer.app.generated.AccountSummary
import org.livepeer.app.generated.AccountSummaryKind
import org.livepeer.app.generated.AccountSummaryStatus
import org.livepeer.app.generated.Me
import org.livepeer.app.generated.WorkspaceRole

/** The words and letters an account is shown with. */
object AccountWords {
    /** The workspace the app is working in, or null in the person's own account. */
    fun workspace(me: Me?): AccountSummary? = me?.account?.takeIf { it.kind == AccountSummaryKind.Workspace }

    fun initial(name: String): String = name.trim().firstOrNull()?.uppercase() ?: "?"

    fun role(role: WorkspaceRole): String = when (role) {
        WorkspaceRole.Owner -> "Owner"
        WorkspaceRole.Admin -> "Admin"
        WorkspaceRole.Member, WorkspaceRole.Unknown -> "Member"
    }

    /** The line under an account's name: "Personal", or the person's role in a workspace. */
    fun kind(account: AccountSummary): String =
        if (account.kind != AccountSummaryKind.Workspace) "Personal" else role(account.role) + if (account.status == AccountSummaryStatus.Paused) " · Suspended" else ""

    /** The role an invitation offers, said to the person: "You'll be a member". */
    fun youWillBe(role: AccountInvitationRole): String = if (role == AccountInvitationRole.Admin) "You'll be an admin" else "You'll be a member"

    /** What that role lets them do, said to them. */
    fun forYou(role: AccountInvitationRole): String =
        if (role == AccountInvitationRole.Admin) "Invite and remove people, make API keys and see everyone's usage, as well as making things." else "Make things with the workspace's credit, and see what you've used."

    /** Where the person is working and as what, for Settings: "Working in Northlight Studio · Admin". */
    fun workingIn(account: AccountSummary): String = "Working in ${account.name} · ${role(account.role)}"

    fun spoken(account: AccountSummary, current: Boolean): String {
        val what = if (account.kind == AccountSummaryKind.Workspace) "${account.name}, workspace, ${role(account.role).lowercase()}" else "${account.name}, personal account"
        return "$what, ${account.credits.toLong()} credits" + if (current) ", current" else ""
    }
}
