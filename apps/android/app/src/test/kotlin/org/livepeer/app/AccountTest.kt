package org.livepeer.app

import org.livepeer.app.InstanceStore.Availability
import org.livepeer.app.account.AccountWords
import org.livepeer.app.account.initials
import org.livepeer.app.api.ApiTransport
import org.livepeer.app.generated.AccountList
import org.livepeer.app.generated.AccountSummaryKind
import org.livepeer.app.generated.AccountSummaryStatus
import org.livepeer.app.generated.DeviceSession
import org.livepeer.app.generated.DeviceSessionPlatform
import org.livepeer.app.generated.DeviceToken
import org.livepeer.app.generated.InstanceDescription
import org.livepeer.app.generated.Me
import org.livepeer.app.generated.WorkspaceRole
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The sign-in responses, and when the app can be used with an instance at all. */
class AccountTest {
    private fun <T> fixture(name: String, serializer: DeserializationStrategy<T>): T =
        ApiTransport.json.decodeFromString(serializer, File("../../../docs/mobile/fixtures/$name.json").readText())

    @Test
    fun signInResponses() {
        val issued = fixture("create_device_session", DeviceToken.serializer())
        assertTrue(issued.token.startsWith("aqd_"))
        assertEquals(DeviceSessionPlatform.Ios, issued.device.platform)
        val me = fixture("get_me", Me.serializer())
        assertTrue(me.name.isNotEmpty() && me.balance.credits > 0)
        assertTrue(fixture("list_devices", ListSerializer(DeviceSession.serializer())).isNotEmpty())
    }

    @Test
    fun accountsAndTheOneInUse() {
        val me = fixture("get_me", Me.serializer())
        assertEquals(AccountSummaryKind.Personal, me.account.kind)
        assertEquals(me.id, me.account.id)
        assertNull(AccountWords.workspace(me))

        val list = fixture("list_accounts", AccountList.serializer())
        assertEquals(me.id, list.current)
        assertEquals(listOf(AccountSummaryKind.Personal, AccountSummaryKind.Workspace), list.accounts.map { it.kind })
        assertEquals("Harbour Films", list.invitations.first().workspaceName)

        // After a switch the list names the workspace, and "me" carries it with its balance.
        val switched = fixture("switch_account", AccountList.serializer())
        val inWorkspace = fixture("get_me_workspace", Me.serializer())
        assertEquals(inWorkspace.account.id, switched.current)
        assertEquals(WorkspaceRole.Admin, inWorkspace.account.role)
        assertEquals(inWorkspace.account.credits, inWorkspace.balance.credits, 0.0)
        assertTrue(inWorkspace.balance.credits != me.balance.credits)
        assertEquals("Northlight Studio", AccountWords.workspace(inWorkspace)?.name)
    }

    @Test
    fun accountWords() {
        val list = fixture("list_accounts", AccountList.serializer())
        val personal = list.accounts.first()
        val workspace = list.accounts.last()
        assertEquals("Personal", AccountWords.kind(personal))
        assertEquals("Admin", AccountWords.kind(workspace))
        assertEquals("Working in Northlight Studio · Admin", AccountWords.workingIn(workspace))
        assertEquals("N", AccountWords.initial(workspace.name))
        assertEquals("Northlight Studio, workspace, admin, 36660 credits, current", AccountWords.spoken(workspace, current = true))
        assertEquals("Adam Soffer, personal account, 2480 credits", AccountWords.spoken(personal, current = false))
        assertEquals("You'll be a member", AccountWords.youWillBe(list.invitations.first().role))
        assertTrue(AccountWords.forYou(list.invitations.first().role).startsWith("Make things"))
        assertEquals("Member · Suspended", AccountWords.kind(workspace.copy(status = AccountSummaryStatus.Paused, role = WorkspaceRole.Member)))
    }

    @Test
    fun availability() {
        val instance = fixture("get_instance", InstanceDescription.serializer())
        assertEquals(Availability.Available, InstanceStore.availability(instance, "org.livepeer.app.dev", "0.1.0"))
        assertEquals(Availability.Available, InstanceStore.availability(null, "org.livepeer.app.dev", "0.1.0"))
        // An app the instance doesn't list can't sign in, so it isn't offered.
        assertEquals(Availability.NotOffered, InstanceStore.availability(instance, "org.example.other", "0.1.0"))
        assertEquals(Availability.NotOffered, InstanceStore.availability(instance.copy(surfaces = instance.surfaces.copy(mobile = false)), "org.livepeer.app.dev", "0.1.0"))

        val newer = instance.copy(mobile = instance.mobile.copy(android = instance.mobile.android!!.copy(minimumVersion = "0.10.0")))
        assertEquals(Availability.UpdateRequired, InstanceStore.availability(newer, "org.livepeer.app.dev", "0.9.3"))
        assertEquals(Availability.Available, InstanceStore.availability(newer, "org.livepeer.app.dev", "0.10.0"))
    }

    @Test
    fun initialsFromAName() {
        assertEquals("AS", initials("Adam Soffer"))
        assertEquals("M", initials("Mara"))
        assertEquals("", initials(null))
    }
}
