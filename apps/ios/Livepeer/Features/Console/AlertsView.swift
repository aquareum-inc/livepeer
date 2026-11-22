import SwiftUI

/// Alerts on this phone: whether it is told when something needs the operator, and about what. The switches
/// are a draft. Nothing changes until the page's one button is pressed and a face or fingerprint confirms it,
/// because every change needs its own match and three prompts for three switches would be absurd.
struct AlertsView: View {
    let model: AlertsModel
    @Environment(InstanceStore.self) private var instance
    @Environment(ConsoleSession.self) private var session
    @Environment(\.palette) private var palette
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var change: ConsoleChange?
    @State private var testing = false
    @State private var testFailure: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if model.alerts != nil {
                    page
                } else if case .failed(let message) = model.phase {
                    LoadFailure(message: message) { Task { await model.load() } }.padding(.top, 32)
                } else {
                    VStack(alignment: .leading, spacing: 24) {
                        Text("Alerts are off on this phone.").text(.lead)
                        choices(Self.placeholder, chosen: [])
                    }
                    .redacted(reason: .placeholder)
                    .breathing()
                    .accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await model.load() }
        .background(palette.background)
        .navigationTitle("Alerts")
        .navigationBarTitleDisplayMode(.inline)
        .changeTray($change)
        .sensoryFeedback(.success, trigger: model.changes)
        // Read again each time the console is unlocked, and the phone's own settings each time the app comes
        // back: notifications may have been switched on or off in Settings since.
        .task(id: session.unlocks) { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.recheck() } }
        }
    }

    @ViewBuilder
    private var page: some View {
        let standing = model.standing
        switch standing {
        case .notOffered:
            sentence("This service hasn't set up alerts for iPhone.", why: "They need push credentials on the server. Running ./livepeer doctor there says what is missing.")
        case .unknown:
            EmptyView()
        default:
            switch standing {
            case .on: Text("This phone is told when something needs you.").text(.lead).foregroundStyle(palette.foreground)
            case .blocked:
                sentence("Notifications are off for \(instance.name) in Settings, so alerts can't show.", why: nil)
                SecondaryButton(label: "Open Settings") {
                    if let settings = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(settings) }
                }
            case .stopped: sentence("Alerts have stopped on this phone.", why: "Where they were sent no longer reaches it. Turning them back on mends that.")
            default: Text("Alerts are off on this phone.").text(.lead).foregroundStyle(palette.foreground)
            }

            VStack(alignment: .leading, spacing: 8) {
                choices(model.choices, chosen: model.draft)
                Text("A phone being added to the console is always told.")
                    .text(.body)
                    .foregroundStyle(palette.mutedForeground)
                    .padding(.horizontal, 4)
            }

            if let alerts = model.alerts, standing == .on || standing == .blocked {
                ConsoleSection(title: "Now") {
                    if let until = ConsoleFormat.date(alerts.until) {
                        FactRow(name: "Stops", value: "\(ConsoleFormat.day(until)), unless this phone signs in again")
                        RowRule()
                    }
                    TimelineView(.periodic(from: .now, by: 30)) { timeline in
                        FactRow(name: "Last alert", value: ConsoleFormat.date(alerts.lastAlertAt).map { ConsoleFormat.ago($0, now: timeline.date) } ?? "None yet")
                    }
                }
            }

            // The page's one action: what the switches would do, said in a tray and confirmed with a match.
            if let action = model.action {
                PrimaryButton(label: action) { change = applying(standing) }
            }

            if standing == .on || standing == .blocked {
                VStack(spacing: 8) {
                    if standing == .on { testAlert }
                    // Turning off takes nothing from anyone else, so it isn't red.
                    SecondaryButton(label: "Turn off alerts") { change = turningOff }
                }
            }

            Text("Alerts come from this service. If it is down, it can't tell you.")
                .text(.caption)
                .foregroundStyle(palette.subtleForeground)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16)
        }
    }

    /// What the page has to say when there is little or nothing to choose: one sentence, and why.
    private func sentence(_ text: String, why: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text).text(.lead).foregroundStyle(palette.foreground)
            if let why { Text(why).text(.body).foregroundStyle(palette.mutedForeground) }
        }
    }

    /// One switch a kind, with the instance's own words. The switches are never the system's green: green is
    /// not for controls.
    private func choices(_ choices: [OperatorAlertChoice], chosen: Set<OperatorAlertKind>) -> some View {
        ConsoleSection(title: "Tell this phone when") {
            ForEach(Array(choices.enumerated()), id: \.element.kind) { index, choice in
                if index > 0 { RowRule() }
                Toggle(isOn: Binding(get: { chosen.contains(choice.kind) }, set: { _ in model.toggle(choice.kind) })) {
                    Text(choice.label).text(.lead).foregroundStyle(palette.foreground)
                }
                .toggleStyle(SwitchToggleStyle(tint: palette.mutedForeground))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(minHeight: 52)
            }
        }
    }

    /// Sends this phone a test alert after a match, and says under it how that went.
    private var testAlert: some View {
        VStack(spacing: 2) {
            Button("Send a test alert") {
                testing = true
                testFailure = nil
                Task {
                    defer { testing = false }
                    testFailure = try? await model.sendTest(instance: instance.name)
                }
            }
            .text(.body, weight: .medium)
            .foregroundStyle(palette.foreground)
            .frame(maxWidth: .infinity, minHeight: 44)
            .buttonStyle(PressStyle())
            .disabled(testing)
            if let said = testFailure ?? model.tested.map({ $0 ? "Sent. It should arrive in a moment." : "It couldn't be delivered to this phone." }) {
                Text(said)
                    .text(.caption)
                    .foregroundStyle(testFailure != nil || model.tested == false ? palette.destructive : palette.mutedForeground)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private func applying(_ standing: AlertsModel.Standing) -> ConsoleChange {
        if model.draft.isEmpty { return turningOff }
        let told = "\(instance.name) will send a notification here when \(AlertsModel.sentence(model.choices, chosen: model.draft))."
        let name = instance.name
        if standing == .off || standing == .stopped {
            return ConsoleChange(title: "Turn on alerts on this phone?", message: "\(told) A notification never names a person or shows what was reported. Alerts stop when the console signs out on this phone.", action: "Turn on alerts", destructive: false) {
                try await model.apply(instance: name)
            }
        }
        return ConsoleChange(title: "Save these choices?", message: told, action: "Save changes", destructive: false) { try await model.apply(instance: name) }
    }

    private var turningOff: ConsoleChange {
        let name = instance.name
        return ConsoleChange(title: "Turn off alerts on this phone?", message: "This phone won't be told when something needs you. You can turn them back on at any time.", action: "Turn off alerts", destructive: false) {
            try await model.turnOff(instance: name)
        }
    }

    /// Stands in while the first answer is on its way: the same rows, with nothing to read in them.
    private static let placeholder = [
        OperatorAlertChoice(kind: .engineNotReady, label: "The engine stops being ready", on: false),
        OperatorAlertChoice(kind: .jobsFailing, label: "Jobs are failing", on: false),
        OperatorAlertChoice(kind: .reportsWaiting, label: "A report is waiting", on: false),
    ]
}
