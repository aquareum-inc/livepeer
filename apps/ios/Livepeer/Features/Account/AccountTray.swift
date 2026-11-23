import SwiftUI

/// The account menu: who is signed in and their credits, the theme, and signing out. For a guest, the way in.
struct AccountTray: View {
    /// Closes this tray and opens sign-in in its place.
    let signIn: () -> Void
    /// Closes this tray and opens Settings in its place.
    let openSettings: () -> Void
    /// Closes this tray and opens the operator console over the app.
    let openConsole: () -> Void
    @Environment(Account.self) private var account
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @AppStorage("theme") private var theme = "system"
    @State private var confirmingSignOut = false
    @State private var signingOut = false
    @State private var switchFailed = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if account.signedIn, account.hasWorkspaces, let list = account.accounts {
                switcher(list)
            } else if account.signedIn {
                identity
                invitations
            } else {
                Text("Sign in to generate and save your work.")
                    .text(.body)
                    .foregroundStyle(palette.mutedForeground)
                PrimaryButton(label: "Sign in or sign up", action: signIn)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Theme").text(.caption, weight: .medium).foregroundStyle(palette.mutedForeground)
                Picker("Theme", selection: $theme) {
                    Text("System").tag("system")
                    Text("Dark").tag("dark")
                    Text("Light").tag("light")
                }
                .pickerStyle(.segmented)
            }

