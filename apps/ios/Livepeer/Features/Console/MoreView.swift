import SwiftUI

/// The console's reads beyond the four tabs, each read when its page opens.
struct MoreModels {
    let overview: ConsoleRead<OverviewStats>
    let costs: ConsoleRead<CostSummary>
    let grants: ConsoleRead<[Grant]>
    let plans: ConsoleRead<[Plan]>
    let compute: ConsoleRead<[ComputeOperator]>
    let offered: ConsoleRead<[OfferedCapability]>
    let health: ConsoleRead<EngineHealth>

    /// How many days of network cost the phone asks for.
    static let costDays = 30

    init(session: ConsoleSession) {
        overview = ConsoleRead(failure: "The figures didn't load. Check your connection.") { try await session.read { try await $0.operatorOverview() } }
        costs = ConsoleRead(failure: "The costs didn't load. Check your connection.") { try await session.read { try await $0.operatorCosts(days: Double(Self.costDays)) } }
        grants = ConsoleRead(failure: "The grants didn't load. Check your connection.") { try await session.read { try await $0.operatorListGrants() } }
        plans = ConsoleRead(failure: "The plans didn't load. Check your connection.") { try await session.read { try await $0.operatorListPlans() } }
        compute = ConsoleRead(failure: "The compute operators didn't load. Check your connection.") { try await session.read { try await $0.operatorListCompute() } }
        offered = ConsoleRead(failure: "The capabilities didn't load. Check your connection.") { try await session.read { try await $0.operatorListCapabilities() } }
        health = ConsoleRead(failure: "The engine's state didn't load. Check your connection.") { try await session.read { try await $0.operatorHealth() } }
    }
}

/// The numbers and the network, grouped as the web console groups them, with only what a phone offers. Keys,
/// pricing, billing and settings stay on the web, and the foot of the page says so.
struct MoreView: View {
    let models: MoreModels
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @Environment(\.openURL) private var openURL

    enum Page: Hashable { case revenue, costs, grants, plans, compute, offered, system }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ConsoleSection(title: "Money") {
                    link("Revenue and margin", to: .revenue)
                    RowRule()
                    link("Network cost", to: .costs)
                    RowRule()
                    link("Grants", to: .grants)
                    RowRule()
                    link("Plans", to: .plans)
                }
                ConsoleSection(title: "Network") {
                    link("Compute operators", to: .compute)
                    RowRule()
                    link("What's offered", to: .offered)
                }
                ConsoleSection(title: "Instance") {
                    link("System", to: .system)
                }
                Button { openURL(BuildConfig.instanceURL.appending(path: "operator")) } label: {
                    Text("Keys, pricing, billing and settings are on the web console.")
                        .text(.body)
                        .foregroundStyle(palette.mutedForeground)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityHint("Opens the web console in the browser")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .background(palette.background)
        .navigationTitle("More")
        .toolbar { ConsoleToolbar() }
        .navigationDestination(for: Page.self) { page in
            switch page {
            case .revenue: RevenueView(model: models.overview)
            case .costs: CostsView(model: models.costs)
            case .grants: GrantsView(model: models.grants)
            case .plans: PlansView(model: models.plans)
            case .compute: ComputeView(model: models.compute)
            case .offered: OfferedView(model: models.offered)
            case .system: SystemView(model: models.health)
            }
        }
    }

