import AuthenticationServices
import SwiftUI

/// The ways to sign in that the instance offers. Each opens the system's auth session; the email method asks
/// for the address first, as the web does. The user app's sign-in and the console's own both use it.
struct SignInOptions: View {
    /// The method being tried, while its auth session is open.
    let busy: SignInMethodName?
    /// An address to start the email field with.
    var suggestedEmail = ""
    let start: (SignInMethodName, _ email: String?) -> Void
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @State private var email = ""
    @FocusState private var typing: Bool

    /// Methods that hand off to a wallet app don't come back reliably inside an auth session, so phones
    /// don't offer them until they've been tested against the provider.
    private static let providers: [(method: SignInMethodName, label: String, symbol: String?)] = [
        (.apple, "Continue with Apple", "apple.logo"),
        (.google, "Continue with Google", nil),
        (.discord, "Continue with Discord", nil),
    ]

    private var methods: [SignInMethodName] { instance.description?.signIn.methods ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Self.providers.filter { methods.contains($0.method) }, id: \.method) { provider in
                SecondaryButton(label: provider.label, symbol: provider.symbol) { begin(provider.method) }
                    .disabled(busy != nil)
            }

            if methods.contains(.email) {
                if methods.contains(where: { [.apple, .google, .discord].contains($0) }) {
                    HStack(spacing: 12) {
                        Rectangle().fill(palette.hairline).frame(height: 1)
                        Text("or").text(.caption).foregroundStyle(palette.subtleForeground)
                        Rectangle().fill(palette.hairline).frame(height: 1)
                    }
                    .padding(.vertical, 4)
                    .accessibilityHidden(true)
                }
                TextField("Email address", text: $email, prompt: Text(verbatim: "you@example.com").foregroundStyle(palette.subtleForeground))
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.continue)
                    .focused($typing)
                    .onSubmit { if canUseEmail { begin(.email) } }
                    .text(.lead)
                    .foregroundStyle(palette.foreground)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 50)
                    .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(palette.input, lineWidth: 1))
                    .accessibilityLabel("Email address")
                PrimaryButton(label: "Continue", busy: busy == .email) { begin(.email) }
                    .disabled(!canUseEmail || busy != nil)
            }

            if methods.contains(.passkey) {
                Button { begin(.passkey) } label: {
                    Label("Use a passkey instead", systemImage: "person.badge.key")
                        .text(.body)
                        .foregroundStyle(palette.mutedForeground)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(PressStyle())
                .disabled(busy != nil)
            }
        }
        .onAppear { if email.isEmpty { email = suggestedEmail } }
    }

    private var canUseEmail: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        return trimmed.contains("@") && trimmed.contains(".")
    }

    private func begin(_ method: SignInMethodName) {
        typing = false
        start(method, method == .email ? email.trimmingCharacters(in: .whitespaces) : nil)
    }
}

/// Sign in or sign up to the user app.
struct SignInTray: View {
    let reason: String?
    @Environment(Account.self) private var account
    @Environment(InstanceStore.self) private var instance
    @Environment(\.webAuthenticationSession) private var session
    @Environment(\.palette) private var palette
    @State private var busy: SignInMethodName?
    @State private var failure: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let reason {
                Text(reason).text(.body).foregroundStyle(palette.mutedForeground)
            }

            SignInOptions(busy: busy) { method, email in start(method, email: email) }

            if let failure {
                Text(failure).text(.body).foregroundStyle(palette.destructive).accessibilityAddTraits(.updatesFrequently)
            }

            Text(Self.signUpNote(instance.description?.signIn.signUp))
                .text(.caption)
                .foregroundStyle(palette.subtleForeground)
                .padding(.top, 4)
        }
    }

    private func start(_ method: SignInMethodName, email: String?) {
        failure = nil
        busy = method
        Task {
            defer { busy = nil }
            do {
                try await account.signIn(with: method, email: email, using: session)
            } catch is CancellationError {
                return
            } catch let error as LocalizedError where error is Account.SignInError {
                failure = error.errorDescription
            } catch {
                failure = "Sign-in didn't finish. Check your connection and try again."
            }
        }
    }

    private static func signUpNote(_ signUp: InstanceDescriptionSignInSignUp?) -> String {
        switch signUp {
        case .invite: "This service is invitation only. Sign in with the address you were invited at."
        case .closed: "This service isn't taking new accounts."
        default: "New here? Signing in for the first time creates your account."
        }
    }
}
