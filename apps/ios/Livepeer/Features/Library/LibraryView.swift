import SwiftUI

/// Everything the person has made or added, newest first, searchable by what is in it. A guest sees what
/// the library is for.
struct LibraryView: View {
    let openAccount: () -> Void
    @State private var model: LibraryModel
    @State private var selected: MediaItem?
    @Environment(Account.self) private var account
    @Environment(\.palette) private var palette
    @Environment(\.motion) private var motion

    init(api: API, openAccount: @escaping () -> Void) {
        self.openAccount = openAccount
        _model = State(initialValue: LibraryModel(api: api))
    }

    private static let kinds: [(MediaKind?, String)] = [(nil, "All"), (.video, "Video"), (.image, "Image"), (.audio, "Audio")]

    var body: some View {
        Group {
            if !account.signedIn {
                SignedOutState(symbol: "square.grid.2x2", title: "Your library", message: "Everything you make is kept here, searchable by what's in it. Sign in to see yours.")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        filters
                        if let error = model.actionError {
                            Text(error).text(.caption).foregroundStyle(palette.destructive)
                        }
                        content
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .refreshable { await model.search() }
                .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "A runner at night, neon, harbour…")
            }
        }
        .background(palette.background)
        .navigationTitle("Library")
        .toolbar { AccountToolbarItem(open: openAccount) }
        // A moment after typing stops, and at once when the type changes or someone signs in.
        .task(id: SearchKey(query: model.query, kind: model.kind, signedIn: account.signedIn)) {
            guard account.signedIn else { return }
            if model.phase == .loaded { try? await Task.sleep(for: .milliseconds(220)) }
            guard !Task.isCancelled else { return }
            await model.search()
        }
        .tray(item: $selected, title: \.title) { item in
            ItemTray(item: item, model: model) { selected = nil }
        }
    }

    private struct SearchKey: Equatable {
        let query: String
        let kind: MediaKind?
        let signedIn: Bool
    }

    private var filters: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Self.kinds, id: \.1) { kind, label in
                    Chip(label: label, selected: model.kind == kind) { withAnimation(motion(.morph)) { model.kind = kind } }
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading:
            LibrarySkeleton()
        case .failed:
            LoadFailure(message: "Your library didn't load. Check your connection and try again.") { Task { await model.search() } }
        case .loaded where model.items.isEmpty:
            if model.filtered {
                EmptyState(symbol: "magnifyingglass", title: "Nothing matches", message: "Try describing what's on screen: a place, an action, a colour, a time of day.")
            } else {
                EmptyState(
                    symbol: "sparkles.rectangle.stack",
                    title: account.workspace.map { "\($0.name)'s library is empty" } ?? "Your library is empty",
                    message: account.workspace == nil ? "Shots you make on Home or in the studio are saved here." : "Shots anyone here makes on Home or in the studio are saved here, for everyone in the workspace."
                )
            }
        case .loaded:
            LibraryGrid(items: model.items) { selected = $0 }
                .opacity(model.searching ? 0.6 : 1)
                .animation(motion(.exit), value: model.searching)
        }
    }
}

/// Two columns, each tile at its own shape, the shorter column filled first.
private struct LibraryGrid: View {
    let items: [MediaItem]
    let open: (MediaItem) -> Void
    @Environment(\.palette) private var palette

    private static func ratio(_ item: MediaItem) -> CGFloat { item.kind == .audio ? 16 / 7 : item.aspect.rawValue.aspectRatio }

    var body: some View {
        let columns = items.reduce(into: (left: [MediaItem](), right: [MediaItem](), leftHeight: 0.0, rightHeight: 0.0)) { result, item in
            if result.leftHeight <= result.rightHeight {
                result.left.append(item)
                result.leftHeight += 1 / Self.ratio(item)
            } else {
                result.right.append(item)
                result.rightHeight += 1 / Self.ratio(item)
            }
        }
        HStack(alignment: .top, spacing: 10) {
            column(columns.left)
            column(columns.right)
        }
    }

