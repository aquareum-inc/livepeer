import Foundation
import Testing
@testable import Livepeer

/// The sign-in responses, and when the app can be used with an instance at all.
struct AccountTests {
    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let fixtures = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../docs/mobile/fixtures").standardizedFileURL
        return try JSONDecoder().decode(type, from: Data(contentsOf: fixtures.appending(path: "\(name).json")))
    }

    @Test func signInResponses() throws {
        let issued = try fixture("create_device_session", as: DeviceToken.self)
        #expect(issued.token.hasPrefix("aqd_"))
        #expect(issued.device.platform == .ios && issued.device.current)
        let me = try fixture("get_me", as: Me.self)
        #expect(!me.name.isEmpty && me.balance.credits > 0)
        #expect(try !fixture("list_devices", as: [DeviceSession].self).isEmpty)
    }

    @Test func accountsAndTheOneInUse() throws {
        let me = try fixture("get_me", as: Me.self)
        #expect(me.account.kind == .personal && me.account.id == me.id && me.account.role == .owner)

        let list = try fixture("list_accounts", as: AccountList.self)
        #expect(list.current == me.id && list.workspacesSupported)
        #expect(list.accounts.map(\.kind) == [.personal, .workspace])
        #expect(list.invitations.first?.workspaceName == "Harbour Films")

        // After a switch the list names the workspace, and "me" carries it with its balance.
        let switched = try fixture("switch_account", as: AccountList.self)
        let inWorkspace = try fixture("get_me_workspace", as: Me.self)
        #expect(switched.current == inWorkspace.account.id)
        #expect(inWorkspace.account.kind == .workspace && inWorkspace.account.role == .admin)
        #expect(inWorkspace.balance.credits == inWorkspace.account.credits && inWorkspace.balance.credits != me.balance.credits)
        #expect(inWorkspace.id == me.id)
    }

    @Test func accountWords() throws {
        let list = try fixture("list_accounts", as: AccountList.self)
        let personal = try #require(list.accounts.first)
        var workspace = try #require(list.accounts.last)
        #expect(AccountWords.kind(of: personal) == "Personal")
        #expect(AccountWords.kind(of: workspace) == "Admin")
        #expect(AccountWords.workingIn(workspace) == "Working in Northlight Studio · Admin")
        #expect(AccountWords.initials(of: personal.name) == "AS" && AccountWords.initial(of: workspace.name) == "N")
        #expect(AccountWords.spoken(workspace, current: true) == "Northlight Studio, workspace, admin, 36660 credits, current")
        #expect(AccountWords.spoken(personal, current: false) == "Adam Soffer, personal account, 2480 credits")
        #expect(AccountWords.youWillBe(.member) == "You'll be a member" && AccountWords.youWillBe(.admin) == "You'll be an admin")
        #expect(AccountWords.forYou(.member) != AccountWords.forYou(.admin))
        workspace.status = .paused
        workspace.role = .member
        #expect(AccountWords.kind(of: workspace) == "Member · Suspended")
    }

    @Test func availability() throws {
        let instance = try fixture("get_instance", as: InstanceDescription.self)
        #expect(InstanceStore.availability(of: instance, bundleID: "org.livepeer.app.dev", version: "0.1.0") == .available)
        #expect(InstanceStore.availability(of: instance, bundleID: "Org.Livepeer.App.Dev", version: "0.1.0") == .available)
        // An app the instance doesn't list can't sign in, so it isn't offered.
        #expect(InstanceStore.availability(of: instance, bundleID: "org.example.other", version: "0.1.0") == .notOffered)

        var off = instance
        off.surfaces.mobile = false
        #expect(InstanceStore.availability(of: off, bundleID: "org.livepeer.app.dev", version: "0.1.0") == .notOffered)

        var newer = instance
        newer.mobile.ios?.minimumVersion = "0.10.0"
        #expect(InstanceStore.availability(of: newer, bundleID: "org.livepeer.app.dev", version: "0.9.3") == .updateRequired)
        #expect(InstanceStore.availability(of: newer, bundleID: "org.livepeer.app.dev", version: "0.10.0") == .available)
    }

    @Test func errorsCarryTheirReason() throws {
        let data = Data(#"{"error":{"status":403,"message":"This service doesn't offer its app on phones right now.","code":"mobile_off"}}"#.utf8)
        struct Envelope: Decodable { struct Body: Decodable { let status: Int; let message: String; let code: String? }; let error: Body }
        let body = try JSONDecoder().decode(Envelope.self, from: data).error
        #expect(APIError(status: body.status, message: body.message, code: body.code).isMobileOff)
        #expect(APIError(status: 401, message: "", code: "signed_out").isSignedOut)
    }
}
