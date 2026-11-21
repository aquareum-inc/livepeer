import SwiftUI

@main
struct LivepeerApp: App {
    private let api: API
    @State private var instance: InstanceStore
    @State private var account: Account
    @State private var console: ConsoleSession

    init() {
        let vault = TokenVault()
        #if DEBUG
        UITestSession.apply(to: vault)
        #endif
        let relay = RefusalRelay()
        let api = API(transport: APITransport(baseURL: BuildConfig.instanceURL, token: { vault.token }, refused: { relay.send($0) }))
        let instance = InstanceStore(api: api)
        self.api = api
        _instance = State(initialValue: instance)
        _account = State(initialValue: Account(api: api, vault: vault, relay: relay, instance: instance))
        _console = State(initialValue: ConsoleSession(instance: instance))
    }

    var body: some Scene {
        WindowGroup {
            RootView(api: api)
                .environment(instance)
                .environment(account)
                .environment(console)
                .task { await instance.refresh() }
        }
    }
}

struct RootView: View {
    let api: API
    @Environment(InstanceStore.self) private var instance
    @Environment(Account.self) private var account
    @Environment(ConsoleSession.self) private var console
    @Environment(\.motion) private var motion
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.scenePhase) private var scenePhase
    /// "dark" or "light" pins the theme; anything else follows the system.
    @AppStorage("theme") private var theme = "system"

    private var scheme: ColorScheme { theme == "dark" ? .dark : theme == "light" ? .light : systemScheme }

    var body: some View {
        let palette = instance.palette(for: scheme)
        Group {
            switch instance.availability {
            case .available:
                // The console is its own place: it covers the app, tab bar and all, and the app waits under it.
                ZStack {
                    MainTabs(api: api).accessibilityHidden(console.presented)
                    if console.presented { ConsoleRoot().transition(.opacity) }
                }
                .animation(motion(.enter), value: console.presented)
            case .notOffered:
                Unavailable(symbol: "iphone.slash", title: "Not on phones right now", message: "\(instance.name) doesn't offer its app on phones right now. You can still use it on the web.")
            case .updateRequired:
                Unavailable(symbol: "arrow.down.app", title: "Update to carry on", message: "This version of the app is too old for \(instance.name). Update it from the App Store, then open it again.")
            }
        }
        .environment(\.palette, palette)
        .tint(palette.foreground)
        .preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                await instance.refresh()
                await account.refresh()
            }
        }
    }
}

/// Shown instead of the app when it can't be used with this instance right now.
private struct Unavailable: View {
    let symbol: String
    let title: String
    let message: String
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @State private var checking = false

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 34, weight: .light)).foregroundStyle(palette.mutedForeground).accessibilityHidden(true)
            Text(title).text(.title, weight: .semibold).foregroundStyle(palette.foreground).multilineTextAlignment(.center).accessibilityAddTraits(.isHeader)
            Text(message).text(.lead).foregroundStyle(palette.mutedForeground).multilineTextAlignment(.center)
            SecondaryButton(label: checking ? "Checking…" : "Check again") {
                checking = true
                Task {
                    await instance.refresh()
                    checking = false
                }
            }
            .disabled(checking)
            .frame(maxWidth: 240)
            .padding(.top, 10)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.background)
    }
}
