import SwiftUI

struct HomeView: View {
    let travel: Namespace.ID
    let openAccount: () -> Void
    let openHistory: () -> Void
    @Bindable var model: HomeModel
    let open: (Conversation) -> Void
    @State private var tray: ComposerTray?
    @FocusState private var composing: Bool
    @Environment(Account.self) private var account
    @Environment(ComposerSupport.self) private var support
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @Environment(\.motion) private var motion


    private static let starterSymbols = ["make-video": "film", "animate-image": "photo.on.rectangle.angled", "understand-video": "text.viewfinder", "restyle-live": "dot.radiowaves.left.and.right"]

    var body: some View {
        VStack(spacing: 10) {
            Text("Direct anything.")
                .font(.system(.largeTitle, weight: .semibold))
                .tracking(-0.68)
                .foregroundStyle(palette.foreground)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            Text("Describe a scene and watch it play out. Then edit it, restyle it, or take it live.")
                .text(.lead)
                .foregroundStyle(palette.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
            if model.phase == .failed {
                LoadFailure(message: "The starting points didn't load. Check your connection and try again.") { Task { await model.load() } }
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // The page doesn't scroll, so a tap on the open space is what puts the keyboard away.
        .contentShape(Rectangle())
        .onTapGesture { composing = false }
        .safeAreaInset(edge: .bottom, spacing: 0) { dock }
        .overlay(alignment: .top) {
            HStack {
                if account.signedIn {
                    Button(action: openHistory) {
                        Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(palette.foreground)
                            .frame(width: 34, height: 34)
                            .glass(in: Circle())
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle(round: true))
                    .accessibilityLabel("Your conversations")
                }
                Spacer()
                AccountButton(open: openAccount)
            }
            .padding(.horizontal, 8)
        }
        .composerTrays(draft: $model.draft, open: $tray)
        .background { HomeBackdrop() }
        .background(palette.background)
        .toolbar(.hidden, for: .navigationBar)
        // Again on signing in or out: what loaded with an old session may have been refused.
        .task(id: account.signedIn) { await model.load() }
    }

    /// Attaching and casting need an account, so a guest signs in first and then the tray opens.
    private var choices: ComposerChoices {
        ComposerChoices(
            models: support.models,
            casting: instance.description?.content.characters == true,
            attach: { openTray(.attach) },
            castCharacter: { openTray(.cast) }
        )
    }

    private func openTray(_ which: ComposerTray) {
        Task {
            guard await account.requireSignIn(which == .attach ? "Sign in to attach from your library." : "Sign in to put a character in it.") else { return }
            tray = which
        }
    }

    /// The foot of the page, in the thumb's reach: starting points, then the composer, where it also
    /// sits in a conversation.
    private var dock: some View {
        VStack(spacing: 10) {
            if let starter = model.starters.first(where: { $0.id == model.openStarter }) {
                VStack(spacing: 0) {
                    ForEach(starter.examples, id: \.self) { example in
                        Button {
                            withAnimation(motion(.morph)) { model.fill(example, app: starter.app) }
                            composing = true
                        } label: {
                            Text(example)
                                .text(.body)
                                .foregroundStyle(palette.mutedForeground)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 12)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityHint("Puts this in the composer")
                    }
                }
                .transition(.opacity.combined(with: .offset(y: 6)))
            }

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(model.starters, id: \.id) { starter in
                        Chip(label: starter.label, symbol: Self.starterSymbols[starter.id] ?? "film", selected: model.openStarter == starter.id) {
                            withAnimation(motion(.morph)) { model.toggle(starter) }
                        }
                        .accessibilityHint("Shows example requests")
                    }
                }
                .padding(.horizontal, Composer.inset)
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled() // The chips' shadows fall outside the row.
            .padding(.horizontal, -Composer.inset)

            if let error = model.sendError {
                Text(error).text(.caption).foregroundStyle(palette.destructive).transition(.opacity)
            }

            Composer(draft: $model.draft, choices: choices, sending: model.sending, focused: $composing) {
                Task {
                    // A guest signs in here and carries on: the request is still in the composer.
                    guard await account.requireSignIn("Sign in to send this. What you wrote stays here.") else { return }
                    if let conversation = await model.send() { open(conversation) }
                }
            }
            .matchedTransitionSource(id: "composer", in: travel)
        }
        .padding(.horizontal, Composer.inset)
        .padding(.bottom, 8)
    }
}

/// The instance's own picture behind the whole page, so the glass of the composer and the tab bar has something to show.
private struct HomeBackdrop: View {
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let home = instance.description?.home
        ZStack {
            if home?.aurora == true, let address = home?.backgroundImage, let url = URL(string: address, relativeTo: BuildConfig.instanceURL) {
                // The drawn aurora paints its own pale sky on the light theme, so it needs only a light veil.
                AuroraSky(url: url)
                palette.panel.opacity(scheme == .dark ? 0.22 : 0.15)
            } else if let address = home?.backgroundPoster ?? home?.backgroundImage, let url = URL(string: address, relativeTo: BuildConfig.instanceURL) {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.6))) { phase in
                    if let picture = phase.image { picture.resizable().scaledToFill() }
                }
                // A light scrim on the dark theme, a heavier one on the light, as on the web.
                palette.panel.opacity(scheme == .dark ? 0.22 : 0.66)
            }
            // Quieter towards the foot, where the words in the composer and the tab bar are read over it.
            LinearGradient(colors: [.clear, palette.background.opacity(0.55)], startPoint: UnitPoint(x: 0.5, y: 0.6), endPoint: .bottom)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
