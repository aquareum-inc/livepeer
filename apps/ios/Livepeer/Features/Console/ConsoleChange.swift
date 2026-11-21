import SwiftUI

/// A change an operator is about to make, as the tray puts it to them: what will happen, to whom, and whether
/// it can be undone. One action, named for what it does.
struct ConsoleChange: Identifiable {
    let id = UUID()
    let title: String
    let message: String
    let action: String
    /// Takes something away: the tray is tinted and the button is red.
    let destructive: Bool
    /// Makes the change. Nil once the instance has confirmed it; otherwise why it didn't happen. Throws
    /// `CancellationError` when the person closed the face or fingerprint prompt.
    let run: () async throws -> String?
}

extension View {
    /// Puts a change to the operator in a tray. Pressing its button asks for a face or fingerprint; the tray
    /// closes only when the instance has made the change, and says why when it hasn't.
    func changeTray(_ change: Binding<ConsoleChange?>) -> some View {
        tray(item: change, title: \.title, destructive: \.destructive) { item in
            ChangeTray(change: item) { change.wrappedValue = nil }
        }
    }
}

private struct ChangeTray: View {
    let change: ConsoleChange
    let done: () -> Void
    @Environment(\.palette) private var palette
    @State private var working = false
    @State private var failure: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(change.message)
                .text(.lead)
                .foregroundStyle(palette.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let failure {
                Text(failure).text(.body).foregroundStyle(palette.destructive).accessibilityAddTraits(.updatesFrequently)
            }
            if change.destructive {
                DestructiveButton(label: change.action, busy: working, action: run)
            } else {
                PrimaryButton(label: change.action, busy: working, action: run)
            }
        }
        .interactiveDismissDisabled(working)
    }

    private func run() {
        working = true
        failure = nil
        Task {
            defer { working = false }
            do {
                if let refusal = try await change.run() { failure = refusal } else { done() }
            } catch is CancellationError {
                return
            } catch {
                failure = "That wasn't confirmed, so nothing was changed. Try again."
            }
        }
    }
}