    private func link(_ name: String, to page: Page) -> some View {
        NavigationLink(value: page) {
            HStack(spacing: 12) {
                Text(name)
                    .text(.lead, weight: .medium)
                    .foregroundStyle(palette.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").imageScale(.small).foregroundStyle(palette.subtleForeground).accessibilityHidden(true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }
}

// MARK: Money

/// What came in, what the network cost, and what was left: today, and day by day.
struct RevenueView: View {
    let model: ConsoleRead<OverviewStats>

    var body: some View {
        ConsoleReadPage(title: "Revenue and margin", model: model) { stats in
            ConsoleSection(title: "Today") {
                FactRow(name: stats.revenueEstimated ? "Revenue, estimated" : "Revenue", value: ConsoleFormat.money(stats.revenueUsd))
                RowRule()
                FactRow(name: "Network cost", value: ConsoleFormat.money(stats.wholesaleUsd))
                RowRule()
                FactRow(name: "Margin", value: Self.margin(stats.marginUsd, of: stats.revenueUsd))
                if stats.pendingUsd > 0 {
                    RowRule()
                    FactRow(name: "Cost not yet settled", value: ConsoleFormat.money(stats.pendingUsd))
                }
            }
            if !stats.series.isEmpty {
                ConsoleSection(title: "Last \(stats.series.count) days") {
                    DayBars(stats: stats)
                    RowRule()
                    FactRow(name: "Revenue", value: ConsoleFormat.money(stats.periodRevenue))
                    RowRule()
                    FactRow(name: "Network cost", value: ConsoleFormat.money(stats.periodCost))
                    RowRule()
                    FactRow(name: "Margin", value: Self.margin(stats.periodMargin, of: stats.periodRevenue))
                }
            }
        } placeholder: {
            ConsoleSection(title: "Today") {
                FactRow(name: "Revenue", value: "$0.00")
                RowRule()
                FactRow(name: "Network cost", value: "$0.00")
                RowRule()
                FactRow(name: "Margin", value: "$0.00")
            }
        }
    }

    /// "$1.50 · 22%": the margin, and its share of revenue when there was any.
    static func margin(_ margin: Double, of revenue: Double) -> String {
        ConsoleFormat.line([ConsoleFormat.money(margin)] + (ConsoleFormat.share(margin, of: revenue).map { [$0] } ?? []))
    }
}

/// A bar a day: the muted part at its foot is what the network cost and the ink above it is the margin, so the
/// whole bar is the day's revenue. A day that cost more than it made is all muted.
private struct DayBars: View {
    let stats: OverviewStats
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(stats.series, id: \.day) { day in
                    // The two parts sit one on the other, never overlapping: the muted colour is see-through.
                    VStack(spacing: 0) {
                        part(max(0, day.revenueUsd - day.wholesaleUsd), palette.foreground)
                        part(day.wholesaleUsd, palette.subtleForeground)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
            .frame(height: 96)
            HStack {
                Text(ConsoleFormat.day(stats.series.first?.day ?? ""))
                Spacer()
                Text(ConsoleFormat.day(stats.series.last?.day ?? ""))
            }
            .text(.caption, mono: true)
            .foregroundStyle(palette.subtleForeground)
            HStack(spacing: 16) {
                key("Margin", palette.foreground)
                key("Network cost", palette.subtleForeground)
            }
        }
        .padding(16)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Revenue and network cost by day, \(ConsoleFormat.day(stats.series.first?.day ?? "")) to \(ConsoleFormat.day(stats.series.last?.day ?? "")). The totals follow.")
    }

    private func part(_ value: Double, _ colour: Color) -> some View {
        Rectangle()
            .fill(colour)
            .frame(height: stats.peak > 0 ? max(value > 0 ? 1 : 0, 96 * value / stats.peak) : 0)
    }

    private func key(_ name: String, _ colour: Color) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2, style: .continuous).fill(colour).frame(width: 10, height: 10)
            Text(name).text(.caption).foregroundStyle(palette.mutedForeground)
        }
    }
}

/// What the network was paid, by what became of the work and by capability.
struct CostsView: View {
    let model: ConsoleRead<CostSummary>

