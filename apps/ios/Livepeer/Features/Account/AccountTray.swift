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

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if account.signedIn {
                identity
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
        .task { await account.refresh() }
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

/// The account button at the top right of each tab. Opens the account tray.
struct AccountButton: View {
    let open: () -> Void
    @Environment(Account.self) private var account

    var body: some View {
        Button(action: open) {
            Avatar(initials: account.signedIn ? account.initials : "", size: 34)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle(round: true))
        .accessibilityLabel(account.signedIn ? "Account, \(account.me?.name ?? "signed in")" : "Account, not signed in")
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
