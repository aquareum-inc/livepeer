import AuthenticationServices
import SwiftUI

/// The console, covering the whole app: its own place with its own tabs, never a tab among the user's.
/// Until this phone is signed in and unlocked, a gate covers it and no data shows behind.
struct ConsoleRoot: View {
    @Environment(ConsoleSession.self) private var session
    @Environment(\.palette) private var palette
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            palette.background.ignoresSafeArea()
            // The tabs stay where they were while the console is locked, under the gate, so unlocking returns
            // to the same place.
            if session.enrolled, session.unlocks > 0 {
                ConsoleTabs()
                    .opacity(session.stage == .open ? 1 : 0)
                    .accessibilityHidden(session.stage != .open)
            }
            if session.stage != .open {
                ConsoleGate().transition(.opacity)
            }
            // The app switcher's picture of the console is blank.
            if session.stage == .open, scenePhase != .active {
                palette.background.ignoresSafeArea()
            }
        }
        .animation(.enter, value: session.stage)
    }
}

/// The lock screen, and for a phone that isn't enrolled, the way in: the mark, one sentence, one ink button.
private struct ConsoleGate: View {
    @Environment(ConsoleSession.self) private var session
    @Environment(InstanceStore.self) private var instance
    @Environment(\.webAuthenticationSession) private var web
    @Environment(\.palette) private var palette

    private var signedOut: Bool { session.stage == .signedOut }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)
            VStack(spacing: 20) {
                BrandSymbol().frame(width: 44, height: 44)
                Text("CONSOLE")
                    .text(.caption, weight: .medium, mono: true)
                    .tracking(1.6)
                    .foregroundStyle(palette.mutedForeground)
                    .accessibilityHidden(true)
                Text(signedOut ? "Sign in to run \(instance.name)" : "Unlock the console")
                    .text(.title, weight: .semibold)
                    .foregroundStyle(palette.foreground)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                if signedOut {
                    Text("For the people who run this service. It opens with \(DeviceKey.biometry ?? "Face ID or Touch ID") on this phone.")
                        .text(.body)
                        .foregroundStyle(palette.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                if let failure = session.failure {
                    Text(failure)
                        .text(.body)
                        .foregroundStyle(palette.destructive)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 32)
            Spacer(minLength: 24)
            VStack(spacing: 4) {
                PrimaryButton(label: signedOut ? "Sign in" : "Unlock", busy: session.working) {
                    Task {
                        if signedOut { await session.signIn(using: web) } else { await session.unlock() }
                    }
                }
                Button("Back to the app") { session.dismiss() }
                    .text(.body, weight: .medium)
                    .foregroundStyle(palette.mutedForeground)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .buttonStyle(PressStyle())
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.background.ignoresSafeArea())
    }
}

/// The console's own tab bar. Reports and Users join it with the rest of stage 1.
struct ConsoleTabs: View {
    @Environment(ConsoleSession.self) private var session
    @State private var tab = Destination.status
    @State private var status: StatusModel?
    @State private var jobs: JobsModel?

    enum Destination: Hashable { case status, jobs }

    var body: some View {
        TabView(selection: $tab) {
            Tab("Status", systemImage: "waveform.path.ecg", value: Destination.status) {
                NavigationStack {
                    if let status {
                        StatusView(model: status) { place in open(place) }
                    }
                }
            }
            Tab("Jobs", systemImage: "list.bullet.rectangle", value: Destination.jobs) {
                NavigationStack {
                    if let jobs { JobsView(model: jobs) }
                }
            }
        }
        .onAppear {
            guard status == nil else { return }
            let session = session
            status = StatusModel { try await session.read { try await $0.operatorStatus() } }
            jobs = JobsModel { state, before, limit in
                try await session.read { try await $0.operatorListJobs(limit: Double(limit), status: state, before: before) }
            }
        }
        // Read again each time the console is unlocked: what was on screen may be minutes old.
        .task(id: session.unlocks) {
            async let first: Void? = status?.load()
            async let second: Void? = jobs?.load()
            _ = await (first, second)
        }
    }

    /// Goes to where something that needs attention is dealt with.
    private func open(_ place: OperatorAttentionOpens) {
        guard place == .jobs else { return }
        tab = .jobs
        Task { await jobs?.show(.failed) }
    }

    /// Whether this build has the place a "Needs you" row points to.
    static func offers(_ place: OperatorAttentionOpens) -> Bool { place == .jobs }
}
