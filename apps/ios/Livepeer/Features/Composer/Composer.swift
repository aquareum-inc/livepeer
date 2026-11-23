import SwiftUI

/// What the composer holds before it is sent.
struct Draft: Equatable {
    var prompt = ""
    /// The capability a starting point, an example or a cast chose; nil lets the agent decide.
    var app: String?
    var aspect = "16:9"
    var durationSeconds: Double = 5
    /// Library items for the agent to watch or work from.
    var attachments: [MediaItem] = []
    /// A character to put on screen, starting from their portrait.
    var cast: CharacterCast?
    /// The language model that runs the agent; nil is Auto.
    var model: String?

    var isVideo: Bool { app?.contains("video") == true && app?.hasPrefix("live") == false }
    var canSend: Bool { !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty }

    /// What is sent. With only attachments, it asks for the videos to be understood, as the web does.
    var text: String {
        let words = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        return words.isEmpty ? "Summarise this and list the key moments." : words
    }

    /// What carries on to the next message in a conversation: the same model, and the same cast.
    var carriedOn: Draft { Draft(app: cast == nil ? nil : app, cast: cast, model: model) }
}

/// What the composer can offer besides words, as the instance describes it.
struct ComposerChoices {
    /// The agent's model menu; shown only with two or more rows.
    var models: [AgentModelEntry] = []
    /// Whether a character can be put on screen.
    var casting = false
    /// Opens a tray to attach from the library, or to put a character in it.
    var attach: () -> Void = {}
    var castCharacter: () -> Void = {}
}

/// The one composer. It sits at the foot of Home and at the foot of a conversation, and holds the
/// view's one ink action: send.
struct Composer: View {
    @Binding var draft: Draft
    var choices = ComposerChoices()
    var placeholder = "A slow push along a harbour at first light…"
    var sending = false
    var focused: FocusState<Bool>.Binding
    let send: () -> Void
    @Environment(\.palette) private var palette
    @Environment(\.motion) private var motion
    /// How far the composer sits from the screen's edges: the system tab bar's own inset, so the two line up.
    static let inset: CGFloat = 21

    private static let aspects = ["16:9", "9:16", "1:1"]
    private static let durations: [Double] = [5, 10]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if draft.cast != nil || !draft.attachments.isEmpty { chosen }
            // The field's own placeholder cuts off at one line; this one wraps, at any text size,
            // and the field grows to fit it.
            ZStack(alignment: .topLeading) {
                if draft.prompt.isEmpty {
                    Text(placeholderText)
                        .text(.lead)
                        .foregroundStyle(palette.subtleForeground)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityHidden(true)
                }
                TextField("", text: $draft.prompt, axis: .vertical)
                    .lineLimit(1...6)
                    .text(.lead)
                    .foregroundStyle(palette.foreground)
                    .focused(focused)
                    .accessibilityLabel("Describe what you want to make")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 4)
            // Any part of the composer that isn't a control starts typing, as a text field would.
            .contentShape(Rectangle())
            .onTapGesture { focused.wrappedValue = true }

