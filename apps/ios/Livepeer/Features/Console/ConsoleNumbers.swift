import Foundation

/// What the console's money and network pages make of the instance's answers: totals, shares and the words
/// for them. Nothing here is fetched; it is worked out from what one read already carries.
nonisolated extension ConsoleFormat {
    /// Between two facts on a line. It holds to the fact before it, so a wrapped line never starts with a dot.
    static let gap = "\u{00A0}· "

    /// Facts on one line, each holding together when the line wraps.
    static func line(_ facts: [String]) -> String {
        facts.map { $0.replacingOccurrences(of: " ", with: "\u{00A0}") }.joined(separator: gap)
    }

    /// An amount as the provider writes it ("500.00" in USD), as money.
    static func money(_ money: Money) -> String {
        guard let amount = Double(money.amount) else { return "\(money.amount) \(money.currency)" }
        return amount.formatted(.currency(code: money.currency).locale(Locale(identifier: "en_US")))
    }

    /// A network fee in dollars. Fees can be fractions of a cent, so small ones keep four places.
    static func fee(_ usd: Double) -> String {
        usd > 0 && usd < 0.01 ? usd.formatted(.currency(code: "USD").precision(.fractionLength(4)).locale(Locale(identifier: "en_US"))) : money(usd)
    }

    /// "1.3×", or the instance's own when a capability or plan sets none.
    static func markup(_ value: Double?) -> String {
        value.map { "\($0.formatted(.number.precision(.fractionLength(0...2)).locale(Locale(identifier: "en_US"))))×" } ?? "default markup"
    }

    /// "22%", or nothing to say when there was no revenue.
    static func share(_ part: Double, of whole: Double) -> String? {
        whole > 0 ? (part / whole).formatted(.percent.precision(.fractionLength(0)).locale(Locale(identifier: "en_US"))) : nil
    }

    /// "8 Nov" from a day written as 2026-11-08: the day as the instance wrote it, wherever the phone is.
    static func day(_ text: String) -> String {
        (try? Date.ISO8601FormatStyle(timeZone: .gmt).year().month().day().parse(text)).map { $0.formatted(Date.FormatStyle(timeZone: .gmt).day().month(.abbreviated)) } ?? text
    }
}

nonisolated extension Fees {
    /// The fee in dollars; nothing where the engine hasn't priced it yet.
    var usd: Double { feeUsd.flatMap(Double.init) ?? 0 }
}

nonisolated extension OverviewStats {
    /// What the days shown add up to.
    var periodRevenue: Double { series.reduce(0) { $0 + $1.revenueUsd } }
    var periodCost: Double { series.reduce(0) { $0 + $1.wholesaleUsd } }
    var periodMargin: Double { periodRevenue - periodCost }

    /// The tallest day, which sets the chart's scale.
    var peak: Double { series.map { max($0.revenueUsd, $0.wholesaleUsd) }.max() ?? 0 }
}

nonisolated extension CostSummary {
    /// One capability's share of the network cost.
    struct Line: Hashable, Identifiable {
        let app: String
        /// Paid for work that was delivered.
        let delivered: Double
        /// Paid for work that failed after payment went, or whose outcome isn't known.
        let lost: Double
        var id: String { app }
        /// Whether the lost part is large enough to write: at least a hundredth of a cent.
        var showsLost: Bool { lost >= 0.00005 }
    }

    /// Capabilities by what they cost, dearest first; ones that cost nothing are left out.
    var lines: [Line] {
        byApp.map { app, fees in
            Line(app: app, delivered: fees.delivered?.usd ?? 0, lost: (fees.failedAfterPayment?.usd ?? 0) + (fees.uncertain?.usd ?? 0))
        }
        .filter { $0.delivered + $0.lost > 0 }
        .sorted { ($0.delivered + $0.lost, $1.app) > ($1.delivered + $1.lost, $0.app) }
    }

    /// Everything paid to the network in the period, whatever became of the work.
    var paid: Double { byClass.delivered.usd + byClass.failedAfterPayment.usd + byClass.uncertain.usd }
}

nonisolated extension Grant {
    /// What is funded and not yet set aside for anyone.
    var unallocated: Double { max(0, (Double(funded.amount) ?? 0) - (Double(allocated.amount) ?? 0)) }
}

nonisolated extension Plan {
    /// "$18.00 a month".
    var priceLine: String { "\(ConsoleFormat.money(price)) a \(interval == .year ? "year" : "month")" }

    /// "2,000 credits a month".
    var allowanceLine: String { "\(ConsoleFormat.count(allowance.credits)) credits a \(allowance.period == .year ? "year" : "month")" }
}

nonisolated extension ComputeOperator {
    /// The operator by its host; the whole address when it has none.
    var host: String { ConsoleFormat.host(orchestratorUrl) ?? orchestratorUrl }

    var blocked: Bool { status == .blocked }

    /// "67 jobs", "5 failed", "1.7 s median".
    var facts: [String] {
        var facts = [jobs == 1 ? "1 job" : "\(ConsoleFormat.count(jobs)) jobs", "\(ConsoleFormat.count(failures)) failed"]
        if let median = medianResponseMs { facts.append("\(ConsoleFormat.duration(median / 1000)) median") }
        return facts
    }
}

nonisolated extension OfferedCapability {
    /// Whether anyone can run it now.
    var available: Bool { readyCount > 0 && !stale }

    /// "5 of 6 runners ready", the markup, and "not seen lately" when discovery has lost sight of it.
    var facts: [String] {
        var facts = ["\(ConsoleFormat.count(readyCount)) of \(ConsoleFormat.count(runnerCount)) ready", ConsoleFormat.markup(markup)]
        if stale { facts.append("not seen lately") }
        return facts
    }

    /// Offered and runnable is unremarkable; offered with no one to run it is a problem; not offered is a choice.
    var state: (word: String, tone: StateDot.Tone) {
        if !enabled { return ("Not offered", .quiet) }
        return available ? ("Offered", .good) : ("No one ready", .bad)
    }
}
