import SwiftUI

/// One of the console's reads and where it has got to. It is read when its page opens, again each time the
/// console is unlocked, and on pull to refresh. What is shown stays until a newer answer arrives.
@Observable
final class ConsoleRead<Value: Sendable> {
    enum Phase: Equatable { case loading, loaded, failed(String) }

    private(set) var value: Value?
    private(set) var phase = Phase.loading
    /// What to say when the instance didn't answer at all.
    private let failure: String
    private let read: () async throws -> Value

    init(failure: String, read: @escaping () async throws -> Value) {
        self.failure = failure
        self.read = read
    }

    func load() async {
        do {
            value = try await read()
            phase = .loaded
        } catch is CancellationError {
            return
        } catch {
            // A lock or a sign-out replaces the whole console; there's nothing for this page to say.
            if let refusal = error as? APIError, refusal.status == 401 { return }
            if value == nil { phase = .failed((error as? APIError)?.message ?? failure) }
        }
    }
}

/// A pushed page of the console that shows one read: its rows once they have arrived, the same rows with
/// nothing to read in them while they are on their way, or why they didn't come.
struct ConsoleReadPage<Value: Sendable, Content: View, Placeholder: View>: View {
    let title: String
    let model: ConsoleRead<Value>
    @ViewBuilder let content: (Value) -> Content
    @ViewBuilder let placeholder: () -> Placeholder
    @Environment(ConsoleSession.self) private var session
    @Environment(\.palette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let value = model.value {
                    content(value)
                } else if case .failed(let message) = model.phase {
                    LoadFailure(message: message) { Task { await model.load() } }.padding(.top, 32)
                } else {
                    placeholder().redacted(reason: .placeholder).breathing().accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await model.load() }
        .background(palette.background)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        // Read again each time the console is unlocked: what was on screen may be minutes old.
        .task(id: session.unlocks) { await model.load() }
    }
}

/// What a page says when its read came back with nothing in it.
struct EmptyLine: View {
    let message: String
    @Environment(\.palette) private var palette

    var body: some View {
        Text(message)
            .text(.lead)
            .foregroundStyle(palette.mutedForeground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 32)
    }
}

/// A row of a card that names something and gives its facts in mono under it, with a state at the right when
/// it has one. At the largest text sizes the state moves under the name.
struct NamedRow: View {
    let name: String
    let facts: [String]
    var state: (word: String, tone: StateDot.Tone)?
    @Environment(\.palette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if typeSize.isAccessibilitySize {
                title
                stateView
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    title
                    Spacer(minLength: 0)
                    stateView
                }
            }
            if !facts.isEmpty {
                Text(ConsoleFormat.line(facts))
                    .text(.caption, mono: true)
                    .foregroundStyle(palette.mutedForeground)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var title: some View {
        Text(name).text(.lead, weight: .medium).foregroundStyle(palette.foreground)
    }

    @ViewBuilder
    private var stateView: some View {
        if let state {
            HStack(spacing: 8) {
                StateDot(tone: state.tone)
                Text(state.word)
                    .text(.body, weight: .medium)
                    .foregroundStyle(state.tone == .bad ? palette.destructive : palette.foreground)
            }
        }
    }
}