            if offersConsole {
                Button(action: openConsole) {
                    HStack {
                        Label("Operator console", systemImage: "gauge.with.needle").text(.body, weight: .medium).foregroundStyle(palette.foreground)
                        Spacer()
                        Image(systemName: "chevron.right").imageScale(.small).foregroundStyle(palette.subtleForeground)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityHint("Opens with Face ID or Touch ID")
            }

            if account.signedIn {
                Button(action: openSettings) {
                    HStack {
                        Label("Settings", systemImage: "gearshape").text(.body, weight: .medium).foregroundStyle(palette.foreground)
                        Spacer()
                        Image(systemName: "chevron.right").imageScale(.small).foregroundStyle(palette.subtleForeground)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityHint("Plan and credits, usage, preferences, devices and privacy")

                Button(role: .destructive) { confirmingSignOut = true } label: {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                        .text(.body, weight: .medium)
                        .foregroundStyle(palette.destructive)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .disabled(signingOut)
                .alert("Sign out of this phone?", isPresented: $confirmingSignOut) {
                    Button("Cancel", role: .cancel) {}
                    Button("Sign out", role: .destructive) {
                        signingOut = true
                        Task {
                            await account.signOut()
                            signingOut = false
                        }
                    }
                } message: {
                    Text("Your work stays in your account.")
                }
                .sensoryFeedback(.warning, trigger: confirmingSignOut) { _, showing in showing }
            }
        }
        .task {
            await account.refresh()
            await account.loadAccounts()
        }
        .sensoryFeedback(.selection, trigger: account.accountEpoch)
    }

    /// The accounts the person can work in, the current one ticked. One tap works in another.
    private func switcher(_ list: AccountList) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(spacing: 0) {
                ForEach(list.accounts, id: \.id) { entry in
                    let current = entry.id == (account.me?.account.id ?? list.current)
                    Button {
                        Task {
                            switchFailed = false
                            if await account.switchAccount(to: entry.id) { dismiss() } else { switchFailed = true }
                        }
                    } label: {
                        HStack(spacing: 12) {
                            AccountMark(account: entry, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(entry.name).text(.body, weight: .medium).foregroundStyle(palette.foreground).lineLimit(1)
                                Text(AccountWords.kind(of: entry)).text(.caption).foregroundStyle(palette.subtleForeground)
                            }
                            Spacer(minLength: 8)
                            // The current account's balance is the live one; the others are as last read.
                            Text(Int(current ? account.me?.balance.credits ?? entry.credits : entry.credits).formatted())
                                .text(.caption, mono: true).foregroundStyle(palette.mutedForeground)
                            if account.switchingTo == entry.id {
                                ProgressView().controlSize(.small).frame(width: 18)
                            } else {
                                Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(palette.foreground).opacity(current ? 1 : 0).frame(width: 18)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                    .disabled(account.switchingTo != nil)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(AccountWords.spoken(entry, current: current))
                    .accessibilityAddTraits(current ? [.isButton, .isSelected] : .isButton)
                    .accessibilityHint(current ? "" : "Works in this account")
                }
            }
            if switchFailed {
                Text("That didn't switch. Check your connection and try again.").text(.caption).foregroundStyle(palette.destructive)
            }
            invitations
        }
    }

    /// Invitations waiting, said and not offered: answering one needs its link, which a phone isn't given.
    @ViewBuilder private var invitations: some View {
        ForEach(account.accounts?.invitations ?? [], id: \.id) { invitation in
            Label("\(invitation.invitedByName) invited you to \(invitation.workspaceName). Answer it on the web.", systemImage: "envelope")
                .text(.caption)
                .foregroundStyle(palette.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var offersConsole: Bool {
        account.signedIn && ConsoleSession.offered(to: account.me, by: instance.description)
    }

    private var identity: some View {
        HStack(spacing: 12) {
            Avatar(initials: account.initials, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.me?.name ?? " ").text(.lead, weight: .semibold).foregroundStyle(palette.foreground)
                if let email = account.me?.email {
                    Text(email).text(.body).foregroundStyle(palette.mutedForeground).lineLimit(1).truncationMode(.middle)
                }
            }
            Spacer(minLength: 8)
            if let credits = account.me?.balance.credits {
                (Text(credits, format: .number.precision(.fractionLength(0))).font(.custom(Typeface.monoMedium, size: TypeSize.body.size, relativeTo: .body)) + Text(" credits"))
                    .text(.body)
                    .foregroundStyle(palette.foreground)
                    .contentTransition(.numericText(value: credits))
            }
        }
        .redacted(reason: account.me == nil ? .placeholder : [])
    }
}

/// A person's initials in a circle, or a silhouette for a guest.
struct Avatar: View {
    let initials: String
    var size: CGFloat = 32
    @Environment(\.palette) private var palette

    var body: some View {
        ZStack {
            Circle().fill(palette.secondary)
            if initials.isEmpty {
                Image(systemName: "person.fill").font(.system(size: size * 0.42)).foregroundStyle(palette.mutedForeground)
            } else {
                Text(initials).font(.system(size: size * 0.38, weight: .semibold)).foregroundStyle(palette.foreground)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(palette.hairline, lineWidth: 1))
    }
}

/// An account's mark: the person's initials in a circle for their own, and a workspace's initial in a rounded
/// square, so the two never read as each other.
struct AccountMark: View {
    let account: AccountSummary
    var size: CGFloat = 32
    @Environment(\.palette) private var palette

    var body: some View {
        if account.kind == .workspace {
            let shape = RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            Text(AccountWords.initial(of: account.name))
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(palette.foreground)
                .frame(width: size, height: size)
                .background(palette.secondary, in: shape)
                .overlay(shape.strokeBorder(palette.hairline, lineWidth: 1))
        } else {
            Avatar(initials: AccountWords.initials(of: account.name), size: size)
        }
    }
}

/// The words and letters an account is shown with.
enum AccountWords {
    static func initials(of name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    static func initial(of name: String) -> String {
        name.trimmingCharacters(in: .whitespaces).first.map { String($0).uppercased() } ?? "?"
    }

    static func role(_ role: WorkspaceRole) -> String {
        switch role {
        case .owner: "Owner"
        case .admin: "Admin"
        case .member, .unknown: "Member"
        }
    }

    /// The line under an account's name: "Personal", or the person's role in a workspace.
    static func kind(of account: AccountSummary) -> String {
        guard account.kind == .workspace else { return "Personal" }
        return role(account.role) + (account.status == .paused ? " · Suspended" : "")
    }

    /// Where the person is working and as what, for Settings: "Working in Northlight Studio · Admin".
    static func workingIn(_ account: AccountSummary) -> String { "Working in \(account.name) · \(role(account.role))" }

    static func spoken(_ account: AccountSummary, current: Bool) -> String {
        let what = account.kind == .workspace ? "\(account.name), workspace, \(role(account.role).lowercased())" : "\(account.name), personal account"
        return "\(what), \(Int(account.credits)) credits" + (current ? ", current" : "")
    }
}

/// The account button at the top right of each tab. Opens the account tray. In a workspace it is the
/// workspace's mark, so the shape says whose credit a request will spend.
struct AccountButton: View {
    let open: () -> Void
    @Environment(Account.self) private var account

    var body: some View {
        Button(action: open) {
            Group {
                if let workspace = account.workspace {
                    AccountMark(account: workspace, size: 34)
                } else {
                    Avatar(initials: account.signedIn ? account.initials : "", size: 34)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle(round: true))
        .accessibilityLabel(label)
    }

    private var label: String {
        guard account.signedIn else { return "Account, not signed in" }
        if let workspace = account.workspace { return "Account, \(account.me?.name ?? "signed in"), working in \(workspace.name)" }
        return "Account, \(account.me?.name ?? "signed in")"
    }
}

/// The account button in a navigation bar. It's its own round control, so it sits outside the bar's shared glass.
struct AccountToolbarItem: ToolbarContent {
    let open: () -> Void

    var body: some ToolbarContent {
        if #available(iOS 26, *) {
            ToolbarItem(placement: .topBarTrailing) { AccountButton(open: open) }
                .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarTrailing) { AccountButton(open: open) }
        }
    }
}