            // Everything besides words sits under them, as on the web: what to add on the left, send on the right.
            // When the row can't hold it all, at a large text size or with a long model name, the model
            // menu drops to its mark alone rather than anything being cut off.
            ViewThatFits(in: .horizontal) {
                tools(modelNamed: true)
                tools(modelNamed: false)
            }
        }
        .animation(motion(.morph), value: draft.isVideo)
        .animation(motion(.morph), value: draft.attachments.count + (draft.cast == nil ? 0 : 1))
        .padding(8)
        .glass(in: RoundedRectangle(cornerRadius: Radius.sheet, style: .continuous))
    }

    private func tools(modelNamed: Bool) -> some View {
        HStack(spacing: 0) {
            tool("plus", label: "Attach from your library", action: choices.attach)
            if choices.casting {
                // A portrait in a frame: the character's portrait becomes the first frame of the shot.
                tool(draft.cast == nil ? "person.crop.square" : "person.crop.square.fill", label: "Put a character in it", on: draft.cast != nil, action: choices.castCharacter)
            }
            if choices.models.count >= 2 { modelMenu(named: modelNamed) }
            // Parameters appear with intent: only once the request is a video.
            if draft.isVideo {
                Menu {
                    Picker("Shape", selection: $draft.aspect) {
                        ForEach(Self.aspects, id: \.self) { Text($0).tag($0) }
                    }
                } label: {
                    parameter(draft.aspect)
                }
                .accessibilityLabel("Shape, \(draft.aspect)")
                Menu {
                    Picker("Length", selection: $draft.durationSeconds) {
                        ForEach(Self.durations, id: \.self) { Text("\(Int($0)) seconds").tag($0) }
                    }
                } label: {
                    parameter("\(Int(draft.durationSeconds))s")
                }
                .accessibilityLabel("Length, \(Int(draft.durationSeconds)) seconds")
            }
            Color.clear
                .frame(minWidth: 4, maxWidth: .infinity)
                .frame(height: 44)
                .contentShape(Rectangle())
                .onTapGesture { focused.wrappedValue = true }
                .accessibilityHidden(true)
            sendButton
        }
    }

    /// What to write, given what has been added: a cast asks for a scene, an attachment for a question.
    private var placeholderText: String {
        if let cast = draft.cast { return "Put \(cast.name) in a scene: where, doing what, in what light…" }
        if !draft.attachments.isEmpty { return "Ask about it, or send as it is for a summary and the key moments" }
        return placeholder
    }

    private var chosenModel: AgentModelEntry? {
        guard let model = draft.model, choices.models.count >= 2 else { return nil }
        return choices.models.first { $0.app == model || $0.also.contains(model) }
    }

    private func tool(_ symbol: String, label: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(on ? palette.foreground : palette.mutedForeground)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle(round: true))
        .accessibilityLabel(label)
    }

    /// Which language model runs the agent. It names the one chosen, so nothing else has to.
    private func modelMenu(named: Bool) -> some View {
        Menu {
            Picker("Model", selection: $draft.model) {
                Text("Auto").tag(String?.none)
                ForEach(choices.models, id: \.app) { entry in
                    Button {} label: {
                        Text(entry.name)
                        Text(entry.busy ? "Busy · \(entry.description)" : entry.description)
                    }
                    .tag(String?.some(entry.app))
                }
            }
        } label: {
            HStack(spacing: 5) {
                RobotMark()
                    // Sized and weighted to sit level with the system icons beside it.
                    .stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                if named {
                    Text(chosenModel?.name ?? "Auto").text(.caption, weight: .medium).lineLimit(1).fixedSize()
                }
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold))
            }
            .foregroundStyle(chosenModel == nil ? palette.mutedForeground : palette.foreground)
            .padding(.horizontal, 8)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Model, \(chosenModel?.name ?? "Auto")")
    }

    /// What has been added, each removable: who is cast and what is attached.
    private var chosen: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                if let cast = draft.cast {
                    token(cast.name.prefix(1).uppercased(), image: cast.image, label: "With \(cast.name)", remove: "Take \(cast.name) out") {
                        draft.cast = nil
                        if draft.app == "image-to-video" { draft.app = nil }
                    }
                }
                ForEach(draft.attachments, id: \.id) { item in
                    token(nil, image: item.image, label: item.title, remove: "Remove \(item.title)") {
                        draft.attachments.removeAll { $0.id == item.id }
                    }
                }
            }
            .padding(.leading, 4)
        }
        .scrollIndicators(.hidden)
        .transition(.opacity.combined(with: .offset(y: -4)))
    }

    private func token(_ initial: String?, image: String? = nil, label: String, remove: String, action: @escaping () -> Void) -> some View {
        HStack(spacing: 6) {
            ZStack {
                Circle().fill(palette.secondary)
                if let initial { Text(initial).font(.system(size: 10, weight: .semibold)).foregroundStyle(palette.foreground) }
                if let image, let url = URL(string: image, relativeTo: BuildConfig.instanceURL) {
                    AsyncImage(url: url) { phase in phase.image?.resizable().scaledToFill() }
                }
            }
            .frame(width: 20, height: 20)
            .clipShape(Circle())
            Text(label).text(.caption, weight: .medium).foregroundStyle(palette.foreground).lineLimit(1)
            Button(action: action) {
                Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(palette.mutedForeground).frame(width: 28, height: 28).contentShape(Circle())
            }
            .buttonStyle(PressStyle(round: true))
            .accessibilityLabel(remove)
        }
        .padding(.leading, 6)
        .frame(minHeight: 32)
        .background(palette.hover, in: Capsule())
        .overlay(Capsule().strokeBorder(palette.hairline, lineWidth: 1))
    }

    /// The view's one ink action.
    private var sendButton: some View {
        Button(action: send) {
            ZStack {
                if sending {
                    // Sending can't be stopped from here, so it shows as work under way, not as a stop button.
                    ProgressView().tint(palette.primaryForeground)
                } else {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(ready ? palette.primaryForeground : palette.subtleForeground)
                }
            }
            .frame(width: 44, height: 44)
            // With nothing to send it is a quiet well, not a faded ink button: ink arrives with the words.
            .background(ready || sending ? palette.primary : palette.active, in: Circle())
            .animation(motion(.morph), value: ready)
        }
        .buttonStyle(PressStyle(round: true))
        .disabled(!ready)
        // With a keyboard attached, Return adds a line and Command-Return sends.
        .keyboardShortcut(.return, modifiers: .command)
        .sensoryFeedback(.impact(weight: .light), trigger: sending) { _, now in now }
        .accessibilityLabel(sending ? "Sending" : "Send")
    }

    private var ready: Bool { draft.canSend && !sending }

    private func parameter(_ label: String) -> some View {
        Text(label)
            .text(.caption, mono: true)
            .foregroundStyle(palette.mutedForeground)
            .padding(.horizontal, 10)
            .frame(minHeight: 32)
            .background(palette.hover, in: Capsule())
            .overlay(Capsule().strokeBorder(palette.hairline, lineWidth: 1))
            // The pill is 32 tall; what answers a touch is 44, with a little room either side.
            .padding(.horizontal, 3)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .transition(.scale(scale: 0.9).combined(with: .opacity))
    }
}

/// The agent's mark on the model menu: a small robot, as on the web. The system's icon set has none,
/// so this one is drawn, on a 24-point grid like the rest of the web's icons.
private struct RobotMark: Shape {
    nonisolated func path(in rect: CGRect) -> Path {
        var path = Path()
        // Antenna.
        path.move(to: CGPoint(x: 12, y: 4))
        path.addLine(to: CGPoint(x: 12, y: 8))
        // Head.
        path.addRoundedRect(in: CGRect(x: 4, y: 8, width: 16, height: 12), cornerSize: CGSize(width: 2.5, height: 2.5))
        // Ears.
        path.move(to: CGPoint(x: 2, y: 14))
        path.addLine(to: CGPoint(x: 4, y: 14))
        path.move(to: CGPoint(x: 20, y: 14))
        path.addLine(to: CGPoint(x: 22, y: 14))
        // Eyes.
        path.move(to: CGPoint(x: 9, y: 13))
        path.addLine(to: CGPoint(x: 9, y: 15))
        path.move(to: CGPoint(x: 15, y: 13))
        path.addLine(to: CGPoint(x: 15, y: 15))
        let scale = min(rect.width, rect.height) / 24
        return path.applying(CGAffineTransform(scaleX: scale, y: scale))
    }
}
