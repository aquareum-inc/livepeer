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
/// A phone with no face or fingerprint set up is told so, and offered nothing to press.
private struct ConsoleGate: View {
    @Environment(ConsoleSession.self) private var session
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @State private var signingIn: SignInItem?

    private struct SignInItem: Identifiable { let id = 0 }

    private var signedOut: Bool { session.stage == .signedOut }
    private var biometry: String? { DeviceKey.biometry }

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
                if let biometry {
                    if signedOut {
                        Text("For the people who run this service. It opens with \(biometry) on this phone.")
                            .text(.body)
                            .foregroundStyle(palette.mutedForeground)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    Text(ConsoleSession.needsBiometrics)
                        .text(.body)
                        .foregroundStyle(palette.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                // Without Face ID the grey sentence above already says why; the same words in red add nothing.
                if let failure = session.failure, signingIn == nil, biometry != nil || failure != ConsoleSession.needsBiometrics {
                    Text(failure)
                        .text(.body)
                        .foregroundStyle(palette.destructive)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 32)
            Spacer(minLength: 24)
            VStack(spacing: 4) {
                if biometry != nil {
                    PrimaryButton(label: signedOut ? "Sign in" : "Unlock", busy: session.working && signingIn == nil) {
                        if signedOut {
                            session.clearFailure()
                            signingIn = SignInItem()
                        } else {
                            Task { await session.unlock() }
                        }
                    }
                }
                if !instance.consoleOnly {
                    Button("Back to the app") { session.dismiss() }
                        .text(.body, weight: .medium)
                        .foregroundStyle(palette.mutedForeground)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.background.ignoresSafeArea())
        .tray(item: $signingIn, title: { _ in "Sign in to the console" }) { _ in ConsoleSignIn() }
        // Signed in: the tray has done its job, and the match that opens the console follows.
        .onChange(of: session.stage) { _, stage in
            if stage != .signedOut { signingIn = nil }
        }
    }
}

/// The console's own sign-in: the instance's methods, a new sign-in at the provider every time, and only for
/// an account that runs the instance.
private struct ConsoleSignIn: View {
    @Environment(ConsoleSession.self) private var session
    @Environment(Account.self) private var account
    @Environment(InstanceStore.self) private var instance
    @Environment(\.webAuthenticationSession) private var web
    @Environment(\.palette) private var palette
    @State private var busy: SignInMethodName?

    /// Where there is a user app, the person may already be signed in to it, and is told this is separate.
    private var note: String {
        instance.consoleOnly
            ? "Only accounts that run this service can open the console."
            : "You'll sign in again, even if you're signed in to the app. Only accounts that run this service can open the console."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(note)
                .text(.body)
                .foregroundStyle(palette.mutedForeground)
            SignInOptions(busy: busy, suggestedEmail: account.me?.email ?? "") { method, email in
                busy = method
                Task {
                    await session.signIn(with: method, email: email, using: web)
                    busy = nil
                }
            }
            if let failure = session.failure {
                Text(failure).text(.body).foregroundStyle(palette.destructive).accessibilityAddTraits(.updatesFrequently)
            }
        }
    }
}

/// The console's own tab bar: is anything wrong, what ran, what was reported, who uses it, and the numbers.
struct ConsoleTabs: View {
    @Environment(ConsoleSession.self) private var session
    @State private var tab = Destination.status
    @State private var models: Models?
    /// What is pushed on More, held here so Status and a tapped alert can lead to a page of it.
    @State private var morePath: [MoreView.Page] = []

    enum Destination: Hashable { case status, jobs, reports, users, more }

    private struct Models {
        let status: StatusModel
        let jobs: JobsModel
        let reports: ReportsModel
        let users: UsersModel
        let more: MoreModels
        let alerts: AlertsModel
    }

    var body: some View {
        TabView(selection: $tab) {
            Tab("Status", systemImage: "waveform.path.ecg", value: Destination.status) {
                NavigationStack {
                    if let models {
                        StatusView(model: models.status, alerts: models.alerts, openAlerts: {
                            tab = .more
                            morePath = [.alerts]
                        }) { place in open(place) }
                    }
                }
            }
            Tab("Jobs", systemImage: "list.bullet.rectangle", value: Destination.jobs) {
                NavigationStack {
                    if let models { JobsView(model: models.jobs) }
                }
            }
            Tab("Reports", systemImage: "flag", value: Destination.reports) {
                NavigationStack {
                    if let models { ReportsView(model: models.reports) }
                }
            }
            .badge(models?.reports.waiting.count ?? 0)
            Tab("Users", systemImage: "person.2", value: Destination.users) {
                NavigationStack {
                    if let models { UsersView(model: models.users) }
                }
            }
            Tab("More", systemImage: "ellipsis", value: Destination.more) {
                NavigationStack(path: $morePath) {
                    if let models { MoreView(models: models.more, alerts: models.alerts) }
                }
            }
        }
        .onAppear {
            guard models == nil else { return }
            let session = session
            models = Models(
                status: StatusModel { try await session.read { try await $0.operatorStatus() } },
                jobs: JobsModel { state, before, limit in
                    try await session.read { try await $0.operatorListJobs(limit: Double(limit), status: state, before: before) }
                },
                reports: ReportsModel(
                    read: { try await session.read { try await $0.operatorListReports() } },
                    resolve: { report, outcome in
                        try await session.confirm("operator_resolve_report", input: OperatorAPI<ConsoleTransport>.operatorResolveReportInput(id: report.id, outcome: outcome.rawValue), reason: outcome.prompt(for: report)) { api, proof in
                            try await api.operatorResolveReport(id: report.id, outcome: outcome.rawValue, proof: proof)
                        }
                    }
                ),
                users: UsersModel(
                    read: { query in try await session.read { try await $0.operatorListUsers(query: query) } },
                    setStatus: { user, status in
                        try await session.confirm("operator_set_user_status", input: OperatorAPI<ConsoleTransport>.operatorSetUserStatusInput(id: user.actorId, status: status.rawValue, applicationId: user.applicationId), reason: status.prompt(for: user)) { api, proof in
                            try await api.operatorSetUserStatus(id: user.actorId, status: status.rawValue, applicationId: user.applicationId, proof: proof).ok
                        }
                    }
                ),
                more: MoreModels(session: session),
                alerts: AlertsModel(
                    device: SystemPush.shared,
                    memory: AlertsMemory(),
                    read: { try await session.read { try await $0.operatorGetAlerts() } },
                    set: { kinds, pushToken, reason in
                        // Only a phone turning alerts on names which of Apple's services its push token is from.
                        let environment = pushToken == nil ? nil : SystemPush.shared.environment
                        return try await session.confirm("operator_set_alerts", input: OperatorAPI<ConsoleTransport>.operatorSetAlertsInput(kinds: kinds, pushToken: pushToken, environment: environment), reason: reason) { api, proof in
                            try await api.operatorSetAlerts(kinds: kinds, pushToken: pushToken, environment: environment, proof: proof)
                        }
                    },
                    test: {
                        try await session.confirm("operator_test_alert", input: OperatorAPI<ConsoleTransport>.operatorTestAlertInput(), reason: "Send a test alert") { api, proof in
                            try await api.operatorTestAlert(proof: proof).ok
                        }
                    }
                )
            )
        }
        // Read again each time the console is unlocked: what was on screen may be minutes old.
        .task(id: session.unlocks) {
            guard let models else { return }
            async let status: Void = models.status.load()
            async let jobs: Void = models.jobs.load()
            async let reports: Void = models.reports.load()
            async let users: Void = models.users.load()
            async let alerts: Void = models.alerts.load()
            _ = await (status, jobs, reports, users, alerts)
        }
        // An alert arrived while the console was open: what it is about is read again, and no banner is shown.
        .onChange(of: session.heard) {
            Task { await models?.status.load() }
        }
        // A tapped alert leads to the place it points at, once the console is open, and to nothing else.
        .onChange(of: session.arrival, initial: true) { arrive() }
        .onChange(of: session.stage) { arrive() }
        // When Status hears of a different number of waiting reports than the queue holds, the queue is read
        // again, so the count on the Reports tab never disagrees with the sentence on Status.
        .onChange(of: models?.status.status.map(Self.waitingReports)) { _, reported in
            guard let models, let reported, reported != models.reports.waiting.count else { return }
            Task { await models.reports.load() }
        }
        // A decision changes what Status says is waiting, so it is read again once the instance has made one.
        .onChange(of: models?.reports.changes) {
            Task { await models?.status.load() }
        }
    }

    private func arrive() {
        guard let place = session.arrival, session.stage == .open else { return }
        switch place {
        case .jobs: open(.jobs)
        case .reports: open(.reports)
        case .status: tab = .status
        }
        session.arrived()
    }

    /// Goes to where something that needs attention is dealt with.
    private func open(_ place: OperatorAttentionOpens) {
        switch place {
        case .jobs:
            tab = .jobs
            Task { await models?.jobs.show(.failed) }
        case .reports:
            tab = .reports
        case .status, .unknown:
            break
        }
    }

    /// How many reports Status says are waiting.
    nonisolated static func waitingReports(_ status: OperatorStatus) -> Int {
        Int(status.attention.first { $0.kind == .reportsWaiting }?.count ?? 0)
    }

    /// Whether a "Needs you" row leads somewhere other than the screen it is on.
    static func offers(_ place: OperatorAttentionOpens) -> Bool { place == .jobs || place == .reports }
}
