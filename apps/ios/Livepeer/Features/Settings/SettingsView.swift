import SwiftUI

/// Settings, opened from the account tray: who you are, then plan and credits, usage, preferences, devices
/// and privacy, and deleting the account.
struct SettingsView: View {
    @State private var model: SettingsModel
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var deleteFailed = false
    @Environment(Account.self) private var account
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var palette

    init(api: API) { _model = State(initialValue: SettingsModel(api: api)) }

    enum Page: Hashable { case plan, usage, preferences, devices, privacy }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Avatar(initials: account.initials, size: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(account.me?.name ?? " ").text(.lead, weight: .semibold).foregroundStyle(palette.foreground)
                            if let email = account.me?.email { Text(verbatim: email).text(.body).foregroundStyle(palette.mutedForeground) }
                        }
                    }
                    .padding(.vertical, 4)
                    .redacted(reason: account.me == nil ? .placeholder : [])
                    if let workspace = account.workspace {
                        HStack(spacing: 12) {
                            AccountMark(account: workspace, size: 28).frame(width: 48)
                            Text(AccountWords.workingIn(workspace)).text(.body).foregroundStyle(palette.foreground)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } footer: {
                    if account.workspace != nil { Text("Plan, credits and usage below are the workspace's. Members, roles and invitations are on the web.") }
                }
                Section {
                    row(.plan, "Plan and credits", symbol: "creditcard", detail: account.me.map { "\(Int($0.balance.credits).formatted()) credits" })
                    row(.usage, "Usage", symbol: "chart.bar")
                    row(.preferences, "Preferences", symbol: "slider.horizontal.3")
                    row(.devices, "Devices", symbol: "iphone")
                    row(.privacy, "Privacy", symbol: "hand.raised")
                }
                Section {
                    Button("Delete account…", role: .destructive) { confirmingDelete = true }
                        .foregroundStyle(palette.destructive)
                        .disabled(deleting)
                } footer: {
                    Text("Removes your account, your characters and what you've made here, and signs out every device.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(palette.background)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .navigationDestination(for: Page.self) { page in
                switch page {
                case .plan: PlanSettingsView()
                case .usage: UsageSettingsView()
                case .preferences: PreferencesSettingsView()
                case .devices: DevicesSettingsView()
                case .privacy: PrivacySettingsView()
                }
            }
            .alert("Delete your account?", isPresented: $confirmingDelete) {
                Button("Keep my account", role: .cancel) {}
                Button("Delete account", role: .destructive) {
                    deleting = true
                    Task {
                        if await account.deleteAccount() { dismiss() } else { deleteFailed = true }
                        deleting = false
                    }
                }
            } message: {
                Text("Your characters, conversations and library go, every device is signed out, and credits left on the account are lost. This can't be undone.")
            }
            .alert("Your account wasn't deleted", isPresented: $deleteFailed) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Check your connection and try again.")
            }
        }
        .environment(model)
        .tint(palette.foreground)
        .task { await account.refresh() }
    }

    private func row(_ page: Page, _ title: String, symbol: String, detail: String? = nil) -> some View {
        NavigationLink(value: page) {
            HStack {
                Label(title, systemImage: symbol).foregroundStyle(palette.foreground)
                Spacer()
                if let detail { Text(detail).font(.custom(Typeface.mono, size: TypeSize.caption.size, relativeTo: .caption)).foregroundStyle(palette.mutedForeground) }
            }
        }
    }
}

/// A settings page's loading and failure states around what it shows.
private struct SettingsPage<Value, Content: View>: View {
    let title: String
    let state: Loadable<Value>
    let failure: String
    let load: () async -> Void
    @ViewBuilder let content: (Value) -> Content
    @Environment(\.palette) private var palette

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).accessibilityLabel("Loading")
            case .failed: LoadFailure(message: failure) { Task { await load() } }.frame(maxHeight: .infinity)
            case .loaded(let value): content(value)
            }
        }
        .background(palette.background)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }
}

/// The balance and the plan. Nothing here buys anything.
private struct PlanSettingsView: View {
    @Environment(SettingsModel.self) private var model
    @Environment(Account.self) private var account
    @Environment(\.palette) private var palette

