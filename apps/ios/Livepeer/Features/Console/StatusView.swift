import SwiftUI

/// The console's first screen. It answers one question: is anything wrong?
struct StatusView: View {
    let model: StatusModel
    /// Opens the place where something that needs attention is dealt with.
    let open: (OperatorAttentionOpens) -> Void
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    headline(now: timeline.date)
                }
                if let status = model.status {
                    sections(status).opacity(model.trouble == nil ? 1 : 0.5)
                } else if model.trouble == nil {
                    // The same rows at their final height, so nothing moves when the answer arrives.
                    sections(.placeholder).redacted(reason: .placeholder).breathing().accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await model.load() }
        .background(palette.background)
        .navigationTitle("Status")
        .toolbar(removing: .title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ConsoleToolbar() }
    }

    // MARK: The sentence

    @ViewBuilder
    private func headline(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            switch (model.trouble, model.status) {
            case (.unreachable?, _):
                sentence("Can't reach \(instance.name).", tone: .bad)
                note(model.checked.map { "Last checked \(ConsoleFormat.ago($0, now: now)). Check your connection." } ?? "Check your connection.", mono: false)
                retry
            case (.refused(let message)?, _):
                sentence("The status didn't load.", tone: .bad)
                note(message, mono: false)
                retry
            case (nil, let status?):
                sentence(ConsoleFormat.headline(needing: status.attention.count), tone: status.attention.isEmpty ? .good : StatusModel.serviceIsDown(status.attention) ? .bad : .ink)
                if let checked = model.checked { note("Checked \(ConsoleFormat.ago(checked, now: now))", mono: true) }
            case (nil, nil):
                sentence("Checking…", tone: .quiet)
                note(" ", mono: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sentence(_ text: String, tone: StateDot.Tone) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            StateDot(tone: tone, size: 12, lift: 3)
            Text(text)
                .text(.title, weight: .semibold)
                .foregroundStyle(palette.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
    }

    private func note(_ text: String, mono: Bool) -> some View {
        Text(text)
            .text(mono ? .caption : .body, mono: mono)
            .foregroundStyle(palette.mutedForeground)
            .padding(.leading, 24)
    }

    private var retry: some View {
        PrimaryButton(label: "Try again", busy: model.loading) { Task { await model.load() } }
            .frame(maxWidth: 200)
            .padding(.leading, 24)
            .padding(.top, 10)
    }

    // MARK: Needs you, Today, Service

    @ViewBuilder
    private func sections(_ status: OperatorStatus) -> some View {
        if !status.attention.isEmpty {
            ConsoleSection(title: "Needs you") {
                ForEach(Array(status.attention.enumerated()), id: \.offset) { index, item in
                    if index > 0 { RowRule() }
                    AttentionRow(item: item, open: open)
                }
            }
        }
        ConsoleSection(title: "Today") {
            FigureRow(first: ("Active users", ConsoleFormat.count(status.today.activeUsers), status.today.activeUsers), second: ("Running now", ConsoleFormat.count(status.service.runningJobs), status.service.runningJobs))
            RowRule()
            FigureRow(first: ("Jobs", ConsoleFormat.count(status.today.jobs), status.today.jobs), second: ("Failed", ConsoleFormat.count(status.today.failed), status.today.failed))
            RowRule()
            FigureRow(first: (status.today.revenueEstimated ? "Revenue, estimated" : "Revenue", ConsoleFormat.money(status.today.revenueUsd), status.today.revenueUsd), second: ("Margin", ConsoleFormat.money(status.today.marginUsd), status.today.marginUsd))
        }
        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            ConsoleSection(title: "Service") {
                ServiceRow(name: "Engine", good: status.service.engineReady, word: status.service.engineReady ? "Ready" : "Not ready", seen: nil, now: timeline.date)
                RowRule()
                ServiceRow(name: "Discovery", good: status.service.discoveryFresh, word: status.service.discoveryFresh ? "Fresh" : "Stale", seen: ConsoleFormat.date(status.service.discoveryObservedAt), now: timeline.date)
                RowRule()
                ServiceRow(name: "Cost sync", good: status.service.costSyncError == nil, word: status.service.costSyncError == nil ? "Synced" : "Failing", seen: ConsoleFormat.date(status.service.costSyncAt), now: timeline.date, detail: status.service.costSyncError)
                RowRule()
                FactRow(name: "Engine version", value: status.service.engineVersion)
            }
        }
    }
}

/// One thing that needs the operator. It opens the place to deal with it, when this phone has that place.
private struct AttentionRow: View {
    let item: OperatorAttention
    let open: (OperatorAttentionOpens) -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        if ConsoleTabs.offers(item.opens) {
            Button { open(item.opens) } label: { row(chevron: true) }
                .buttonStyle(PressStyle())
        } else {
            row(chevron: false)
        }
    }

    private func row(chevron: Bool) -> some View {
        HStack(spacing: 12) {
            StateDot(tone: item.kind == .reportsWaiting ? .ink : .bad)
            Text(item.message)
                .text(.lead, weight: .medium)
                .foregroundStyle(palette.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
            if chevron {
                Image(systemName: "chevron.right").imageScale(.small).foregroundStyle(palette.subtleForeground).accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

/// Two of today's figures side by side: a name over a number in mono. At the largest text sizes they stack.
/// A number that changes rolls only the digits that changed.
private struct FigureRow: View {
    typealias Figure = (name: String, text: String, value: Double)
    let first: Figure
    let second: Figure
    @Environment(\.palette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(spacing: 0) {
                figure(first)
                RowRule()
                figure(second)
            }
        } else {
            HStack(spacing: 0) {
                figure(first)
                Rectangle().fill(palette.hairline).frame(width: 1)
                figure(second)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func figure(_ figure: Figure) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(figure.name).text(.caption).foregroundStyle(palette.mutedForeground)
            Text(figure.text)
                .text(.title, weight: .medium, mono: true)
                .foregroundStyle(palette.foreground)
                .contentTransition(.numericText(value: figure.value))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// One part of the service: its name, when it was last seen in mono, and its state as a dot with the word.
private struct ServiceRow: View {
    let name: String
    let good: Bool
    let word: String
    let seen: Date?
    let now: Date
    var detail: String?
    @Environment(\.palette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    nameText
                    state
                    if let seen { age(seen) }
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    nameText
                    Spacer(minLength: 0)
                    if let seen { age(seen) }
                    state
                }
            }
            if let detail {
                Text(detail).text(.caption, mono: true).foregroundStyle(palette.destructive)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var nameText: some View {
        Text(name).text(.body).foregroundStyle(palette.mutedForeground)
    }

    private var state: some View {
        HStack(spacing: 8) {
            StateDot(tone: good ? .good : .bad)
            Text(word).text(.body, weight: .medium).foregroundStyle(palette.foreground)
        }
    }

    private func age(_ date: Date) -> some View {
        Text(ConsoleFormat.ago(date, now: now)).text(.caption, mono: true).foregroundStyle(palette.subtleForeground)
    }
}

private extension OperatorStatus {
    /// Stands in while the first answer is on its way: the same rows, with nothing to read in them.
    static let placeholder = OperatorStatus(
        checkedAt: "",
        attention: [],
        today: OperatorStatusToday(activeUsers: 0, jobs: 0, failed: 0, revenueUsd: 0, wholesaleUsd: 0, marginUsd: 0, revenueEstimated: false),
        service: OperatorStatusService(engineReady: true, discoveryFresh: true, discoveryObservedAt: nil, costSyncAt: nil, costSyncError: nil, runningJobs: 0, engineVersion: "0.0.0")
    )
}
