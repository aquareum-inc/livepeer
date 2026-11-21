import Foundation

/// How the console writes facts: ages, money, durations, ids. Short, and the same on every screen.
nonisolated enum ConsoleFormat {
    /// A time as the instance writes it, with or without fractions of a second.
    static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        return (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text)) ?? (try? Date.ISO8601FormatStyle().parse(text))
    }

    /// "just now", "12 s ago", "3 min ago", "2 h ago", "4 d ago".
    static func ago(_ date: Date, now: Date) -> String {
        let seconds = Int(max(0, now.timeIntervalSince(date)))
        switch seconds {
        case ..<5: return "just now"
        case ..<60: return "\(seconds) s ago"
        case ..<3600: return "\(seconds / 60) min ago"
        case ..<86400: return "\(seconds / 3600) h ago"
        default: return "\(seconds / 86400) d ago"
        }
    }

    /// The time alone for today, with the day before it otherwise.
    static func clock(_ date: Date, now: Date, calendar: Calendar = .current) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        return calendar.isDate(date, inSameDayAs: now) ? time : "\(day(date)) \(time)"
    }

    /// The day and the time to the second, for a job's own page.
    static func moment(_ date: Date) -> String {
        "\(day(date)) \(date.formatted(.dateTime.hour().minute().second()))"
    }

    private static func day(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated))
    }

    static func money(_ usd: Double) -> String {
        usd.formatted(.currency(code: "USD").locale(Locale(identifier: "en_US")))
    }

    static func count(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0)).locale(Locale(identifier: "en_US")))
    }

    /// "640 ms", "9.2 s", "1 min 12 s".
    static func duration(_ seconds: TimeInterval) -> String {
        if seconds < 1 { return "\(Int((seconds * 1000).rounded())) ms" }
        if seconds < 60 { return "\(seconds.formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: "en_US")))) s" }
        let whole = Int(seconds.rounded())
        return whole % 60 == 0 ? "\(whole / 60) min" : "\(whole / 60) min \(whole % 60) s"
    }

    static func milliseconds(_ value: Double) -> String { "\(Int(value.rounded())) ms" }

    /// What a job ran, in words: "text-to-video" reads "Text to video".
    static func name(ofApp app: String) -> String {
        let words = app.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    /// The end of an id, enough to tell two apart in a list.
    static func tail(_ id: String) -> String { "…" + id.suffix(4) }

    /// A compute operator by its host, without the scheme, port and path.
    static func host(_ address: String?) -> String? {
        address.flatMap { URL(string: $0)?.host() }
    }

    /// The Status screen's one sentence.
    static func headline(needing count: Int) -> String {
        switch count {
        case 0: "Everything is running."
        case 1: "1 thing needs you."
        default: "\(count) things need you."
        }
    }
}

nonisolated extension EngineJob {
    var created: Date? { ConsoleFormat.date(createdAt) }

    /// How long it ran, once it has finished.
    var took: TimeInterval? {
        guard let start = created, let end = ConsoleFormat.date(completedAt) else { return nil }
        return end.timeIntervalSince(start)
    }

    var stateWord: String {
        switch state {
        case .queued: "Queued"
        case .running: "Running"
        case .succeeded: "Done"
        case .failed: "Failed"
        case .uncertain: "Uncertain"
        case .unknown: "Unknown"
        }
    }

    /// The facts on a row's second line, after the state. Each holds together when the line wraps.
    var facts: [String] {
        var facts: [String] = []
        if let kind = failure?.kind { facts.append(kind) } else if let took { facts.append(ConsoleFormat.duration(took)) }
        facts.append(attempts.count == 1 ? "1 attempt" : "\(attempts.count) attempts")
        facts.append(ConsoleFormat.tail(id))
        return facts.map { $0.replacingOccurrences(of: " ", with: "\u{00A0}") }
    }

    /// The job in a few lines, for the share sheet.
    var summary: String {
        var lines = ["\(ConsoleFormat.name(ofApp: app)): \(stateWord.lowercased())", "Job \(id)", "User \(actorId)"]
        if let created { lines.append("Started \(ConsoleFormat.moment(created))") }
        if let took { lines.append("Took \(ConsoleFormat.duration(took))") }
        if let failure {
            lines.append("Failure: \(failure.message)")
            lines.append(([failure.kind] + (failure.statusCode.map { [ConsoleFormat.count($0)] } ?? [])).joined(separator: ", "))
        }
        for attempt in attempts {
            lines.append("Attempt \(ConsoleFormat.count(attempt.number)): \(attempt.outcome)" + (ConsoleFormat.host(attempt.orchestratorUrl).map { " on \($0)" } ?? ""))
        }
        return lines.joined(separator: "\n")
    }
}