    var body: some View {
        SettingsPage(title: "Plan and credits", state: model.plan, failure: "Your plan didn't load. Check your connection and try again.", load: model.loadPlan) { details in
            List {
                Section(account.workspace.map { "\($0.name)'s balance" } ?? "Balance") {
                    VStack(alignment: .leading, spacing: 4) {
                        if let credits = account.me?.balance.credits {
                            Text(Int(credits).formatted()).font(.custom(Typeface.monoMedium, size: TypeSize.title.size, relativeTo: .title)).foregroundStyle(palette.foreground)
                                .accessibilityLabel("\(Int(credits)) credits")
                        }
                        Text("credits left").text(.body).foregroundStyle(palette.mutedForeground)
                    }
                    .padding(.vertical, 4)
                }
                Section {
                    if let plan = details.plan {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(plan.name).text(.lead, weight: .semibold).foregroundStyle(palette.foreground)
                                Spacer()
                                Text(SettingsModel.price(of: plan)).text(.caption, mono: true).foregroundStyle(palette.mutedForeground)
                            }
                            Text("\(Int(plan.allowance.credits).formatted()) credits a \(plan.allowance.period == .year ? "year" : "month")").text(.body).foregroundStyle(palette.foreground)
                            if !plan.description.isEmpty { Text(plan.description).text(.body).foregroundStyle(palette.mutedForeground) }
                        }
                        .padding(.vertical, 4)
                        ForEach(plan.features, id: \.self) { feature in
                            Label(feature, systemImage: "checkmark").text(.body).foregroundStyle(palette.foreground)
                        }
                    } else if let workspace = account.workspace {
                        Text("\(workspace.name) isn't on a plan. Work here uses the credits on the workspace.").text(.body).foregroundStyle(palette.mutedForeground)
                    } else {
                        Text("You're not on a plan. Your work uses the credits on your account.").text(.body).foregroundStyle(palette.mutedForeground)
                    }
                } header: {
                    Text("Plan")
                } footer: {
                    if let workspace = account.workspace {
                        Text(workspace.role == .owner ? "You own this workspace. Add credit or change its plan on the web." : "The workspace's owner adds credit and chooses its plan.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .refreshable { await model.loadPlan(); await account.refresh() }
        }
    }
}

/// What has been spent, by capability, and the most recent jobs.
private struct UsageSettingsView: View {
    @Environment(SettingsModel.self) private var model
    @Environment(Account.self) private var account
    @Environment(\.palette) private var palette

    var body: some View {
        SettingsPage(title: "Usage", state: model.usage, failure: "Usage didn't load. Check your connection and try again.", load: model.loadUsage) { usage in
            if usage.entries.isEmpty {
                EmptyState(symbol: "chart.bar", title: "No usage yet", message: account.workspace.map { "Nothing has been charged to \($0.name) yet. Each generation, analysis and session made here is listed with what it cost." } ?? "Each generation, analysis and session you run is listed here with what it cost.")
            } else {
                List {
                    Section {
                        HStack(spacing: 12) {
                            total("Credits used", usage.summary.credits)
                            total("Jobs run", usage.summary.jobs)
                        }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    } footer: {
                        if let workspace = account.workspace {
                            Text(workspace.role == .member ? "What you've used in \(workspace.name). Its owner and admins see everyone's." : "Everything made in \(workspace.name), by everyone and every API key. Usage by member is on the web.")
                        }
                    }
                    Section("By capability") {
                        let top = usage.summary.byApp.first?.credits ?? 1
                        ForEach(usage.summary.byApp, id: \.app) { row in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(model.label(row.app)).text(.body, weight: .medium).foregroundStyle(palette.foreground)
                                    Spacer()
                                    Text("\(Int(row.credits).formatted()) · \(Int(row.jobs)) jobs").text(.caption, mono: true).foregroundStyle(palette.mutedForeground)
                                }
                                GeometryReader { size in
                                    Capsule().fill(palette.foreground.opacity(0.7)).frame(width: max(4, size.size.width * row.credits / max(top, 1)))
                                }
                                .frame(height: 4)
                                .background(palette.secondary, in: Capsule())
                                .accessibilityHidden(true)
                            }
                            .padding(.vertical, 2)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    Section("Recent") {
                        ForEach(usage.entries, id: \.id) { entry in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(model.label(entry.app)).text(.body).foregroundStyle(palette.foreground)
                                    Text(when(entry.createdAt) + (entry.status == .failedAfterPayment ? " · failed after payment" : entry.status == .pending ? " · pending" : ""))
                                        .text(.caption, mono: true).foregroundStyle(entry.status == .failedAfterPayment ? palette.destructive : palette.subtleForeground)
                                }
                                Spacer()
                                Text(Int(entry.credits).formatted()).text(.body, mono: true).foregroundStyle(palette.foreground)
                                    .accessibilityLabel("\(Int(entry.credits)) credits")
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                .scrollContentBackground(.hidden)
                .refreshable { await model.loadUsage() }
            }
        }
    }

    private func total(_ label: String, _ value: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).text(.caption).foregroundStyle(palette.subtleForeground)
            Text(Int(value).formatted()).font(.custom(Typeface.monoMedium, size: TypeSize.title.size, relativeTo: .title)).foregroundStyle(palette.foreground)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private func when(_ value: String) -> String {
        guard let date = try? Date(value, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .omitted)) ?? (try? Date(value, strategy: .iso8601)) else { return value }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }
}

/// The settings that follow the account to every surface. Adult content is shown, never switched, here.
private struct PreferencesSettingsView: View {
    @Environment(SettingsModel.self) private var model
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette

    var body: some View {
        SettingsPage(title: "Preferences", state: model.preferences, failure: "Your preferences didn't load. Check your connection and try again.", load: model.loadPreferences) { preferences in
            Form {
                if let error = model.error { Text(error).foregroundStyle(palette.destructive) }
                Section {
                    Picker("Shape", selection: Binding(get: { preferences.defaultAspect }, set: { value in Task { await model.update { $0.defaultAspect = value } } })) {
                        ForEach([PreferencesDefaultAspect.v16x9, .v9x16, .v1x1], id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    Picker("Length", selection: Binding(get: { preferences.defaultDuration }, set: { value in Task { await model.update { $0.defaultDuration = value } } })) {
                        ForEach([5.0, 10, 15], id: \.self) { Text("\(Int($0)) seconds").tag($0) }
                    }
                } header: {
                    Text("New videos")
                } footer: {
                    Text("Saved to your account, for new video requests.")
                }
                Section {
                    Toggle("Save my conversations", isOn: Binding(get: { preferences.saveChats }, set: { value in Task { await model.update { $0.saveChats = value } } }))
                    Toggle("Ask before spending credits", isOn: Binding(get: { preferences.confirmBeforeSpending }, set: { value in Task { await model.update { $0.confirmBeforeSpending = value } } }))
                } footer: {
                    Text("Off, new conversations disappear when you close them. Asking first, the agent shows the cost and waits for you before it generates video.")
                }
                .toggleStyle(SwitchToggleStyle(tint: palette.mutedForeground))
                if instance.description?.content.adultContent == true {
                    Section {
                        LabeledContent("Adult content", value: preferences.adultContent ? "On" : "Off")
                    } footer: {
                        Text("You can change this on the web, in Settings.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
    }
}

/// The phones and tablets signed in to this account. Any but this one can be signed out from here.
private struct DevicesSettingsView: View {
    @Environment(SettingsModel.self) private var model
    @Environment(\.palette) private var palette
    @State private var signingOut: DeviceSession?

    var body: some View {
        SettingsPage(title: "Devices", state: model.devices, failure: "Your devices didn't load. Check your connection and try again.", load: model.loadDevices) { devices in
            List {
                if let error = model.error { Text(error).foregroundStyle(palette.destructive) }
                Section {
                    ForEach(devices, id: \.id) { device in
                        HStack(spacing: 12) {
                            Image(systemName: device.platform == .ios ? "iphone" : "smartphone").foregroundStyle(palette.mutedForeground).frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(device.name).text(.body, weight: .medium).foregroundStyle(palette.foreground)
                                Text(device.current ? "This phone" : "Last used \(last(device.lastUsedAt))").text(.caption, mono: true).foregroundStyle(palette.subtleForeground)
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .swipeActions {
                            if !device.current { Button("Sign out", role: .destructive) { signingOut = device }.tint(palette.destructiveFill) }
                        }
                        .contextMenu {
                            if !device.current { Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { signingOut = device } }
                        }
                    }
                } footer: {
                    Text("Swipe a device to sign it out. To sign out this phone, use Sign out in the account menu.")
                }
            }
            .scrollContentBackground(.hidden)
            .refreshable { await model.loadDevices() }
            .alert("Sign out “\(signingOut?.name ?? "")”?", isPresented: Binding(get: { signingOut != nil }, set: { if !$0 { signingOut = nil } })) {
                Button("Cancel", role: .cancel) {}
                Button("Sign out", role: .destructive) { if let device = signingOut { Task { await model.revoke(device) } } }
            } message: {
                Text("It's signed out the next time it's used.")
            }
        }
    }

    private func last(_ value: String) -> String {
        guard let date = try? Date(value, strategy: .iso8601) else { return value }
        return date.formatted(.relative(presentation: .named))
    }
}

/// Who can see a job: the instance operator and the compute operator, for each way of running it.
private struct PrivacySettingsView: View {
    @Environment(SettingsModel.self) private var model
    @Environment(\.palette) private var palette

    var body: some View {
        SettingsPage(title: "Privacy", state: model.privacy, failure: "This didn't load. Check your connection and try again.", load: model.loadPrivacy) { privacy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Two parties can potentially see a job: the instance operator, who runs this app, and the compute operator, whose GPU on the network runs it.")
                        .text(.body).foregroundStyle(palette.mutedForeground)
                    Text("This service \(privacy.retainsChats ? "keeps your prompts and outputs on its servers so you can return to them" : "does not keep your prompts or outputs on its servers"). Compute operators are independent; treat a job's content as visible to the operator that runs it.")
                        .text(.body).foregroundStyle(palette.mutedForeground)
                    ForEach(privacy.tiers, id: \.name) { tier in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Text(tier.name).text(.body, weight: .semibold).foregroundStyle(palette.foreground)
                                if let status = tier.status {
                                    Text(status).text(.caption, weight: .medium).foregroundStyle(palette.mutedForeground)
                                        .padding(.horizontal, 7).padding(.vertical, 2).background(palette.secondary, in: Capsule())
                                }
                            }
                            Text(tier.summary).text(.body).foregroundStyle(palette.mutedForeground)
                            fact("Instance operator can see", tier.instanceSees)
                            fact("Compute operator can see", tier.computeSees)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))
                    }
                }
                .padding(16)
            }
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).text(.caption, weight: .medium).foregroundStyle(palette.subtleForeground)
            Text(value).text(.body).foregroundStyle(palette.foreground)
        }
    }
}