    var body: some View {
        ConsoleReadPage(title: "Network cost", model: model) { summary in
            ConsoleSection(title: "Last \(MoreModels.costDays) days") {
                FactRow(name: "Paid to the network", value: ConsoleFormat.fee(summary.paid))
                RowRule()
                FactRow(name: "For delivered work", value: ConsoleFormat.fee(summary.byClass.delivered.usd))
                RowRule()
                FactRow(name: "For work that failed", value: ConsoleFormat.fee(summary.byClass.failedAfterPayment.usd))
                if summary.byClass.uncertain.usd > 0 {
                    RowRule()
                    FactRow(name: "Outcome not known", value: ConsoleFormat.fee(summary.byClass.uncertain.usd))
                }
                RowRule()
                FactRow(name: "Not yet settled", value: ConsoleFormat.fee(summary.byClass.pending.usd))
                RowRule()
                FactRow(name: "Jobs with a cost", value: ConsoleFormat.count(summary.jobsWithCost))
            }
            if summary.lines.isEmpty {
                EmptyLine(message: "Nothing has cost anything yet.")
            } else {
                ConsoleSection(title: "By capability") {
                    ForEach(Array(summary.lines.enumerated()), id: \.element.id) { index, line in
                        if index > 0 { RowRule() }
                        NamedRow(name: ConsoleFormat.name(ofApp: line.app), facts: [ConsoleFormat.fee(line.delivered) + " delivered"] + (line.showsLost ? [ConsoleFormat.fee(line.lost) + " failed"] : []))
                    }
                }
            }
        } placeholder: {
            ConsoleSection(title: "Last \(MoreModels.costDays) days") {
                FactRow(name: "Paid to the network", value: "$0.00")
                RowRule()
                FactRow(name: "For delivered work", value: "$0.00")
                RowRule()
                FactRow(name: "For work that failed", value: "$0.00")
            }
        }
    }
}

/// Grants and how far each has been spent. Creating and funding one is a desk job on the web.
struct GrantsView: View {
    let model: ConsoleRead<[Grant]>

    var body: some View {
        ConsoleReadPage(title: "Grants", model: model) { grants in
            if grants.isEmpty {
                EmptyLine(message: "No grants have been funded yet.")
            }
            ForEach(grants, id: \.id) { grant in
                ConsoleSection(title: grant.label) {
                    FactRow(name: "Funded", value: ConsoleFormat.money(grant.funded))
                    RowRule()
                    FactRow(name: "Set aside for users", value: ConsoleFormat.money(grant.allocated))
                    RowRule()
                    FactRow(name: "Spent", value: ConsoleFormat.money(grant.spent))
                    RowRule()
                    FactRow(name: "Not yet set aside", value: ConsoleFormat.money(grant.unallocated))
                    RowRule()
                    FactRow(name: "Id", value: grant.id, copies: true)
                }
            }
        } placeholder: {
            ConsoleSection(title: "A grant") {
                FactRow(name: "Funded", value: "$000.00")
                RowRule()
                FactRow(name: "Set aside for users", value: "$000.00")
                RowRule()
                FactRow(name: "Spent", value: "$00.00")
            }
        }
    }
}

/// The provider's plans, as users are offered them. Changing one is done at the provider.
struct PlansView: View {
    let model: ConsoleRead<[Plan]>

    var body: some View {
        ConsoleReadPage(title: "Plans", model: model) { plans in
            if plans.isEmpty {
                EmptyLine(message: "The payment provider has no plans yet.")
            } else {
                ConsoleSection(title: "Offered to users") {
                    ForEach(Array(plans.enumerated()), id: \.element.id) { index, plan in
                        if index > 0 { RowRule() }
                        NamedRow(name: plan.name, facts: [plan.priceLine, plan.allowanceLine, ConsoleFormat.markup(plan.markup)], state: plan.active ? nil : ("Not offered", .quiet))
                    }
                }
            }
        } placeholder: {
            ConsoleSection(title: "Offered to users") {
                NamedRow(name: "A plan", facts: ["$00.00 a month", "0,000 credits a month"])
                RowRule()
                NamedRow(name: "A plan", facts: ["$00.00 a month", "0,000 credits a month"])
            }
        }
    }
}

// MARK: Network

/// The compute operators that ran this instance's recent work, and how they did.
struct ComputeView: View {
    let model: ConsoleRead<[ComputeOperator]>