    private func column(_ items: [MediaItem]) -> some View {
        LazyVStack(spacing: 10) {
            ForEach(items, id: \.id) { item in
                Button { open(item) } label: { tile(item) }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel("\(item.title), \(item.kind.rawValue)")
                    .accessibilityHint("Shows what's in it, and what you can do with it")
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func tile(_ item: MediaItem) -> some View {
        Color.clear
            .aspectRatio(Self.ratio(item), contentMode: .fit)
            .overlay { MediaStill(image: item.image, artwork: item.artwork) }
            .overlay { LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: UnitPoint(x: 0.5, y: 0.45), endPoint: .bottom) }
            .overlay(alignment: .topLeading) {
                HStack(spacing: 4) {
                    Image(systemName: item.kind == .video ? "play.fill" : item.kind == .image ? "photo" : "waveform").font(.system(size: 9, weight: .semibold))
                    Text(item.durationSeconds.map { "\(Int($0))s" } ?? item.kind.rawValue).text(.caption, mono: true)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .frame(height: 24)
                .background(.black.opacity(0.45), in: Capsule())
                .padding(8)
            }
            .overlay(alignment: .bottomLeading) {
                Text(item.title).text(.body, weight: .medium).foregroundStyle(.white).multilineTextAlignment(.leading).padding(10)
            }
            .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.media, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))
    }
}

/// One item: what is in it, and what can be done with it.
private struct ItemTray: View {
    let item: MediaItem
    let model: LibraryModel
    let close: () -> Void
    @State private var confirming = false
    @State private var asking = false
    @Environment(\.openInStudio) private var openInStudio
    @Environment(\.openConversation) private var openConversation
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Color.clear
                .aspectRatio(item.kind == .audio ? 16 / 7 : 16 / 9, contentMode: .fit)
                .overlay { MediaStill(image: item.image, artwork: item.artwork) }
                .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.media, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))

            VStack(alignment: .leading, spacing: 6) {
                Text("What's in it").text(.caption, weight: .medium).foregroundStyle(palette.subtleForeground)
                Text(item.description).text(.body).foregroundStyle(palette.foreground).fixedSize(horizontal: false, vertical: true)
                if !item.tags.isEmpty {
                    FlowTags(tags: item.tags).padding(.top, 4)
                }
                // In a workspace's library, who made it.
                if let maker = item.madeBy {
                    Text("\(item.source == .upload ? "Added" : "Made") by \(maker)").text(.caption).foregroundStyle(palette.mutedForeground).padding(.top, 4)
                }
            }

            PrimaryButton(label: "Open in the studio") {
                close()
                openInStudio(item.kind, LibraryModel.studioPrompt(for: item))
            }
            HStack(spacing: 10) {
                SecondaryButton(label: asking ? "Starting…" : "Ask about it", symbol: "bubble.left") {
                    asking = true
                    Task {
                        defer { asking = false }
                        if let conversation = await model.ask(about: item) {
                            close()
                            openConversation(conversation)
                        }
                    }
                }
                .disabled(asking)
                Button { confirming = true } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(palette.destructive)
                        .frame(width: 50, height: 50)
                        .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("Delete")
            }
            if let error = model.actionError {
                Text(error).text(.caption).foregroundStyle(palette.destructive)
            }
        }
        .alert("Delete this from your library?", isPresented: $confirming) {
            Button("Keep it", role: .cancel) {}
            Button("Delete", role: .destructive) {
                close()
                Task { await model.delete(item) }
            }
        } message: {
            Text("It can't be brought back.")
        }
        .sensoryFeedback(.warning, trigger: confirming) { _, showing in showing }
    }
}

/// Tags that wrap onto as many lines as they need.
private struct FlowTags: View {
    let tags: [String]
    @Environment(\.palette) private var palette

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text(tag).text(.caption).foregroundStyle(palette.mutedForeground)
                    .padding(.horizontal, 8)
                    .frame(minHeight: 24)
                    .background(palette.secondary, in: Capsule())
            }
        }
    }
}

/// Lays children left to right, wrapping to a new line when the next one doesn't fit.
private struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += line + spacing; line = 0 }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += line + spacing; line = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}

/// The grid's shape while it loads.
private struct LibrarySkeleton: View {
    @Environment(\.palette) private var palette

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ForEach(0..<2, id: \.self) { column in
                VStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { row in
                        RoundedRectangle(cornerRadius: Radius.media, style: .continuous).fill(palette.card).aspectRatio((row + column).isMultiple(of: 2) ? 16 / 9 : 1, contentMode: .fit)
                    }
                }
            }
        }
        .breathing()
        .accessibilityLabel("Loading your library")
    }
}
