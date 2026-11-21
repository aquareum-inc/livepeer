import SwiftUI

/// Reports as a queue: what is waiting, longest first, then what was decided. Who reported is never shown.
struct ReportsView: View {
    let model: ReportsModel
    @Environment(\.palette) private var palette

    var body: some View {
        ScrollView {
            TimelineView(.everyMinute) { timeline in
                LazyVStack(alignment: .leading, spacing: 0) {
                    content(now: timeline.date)
                }
                .padding(.bottom, 16)
            }
        }
        .refreshable { await model.load() }
        .background(palette.background)
        .navigationTitle("Reports")
        .toolbar { ConsoleToolbar() }
        .navigationDestination(for: ReportRoute.self) { ReportDetailView(model: model, id: $0.id) }
        .sensoryFeedback(.success, trigger: model.changes)
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        switch model.phase {
        case .loading:
            ForEach(0..<4, id: \.self) { _ in
                ReportRow(report: .placeholder, now: now).redacted(reason: .placeholder).breathing()
                rule
            }
            .accessibilityHidden(true)
        case .failed(let message):
            LoadFailure(message: message) { Task { await model.load() } }.padding(.top, 32)
        case .loaded:
            if model.waiting.isEmpty {
                Text("No reports are waiting.")
                    .text(.lead)
                    .foregroundStyle(palette.mutedForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            } else {
                rows(model.waiting, now: now)
            }
            if !model.decided.isEmpty {
                Text("Decided")
                    .text(.caption, weight: .medium)
                    .foregroundStyle(palette.mutedForeground)
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
                    .padding(.bottom, 4)
                    .accessibilityAddTraits(.isHeader)
                rows(model.decided, now: now)
            }
        }
    }

    private func rows(_ reports: [CharacterReport], now: Date) -> some View {
        // A decided report is a different row from the waiting one it was, not the same row moved: the lazy
        // stack otherwise keeps drawing what it drew before.
        ForEach(reports, id: \.rowIdentity) { report in
            NavigationLink(value: ReportRoute(id: report.id)) { ReportRow(report: report, now: now) }
                .buttonStyle(RowPressStyle())
            rule
        }
    }

    private var rule: some View {
        Rectangle().fill(palette.hairline).frame(height: 1).padding(.leading, 36)
    }
}

/// A report's own page, by its id: the page follows the report as it is decided.
struct ReportRoute: Hashable { let id: String }

/// One report: the character and when, the reason and the author in mono, then the reporter's own words.
struct ReportRow: View {
    let report: CharacterReport
    let now: Date
    @Environment(\.palette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize

    private var open: Bool { report.state == .open }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            StateDot(tone: open ? .ink : .quiet, lift: 2)
            VStack(alignment: .leading, spacing: 3) {
                if typeSize.isAccessibilitySize {
                    title
                    when
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        title
                        Spacer(minLength: 0)
                        when
                    }
                }
                (Text(open ? report.reason.label : report.state.word).foregroundStyle(open ? palette.foreground : palette.mutedForeground)
                    + Text(" · by\u{00A0}\(report.author)").foregroundStyle(palette.mutedForeground))
                    .text(.caption, mono: true)
                if open, let note = report.note, !note.isEmpty {
                    Text("“\(note)”")
                        .text(.body)
                        .foregroundStyle(palette.mutedForeground)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        .padding(.top, 2)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var title: some View {
        Text(report.characterName).text(.lead, weight: .medium).foregroundStyle(palette.foreground).lineLimit(typeSize.isAccessibilitySize ? nil : 1)
    }

    private var when: some View {
        Text(ConsoleFormat.date(report.createdAt).map { ConsoleFormat.clock($0, now: now) } ?? "").text(.caption, mono: true).foregroundStyle(palette.subtleForeground)
    }
}

extension CharacterReport {
    var rowIdentity: String { "\(id) \(state.rawValue)" }

    /// Stands in for a row while the queue is on its way.
    static let placeholder = CharacterReport(id: "", characterSlug: "", characterName: "A character", author: "its-author", reason: .other, note: "What the person who reported it wrote.", createdAt: "2026-01-01T12:00:00Z", state: .open)
}

/// One report, and the two things an operator can do about it. Each opens a tray that says what will happen;
/// nothing changes here until the instance has done it.
struct ReportDetailView: View {
    let model: ReportsModel
    let id: String
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @State private var change: ConsoleChange?
    /// The report as it was when the page opened, kept in case the queue no longer lists it.
    @State private var last: CharacterReport?

    private var report: CharacterReport? { model.report(id) ?? last }

    var body: some View {
        ScrollView {
            if let report {
                VStack(alignment: .leading, spacing: 24) {
                    header(report)
                    if let note = report.note, !note.isEmpty {
                        ConsoleSection(title: "In their words") {
                            Text("“\(note)”")
                                .text(.lead)
                                .foregroundStyle(palette.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    ConsoleSection(title: "Report") {
                        FactRow(name: "Reason", value: report.reason.label)
                        RowRule()
                        FactRow(name: "Character", value: report.characterSlug, copies: true)
                        RowRule()
                        FactRow(name: "Author", value: report.author, copies: true)
                        if let reported = ConsoleFormat.date(report.createdAt) {
                            RowRule()
                            FactRow(name: "Reported", value: ConsoleFormat.moment(reported))
                        }
                    }
                    if report.state == .open {
                        VStack(spacing: 10) {
                            SecondaryButton(label: "Keep it up") { change = keepUp(report) }
                            Button { change = takeDown(report) } label: {
                                Text("Take it down")
                                    .text(.lead, weight: .medium)
                                    .foregroundStyle(palette.destructive)
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(palette.destructive.opacity(0.4), lineWidth: 1))
                                    .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .background(palette.background)
        .navigationTitle("Report")
        .navigationBarTitleDisplayMode(.inline)
        .changeTray($change)
        .onChange(of: model.report(id), initial: true) { _, current in
            if let current { last = current }
        }
    }

    private func header(_ report: CharacterReport) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(report.characterName)
                .text(.title, weight: .semibold)
                .foregroundStyle(palette.foreground)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                StateDot(tone: report.state == .open ? .ink : report.state == .hidden ? .bad : .quiet)
                Text(report.state.word).text(.body, weight: .medium).foregroundStyle(palette.foreground)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func keepUp(_ report: CharacterReport) -> ConsoleChange {
        ConsoleChange(
            title: "Keep \(report.characterName) up?",
            message: "It stays on \(instance.name) for everyone, and this report is closed.",
            action: "Keep it up",
            destructive: false
        ) { try await model.decide(report, .dismissed, instance: instance.name) }
    }

    private func takeDown(_ report: CharacterReport) -> ConsoleChange {
        ConsoleChange(
            title: "Take \(report.characterName) down?",
            message: "No one on \(instance.name) will see it again, and its other open reports close. Its author keeps their other characters.",
            action: "Take it down",
            destructive: true
        ) { try await model.decide(report, .hidden, instance: instance.name) }
    }
}