    var body: some View {
        ConsoleReadPage(title: "Compute operators", model: model) { operators in
            if operators.isEmpty {
                EmptyLine(message: "No compute operator has run a job yet.")
            } else {
                ConsoleSection(title: "From recent jobs") {
                    ForEach(Array(operators.enumerated()), id: \.element.orchestratorUrl) { index, compute in
                        if index > 0 { RowRule() }
                        NamedRow(name: compute.host, facts: compute.facts, state: compute.blocked ? ("Blocked", .bad) : nil)
                    }
                }
            }
        } placeholder: {
            ConsoleSection(title: "From recent jobs") {
                NamedRow(name: "a-compute-operator.example", facts: ["00 jobs", "0 failed", "0.0 s median"])
                RowRule()
                NamedRow(name: "a-compute-operator.example", facts: ["00 jobs", "0 failed", "0.0 s median"])
            }
        }
    }
}

/// Every capability discovered on the network: whether this instance offers it, and whether anyone can run it now.
struct OfferedView: View {
    let model: ConsoleRead<[OfferedCapability]>

    var body: some View {
        ConsoleReadPage(title: "What's offered", model: model) { capabilities in
            if capabilities.isEmpty {
                EmptyLine(message: "Nothing has been discovered on the network yet.")
            } else {
                ConsoleSection(title: "On the network") {
                    ForEach(Array(capabilities.enumerated()), id: \.element.app) { index, capability in
                        if index > 0 { RowRule() }
                        NamedRow(name: capability.name, facts: capability.facts, state: capability.state)
                    }
                }
            }
        } placeholder: {
            ConsoleSection(title: "On the network") {
                ForEach(0..<4, id: \.self) { index in
                    if index > 0 { RowRule() }
                    NamedRow(name: "A capability", facts: ["0 of 0 ready", "default markup"], state: ("Offered", .quiet))
                }
            }
        }
    }
}

// MARK: Instance

/// The engine as it reports itself: ready or not, how fresh its view of the network is, and its version.
struct SystemView: View {
    let model: ConsoleRead<EngineHealth>
    @Environment(\.palette) private var palette

    var body: some View {
        ConsoleReadPage(title: "System", model: model) { health in
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                ConsoleSection(title: "Engine") {
                    NamedRow(name: "Engine", facts: [], state: health.ready ? ("Ready", .good) : ("Not ready", .bad))
                    RowRule()
                    NamedRow(name: "Discovery", facts: Self.seen(health.discoveryObservedAt, now: timeline.date) + (health.discoveryError.map { [$0] } ?? []), state: health.discoveryFresh ? ("Fresh", .good) : ("Stale", .bad))
                    RowRule()
                    NamedRow(name: "Cost sync", facts: Self.seen(health.costSyncAt, now: timeline.date) + (health.costSyncError.map { [$0] } ?? []), state: health.costSyncError == nil ? ("Synced", .good) : ("Failing", .bad))
                }
            }
            ConsoleSection(title: "About") {
                FactRow(name: "Engine version", value: health.version)
                RowRule()
                FactRow(name: "Allocations", value: health.allocationMode.replacingOccurrences(of: "_", with: " "))
                RowRule()
                FactRow(name: "Running now", value: ConsoleFormat.count(health.runningJobs))
            }
            Text("The instance's own setup checks are on the web console's System page.")
                .text(.body)
                .foregroundStyle(palette.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
        } placeholder: {
            ConsoleSection(title: "Engine") {
                NamedRow(name: "Engine", facts: [], state: ("Ready", .quiet))
                RowRule()
                NamedRow(name: "Discovery", facts: ["00 s ago"], state: ("Fresh", .quiet))
                RowRule()
                NamedRow(name: "Cost sync", facts: ["0 min ago"], state: ("Synced", .quiet))
            }
        }
    }

    /// When a part of the service was last seen, as one fact; none when it never was.
    static func seen(_ text: String?, now: Date) -> [String] {
        ConsoleFormat.date(text).map { [ConsoleFormat.ago($0, now: now)] } ?? []
    }
}
