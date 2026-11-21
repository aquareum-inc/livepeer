import SwiftUI

/// Recent jobs as a list: two lines a row, filters as chips, older pages as the list is scrolled.
struct JobsView: View {
    let model: JobsModel
    @Environment(\.palette) private var palette

    var body: some View {
        ScrollView {
            // The clock is outside the lazy stack, so rows stay its direct children: laid out as they scroll
            // into view, which is also what asks for the next page.
            TimelineView(.everyMinute) { timeline in
                LazyVStack(alignment: .leading, spacing: 0) {
                    filters
                    content(now: timeline.date)
                }
                .padding(.bottom, 16)
            }
        }
        .refreshable { await model.load() }
        .background(palette.background)
        .navigationTitle("Jobs")
        .toolbar { ConsoleToolbar() }
        .navigationDestination(for: EngineJob.self) { JobDetailView(job: $0) }
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(JobsModel.Filter.allCases) { filter in
                    FilterChip(label: filter.label, selected: model.filter == filter) {
                        Task { await model.show(filter) }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        switch model.phase {
        case .loading:
            ForEach(0..<8, id: \.self) { _ in
                JobRow(job: .placeholder, now: now).redacted(reason: .placeholder).breathing()
                rule
            }
            .accessibilityHidden(true)
        case .failed(let message):
            LoadFailure(message: message) { Task { await model.load() } }.padding(.top, 32)
        case .loaded where model.jobs.isEmpty:
            Text(model.filter.emptyMessage)
                .text(.lead)
                .foregroundStyle(palette.mutedForeground)
                .frame(maxWidth: .infinity)
                .padding(.top, 56)
        case .loaded:
            ForEach(model.jobs, id: \.id) { job in
                NavigationLink(value: job) { JobRow(job: job, now: now) }
                    .buttonStyle(RowPressStyle())
                    .onAppear { if job.id == model.jobs.last?.id { Task { await model.loadMore() } } }
                rule
            }
            foot
        }
    }

    @ViewBuilder
    private var foot: some View {
        if let failure = model.moreFailure {
            LoadFailure(message: failure) { Task { await model.loadMore() } }
        } else if model.loadingMore {
            ProgressView().frame(maxWidth: .infinity).padding(20)
        }
    }

    private var rule: some View {
        Rectangle().fill(palette.hairline).frame(height: 1).padding(.leading, 36)
    }
}

/// A row darkens under the finger; it doesn't shrink, as a list row is part of the page.
private struct RowPressStyle: ButtonStyle {
    @Environment(\.palette) private var palette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? palette.hover : .clear)
    }
}

/// One job in two lines: what ran and when, then its state and facts in mono.
struct JobRow: View {
    let job: EngineJob
    let now: Date
    @Environment(\.palette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            StateDot(tone: job.tone, lift: 2)
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
                (Text(job.stateWord).foregroundStyle(stateColour)
                    + Text(" · " + job.facts.joined(separator: " · ")).foregroundStyle(palette.mutedForeground))
                    .text(.caption, mono: true)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// Failed reads in the destructive colour and work in progress in ink; a finished job is as quiet as its facts.
    private var stateColour: Color {
        switch job.tone {
        case .bad: palette.destructive
        case .active, .ink: palette.foreground
        case .good, .quiet: palette.mutedForeground
        }
    }

    private var title: some View {
        Text(ConsoleFormat.name(ofApp: job.app)).text(.lead, weight: .medium).foregroundStyle(palette.foreground).lineLimit(typeSize.isAccessibilitySize ? nil : 1)
    }

    private var when: some View {
        Text(job.created.map { ConsoleFormat.clock($0, now: now) } ?? "").text(.caption, mono: true).foregroundStyle(palette.subtleForeground)
    }
}

extension EngineJob {
    var tone: StateDot.Tone {
        switch state {
        case .failed, .uncertain: .bad
        case .running, .queued: .active
        case .succeeded, .unknown: .quiet
        }
    }

    /// Stands in for a row while the first page is on its way.
    static let placeholder = EngineJob(id: "00000000", actorId: "", applicationId: "", operationRef: nil, mode: .immediate, app: "text-to-video", capability: nil, model: nil, state: .succeeded, attempts: [], failure: nil, createdAt: "2026-01-01T12:00:00Z", completedAt: "2026-01-01T12:00:09Z")
}
