import SwiftUI

/// Where a pushed screen goes.
enum Route: Hashable {
    /// A conversation, shown at once when it was just sent and read by its id otherwise.
    case conversation(id: String, preview: Conversation?)
    case history
}

/// The app's destinations as the system tab bar, with the account and sign-in trays over all of them.
struct MainTabs: View {
    let api: API
    @Environment(InstanceStore.self) private var instance
    @Environment(Account.self) private var account
    @Environment(ConsoleSession.self) private var console
    @Environment(\.palette) private var palette
    @State private var tab = Destination.home
    @State private var homePath: [Route] = []
    @State private var support: ComposerSupport
    @State private var studio: StudioModel
    @State private var home: HomeModel
    @State private var accountOpen: AccountTrayItem?
    /// Set when the account tray hands over to sign-in, which opens once it has closed.
    @State private var signInNext = false
    /// Set when the account tray hands over to Settings, which opens once it has closed.
    @State private var settingsNext = false
    @State private var settingsOpen = false
    /// Set when the account tray hands over to the operator console, which opens once it has closed.
    @State private var consoleNext = false
    @Namespace private var travel

    enum Destination: Hashable { case home, studio, library, characters }

    private struct AccountTrayItem: Identifiable { let id = 0 }

    init(api: API) {
        self.api = api
        _support = State(initialValue: ComposerSupport(api: api))
        _studio = State(initialValue: StudioModel(api: api))
        _home = State(initialValue: HomeModel(api: api))
    }

    var body: some View {
        @Bindable var account = account
        let openAccount = { accountOpen = AccountTrayItem() }
        TabView(selection: $tab) {
            Tab("Home", systemImage: "house", value: Destination.home) {
                NavigationStack(path: $homePath) {
                    HomeView(travel: travel, openAccount: openAccount, openHistory: { homePath.append(.history) }, model: home) { conversation in
                        homePath.append(.conversation(id: conversation.id, preview: conversation))
                    }
                    .navigationDestination(for: Route.self) { route in
                        switch route {
                        case .conversation(let id, let preview):
                            ConversationView(api: api, id: id, conversation: preview)
                                .navigationTransition(.zoom(sourceID: "composer", in: travel))
                                .toolbar(.hidden, for: .tabBar)
                        case .history:
                            HistoryView(api: api) { summary in homePath.append(.conversation(id: summary.id, preview: nil)) }
                        }
                    }
                }
            }
            Tab("Studio", systemImage: "camera.aperture", value: Destination.studio) {
                NavigationStack { StudioView(openAccount: openAccount) }
            }
            Tab("Library", systemImage: "square.grid.2x2", value: Destination.library) {
                NavigationStack { LibraryView(api: api, openAccount: openAccount) }
            }
            if instance.description?.content.characters == true {
                Tab("Characters", systemImage: "person.2", value: Destination.characters) {
                    CharactersView(api: api, openAccount: openAccount)
                }
            }
        }
        .tray(item: $accountOpen, title: { _ in "Account" }, dismissed: {
            if signInNext {
                signInNext = false
                Task { _ = await account.requireSignIn() }
            } else if settingsNext {
                settingsNext = false
                settingsOpen = true
            } else if consoleNext {
                consoleNext = false
                console.present()
            }
        }) { _ in
            AccountTray {
                signInNext = true
                accountOpen = nil
            } openSettings: {
                settingsNext = true
                accountOpen = nil
            } openConsole: {
                consoleNext = true
                accountOpen = nil
            }
        }
        .sheet(isPresented: $settingsOpen) { SettingsView(api: api) }
        .tray(item: $account.prompt, title: { _ in "Sign in or sign up" }, dismissed: account.promptClosed) { prompt in
            SignInTray(reason: prompt.reason)
        }
        .overlay(alignment: .top) { NoticeBanner() }
        .environment(support)
        .environment(studio)
        .environment(\.openConversation) { conversation in
            homePath = [.conversation(id: conversation.id, preview: conversation)]
            tab = .home
        }
        .environment(\.castInScene) { character in
            support.cast(character, into: &home.draft)
            homePath.removeAll()
            tab = .home
        }
        .environment(\.openInStudio) { kind, prompt in
            studio.open(kind, prompt: prompt)
            tab = .studio
        }
        .task { await support.load() }
        .onChange(of: account.signedIn) { _, signedIn in
            if !signedIn {
                support.signedOut()
                homePath.removeAll()
            }
        }
    }
}

/// A short message at the top of the screen, such as "You've been signed out." It goes after a few seconds.
private struct NoticeBanner: View {
    @Environment(Account.self) private var account
    @Environment(\.palette) private var palette
    @Environment(\.motion) private var motion

    var body: some View {
        ZStack {
            if let notice = account.notice {
                Text(notice)
                    .text(.body, weight: .medium)
                    .foregroundStyle(palette.foreground)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .glass(in: Capsule())
                    .padding(.top, 8)
                    .transition(.opacity.combined(with: .offset(y: -8)))
                    .task {
                        try? await Task.sleep(for: .seconds(4))
                        withAnimation(motion(.exit)) { account.notice = nil }
                    }
                    .accessibilityAddTraits(.isStaticText)
                    .onAppear { AccessibilityNotification.Announcement(notice).post() }
            }
        }
        .animation(motion(.enter), value: account.notice)
    }
}

/// What a tab shows a guest: what it's for, and the way in.
struct SignedOutState: View {
    let symbol: String
    let title: String
    let message: String
    @Environment(Account.self) private var account
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 30, weight: .light)).foregroundStyle(palette.mutedForeground).accessibilityHidden(true)
            Text(title).text(.lead, weight: .semibold).foregroundStyle(palette.foreground).multilineTextAlignment(.center)
            Text(message).text(.body).foregroundStyle(palette.mutedForeground).multilineTextAlignment(.center)
            PrimaryButton(label: "Sign in or sign up") { Task { _ = await account.requireSignIn() } }
                .frame(maxWidth: 260)
                .padding(.top, 8)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// What a tab shows when there's nothing in it yet.
struct EmptyState: View {
    let symbol: String
    let title: String
    let message: String
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 30, weight: .light)).foregroundStyle(palette.mutedForeground).accessibilityHidden(true)
            Text(title).text(.lead, weight: .semibold).foregroundStyle(palette.foreground)
            Text(message).text(.body).foregroundStyle(palette.mutedForeground).multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
