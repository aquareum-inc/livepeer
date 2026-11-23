import SwiftUI

struct ConversationView: View {
    @State private var model: ConversationModel
    @State private var tray: ComposerTray?
    @FocusState private var composing: Bool
    @Environment(ComposerSupport.self) private var support
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @Environment(\.scenePhase) private var scenePhase

    init(api: API, id: String, conversation: Conversation?) {
        _model = State(initialValue: ConversationModel(api: api, id: id, conversation: conversation))
    }

    /// The shape the user asked for, so a shot's tile is right before its job has been read.
    private var aspect: String { model.draft.aspect }

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                if model.loadFailed {
                    LoadFailure(message: "This conversation didn't load.") { Task { await model.follow() } }
                        .padding(.top, 80)
                } else if model.conversation == nil {
                    ProgressView().padding(.top, 120).frame(maxWidth: .infinity).accessibilityLabel("Loading the conversation")
                } else {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        ForEach(model.messages, id: \.id) { message in
                            switch message {
                            case .user(let sent): UserBubble(message: sent)
                            case .agent(let turn): AgentTurnView(turn: turn, generations: model.generations, labels: model.labels, aspect: aspect)
                            }
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 20)
                    .padding(.bottom, 16)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            // Keep the newest thing in view: a new message, and a shot's tile when it first appears.
            .onChange(of: model.messages.count) { withAnimation(.enter) { scroll.scrollTo("end", anchor: .bottom) } }
            .onChange(of: model.generations.count) { withAnimation(.enter) { scroll.scrollTo("end", anchor: .bottom) } }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 6) {
                if let error = model.sendError {
                    Text(error).text(.caption).foregroundStyle(palette.destructive)
                }
                Composer(draft: $model.draft, choices: ComposerChoices(models: support.models, casting: instance.description?.content.characters == true, attach: { tray = .attach }, castCharacter: { tray = .cast }), placeholder: "Ask for a change, or describe the next shot…", sending: model.sending, focused: $composing) {
                    Task { await model.send() }
                }
            }
            .padding(.horizontal, Composer.inset)
            .padding(.bottom, 8)
        }
        .background(palette.background)
        .composerTrays(draft: $model.draft, open: $tray)
        .navigationTitle(model.conversation?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        // Follows while on screen and in the foreground; a new message or coming back starts it again.
        .task(id: FollowKey(active: scenePhase == .active, messages: model.messages.count)) {
            guard scenePhase == .active else { return }
            await model.follow()
        }
    }

    private struct FollowKey: Equatable {
        let active: Bool
        let messages: Int
    }
}

extension Message {
    var id: String {
        switch self {
        case .user(let message): message.id
        case .agent(let message): message.id
        }
    }
}

private struct UserBubble: View {
    let message: UserMessage
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if let cast = message.cast {
                HStack(spacing: 6) {
                    ZStack {
                        Circle().fill(palette.secondary)
                        Text(cast.name.prefix(1)).font(.system(size: 10, weight: .semibold)).foregroundStyle(palette.foreground)
                        if let image = cast.image, let url = URL(string: image, relativeTo: BuildConfig.instanceURL) {
                            AsyncImage(url: url) { phase in phase.image?.resizable().scaledToFill() }
                        }
                    }
                    .frame(width: 20, height: 20)
                    .clipShape(Circle())
                    Text("With \(cast.name)").text(.caption, weight: .medium).foregroundStyle(palette.mutedForeground)
                }
                .accessibilityElement(children: .combine)
            }
            Text(message.text)
                .text(.lead)
                .foregroundStyle(palette.foreground)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.leading, 48)
    }
}
