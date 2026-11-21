import SwiftUI

/// One job: what happened, the failure as it was written, and each attempt with the compute operator it went to.
struct JobDetailView: View {
    let job: EngineJob
    @Environment(\.palette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                if let failure = job.failure { FailureCard(failure: failure) }
                ConsoleSection(title: "Job") {
                    FactRow(name: "User", value: job.actorId, copies: true)
                    if let model = job.model { RowRule(); FactRow(name: "Model", value: model) }
                    if let created = job.created { RowRule(); FactRow(name: "Started", value: ConsoleFormat.moment(created)) }
                    if let finished = ConsoleFormat.date(job.completedAt) { RowRule(); FactRow(name: "Finished", value: ConsoleFormat.moment(finished)) }
                    if let took = job.took { RowRule(); FactRow(name: "Took", value: ConsoleFormat.duration(took)) }
                    RowRule()
                    FactRow(name: "Id", value: job.id, copies: true)
                }
                ForEach(job.attempts, id: \.number) { attempt in
                    ConsoleSection(title: "Attempt \(ConsoleFormat.count(attempt.number))") {
                        FactRow(name: "Outcome", value: Self.outcome(of: attempt)) {
                            StateDot(tone: attempt.outcome == "succeeded" ? .good : attempt.endedAt == nil ? .active : .bad, lift: 1)
                        }
                        if let host = ConsoleFormat.host(attempt.orchestratorUrl) { RowRule(); FactRow(name: "Compute operator", value: host, copies: true) }
                        if let start = ConsoleFormat.date(attempt.startedAt), let end = ConsoleFormat.date(attempt.endedAt) {
                            RowRule()
                            FactRow(name: "Took", value: ConsoleFormat.duration(end.timeIntervalSince(start)))
                        }
                        if let timings = attempt.timings {
                            if let value = timings.challengeMs { RowRule(); FactRow(name: "Challenge", value: ConsoleFormat.milliseconds(value)) }
                            if let value = timings.signingMs { RowRule(); FactRow(name: "Signing", value: ConsoleFormat.milliseconds(value)) }
                            if let value = timings.responseMs { RowRule(); FactRow(name: "Response", value: ConsoleFormat.milliseconds(value)) }
                        }
                        RowRule()
                        FactRow(name: "Payment", value: attempt.paymentSent ? "Sent" : "Not sent")
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .background(palette.background)
        .navigationTitle("Job")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: job.summary) { Image(systemName: "square.and.arrow.up") }
                    .accessibilityLabel("Share this job's summary")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(ConsoleFormat.name(ofApp: job.app))
                .text(.title, weight: .semibold)
                .foregroundStyle(palette.foreground)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                StateDot(tone: job.state == .succeeded ? .good : job.tone)
                Text(Self.stateLine(for: job))
                    .text(.body, weight: .medium)
                    .foregroundStyle(job.state == .failed || job.state == .uncertain ? palette.destructive : palette.foreground)
            }
            .accessibilityElement(children: .combine)
        }
    }

    static func stateLine(for job: EngineJob) -> String {
        guard let took = job.took else { return job.stateWord }
        return "\(job.stateWord) \(job.state == .succeeded ? "in" : "after") \(ConsoleFormat.duration(took))"
    }

    static func outcome(of attempt: JobAttempt) -> String {
        let word = attempt.outcome.replacingOccurrences(of: "_", with: " ")
        return attempt.statusCode.map { "\(word) · \(ConsoleFormat.count($0))" } ?? word
    }
}

/// Why a job failed, in the engine's own words, on a wash of the destructive colour: it reports, it doesn't ask.
private struct FailureCard: View {
    let failure: JobFailure
    @Environment(\.palette) private var palette

    private var facts: String {
        var facts = [failure.kind]
        if let code = failure.statusCode { facts.append(ConsoleFormat.count(code)) }
        if let reason = failure.reason { facts.append(reason) }
        facts.append(failure.paymentSent ? "payment sent" : "no payment sent")
        return facts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(failure.message)
                .text(.lead, weight: .medium)
                .foregroundStyle(palette.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text(facts).text(.caption, mono: true).foregroundStyle(palette.mutedForeground)
            if let body = failure.body, !body.isEmpty {
                Text(body)
                    .text(.caption, mono: true)
                    .foregroundStyle(palette.foreground)
                    .textSelection(.enabled)
                    .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.destructive.opacity(0.12), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(palette.destructive.opacity(0.4), lineWidth: 1))
        .contextMenu { Button("Copy", systemImage: "doc.on.doc") { UIPasteboard.general.string = failure.message } }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Failure: \(failure.message) \(facts)")
    }
}
