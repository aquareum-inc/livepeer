import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// What every composer can offer besides words: the agent's models, the capabilities on offer, and the
/// library and characters to pick from. Read once and shared by Home and every conversation.
@Observable
final class ComposerSupport {
    enum Load<Value> { case idle, loading, loaded(Value), failed }

    private(set) var models: [AgentModelEntry] = []
    /// The capabilities on offer, so casting a character can start the shot from their portrait.
    private(set) var apps: Set<String> = []
    private(set) var library: Load<[MediaItem]> = .idle
    private(set) var characters: Load<[Character]> = .idle
    /// Whether a file from the phone is on its way to the library.
    private(set) var uploading = false
    /// Why the last file didn't arrive, in words for the user.
    private(set) var uploadError: String?
    private let api: API

    init(api: API) { self.api = api }

    func load() async {
        async let menu = try? api.listAgentModelMenu()
        async let labels = try? api.listCapabilityLabels()
        if let menu = await menu { models = menu }
        if let labels = await labels { apps = Set(labels.map(\.app)) }
    }

    /// The person's videos and pictures: something for the agent to watch, or to start a shot from.
    func loadLibrary() async {
        if case .loaded = library {} else { library = .loading }
        do { library = .loaded(try await api.searchLibrary().filter { $0.kind == .video || $0.kind == .image }) } catch { if case .loaded = library {} else { library = .failed } }
    }

    /// Sends a photo or video picked on the phone to the library and answers with the item. Nil when it
    /// didn't arrive; `uploadError` then says why.
    func upload(_ picked: PhotosPickerItem) async -> MediaItem? {
        guard !uploading else { return nil }
        uploading = true
        uploadError = nil
        defer { uploading = false }
        do {
            guard let file = try await PickedFile.read(picked) else {
                uploadError = "That couldn't be read from your photos. Choose it again."
                return nil
            }
            defer { try? FileManager.default.removeItem(at: file.url) }
            let ticket = try await api.requestUpload(kind: file.kind, name: file.name, contentType: file.contentType, sizeBytes: Double(file.size), aspect: file.aspect)
            let item: MediaItem = try await api.transport.put(file: file.url, contentType: file.contentType, to: ticket.path)
            if case .loaded(let items) = library { library = .loaded([item] + items) }
            return item
        } catch let error as APIError where error.status == 413 || error.status == 415 {
            uploadError = error.message
        } catch {
            uploadError = "That didn't upload. Check your connection and try again."
        }
        return nil
    }

    func clearUploadError() { uploadError = nil }

    /// Characters the person can put on screen: their own first, then the public ones.
    func loadCharacters() async {
        if case .loaded = characters {} else { characters = .loading }
        do {
            let all = try await api.listCharacters()
            characters = .loaded(all.filter(\.mine) + all.filter { !$0.mine })
        } catch {
            if case .loaded = characters {} else { characters = .failed }
        }
    }

    /// Forgets what belonged to the person who was signed in.
    func signedOut() {
        uploadError = nil
        library = .idle
        characters = .idle
    }

    /// Puts a character on screen. The shot starts from their portrait, so it becomes image to video
    /// when the network offers it.
    func cast(_ character: Character, into draft: inout Draft) {
        draft.cast = CharacterCast(slug: character.slug, name: character.name, image: character.image)
        if apps.contains("image-to-video") { draft.app = "image-to-video" }
    }
}

/// A photo or video picked on the phone, as a file ready to send. A photo is rewritten as a JPEG, which
/// every client can show; a video is sent as the phone recorded it.
struct PickedFile {
    let url: URL
    let kind: String
    let name: String
    let contentType: String
    let size: Int
    let aspect: String?

    /// The nearest of the three shapes to a picture, so its tile isn't cropped more than it has to be.
    static func shape(width: CGFloat, height: CGFloat) -> String? {
        guard width > 0, height > 0 else { return nil }
        let ratio = width / height
        return ratio > 1.3 ? "16:9" : ratio < 0.77 ? "9:16" : "1:1"
    }

    /// A name for something from the photo library, which gives none: "Photo, 23 Nov".
    static func name(for kind: String, at date: Date = .now) -> String {
        "\(kind == "video" ? "Video" : "Photo"), \(date.formatted(.dateTime.day().month(.abbreviated)))"
    }

    private struct Movie: Transferable {
        let url: URL
        static var transferRepresentation: some TransferRepresentation {
            FileRepresentation(importedContentType: .movie) { received in
                let copy = FileManager.default.temporaryDirectory.appending(path: "upload-\(UUID().uuidString).\(received.file.pathExtension)")
                try FileManager.default.copyItem(at: received.file, to: copy)
                return Movie(url: copy)
            }
        }
    }

    static func read(_ picked: PhotosPickerItem) async throws -> PickedFile? {
        if picked.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            guard let movie = try await picked.loadTransferable(type: Movie.self) else { return nil }
            let size = (try? movie.url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            let type = UTType(filenameExtension: movie.url.pathExtension)?.preferredMIMEType ?? "video/quicktime"
            return PickedFile(url: movie.url, kind: "video", name: name(for: "video"), contentType: type, size: size, aspect: nil)
        }
        guard let data = try await picked.loadTransferable(type: Data.self), let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.9) else { return nil }
        let url = FileManager.default.temporaryDirectory.appending(path: "upload-\(UUID().uuidString).jpg")
        try jpeg.write(to: url)
        return PickedFile(url: url, kind: "image", name: name(for: "image"), contentType: "image/jpeg", size: jpeg.count, aspect: shape(width: image.size.width, height: image.size.height))
    }
}

/// Which composer tray is open.
enum ComposerTray: Int, Identifiable {
    case attach, cast
    var id: Int { rawValue }
}

extension View {
    /// The attach and cast trays for a composer's draft. A guest is asked to sign in first.
    func composerTrays(draft: Binding<Draft>, open: Binding<ComposerTray?>) -> some View {
        tray(item: open, title: { $0 == .attach ? "Attach a photo or video" : "Put a character in it" }) { which in
            switch which {
            case .attach: AttachTray(draft: draft) { open.wrappedValue = nil }
            case .cast: CastTray(draft: draft) { open.wrappedValue = nil }
            }
        }
    }
}

/// A photo or video to attach: one from the phone, which goes to the library first, or one already
/// there. Each tap on a library item adds or removes it; the tray stays open to pick several.
private struct AttachTray: View {
    @Binding var draft: Draft
    let done: () -> Void
    @State private var picked: PhotosPickerItem?
    @Environment(ComposerSupport.self) private var support
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("The agent can watch a video and work from it, or start a shot from a picture.").text(.body).foregroundStyle(palette.mutedForeground)
            // The system's own picker: it runs outside the app, so no access to the photo library is asked for.
            PhotosPicker(selection: $picked, matching: .any(of: [.images, .videos]), preferredItemEncoding: .compatible) {
                UploadLabel(uploading: support.uploading)
            }
            .buttonStyle(PressStyle())
            .disabled(support.uploading)
            .onChange(of: picked) { _, item in
                guard let item else { return }
                picked = nil
                Task {
                    guard let uploaded = await support.upload(item) else { return }
                    draft.attachments.append(uploaded)
                    done()
                }
            }
            if let error = support.uploadError {
                Text(error).text(.caption).foregroundStyle(palette.destructive)
            }
            Text("From your library").text(.caption, weight: .medium).foregroundStyle(palette.mutedForeground).padding(.top, 4)
            switch support.library {
            case .idle, .loading: PickerSkeleton(aspect: 16 / 9)
            case .failed: LoadFailure(message: "Your library didn't load.") { Task { await support.loadLibrary() } }
            case .loaded(let items) where items.isEmpty:
                Text("Nothing in your library yet. Shots you generate and files you upload are saved there.").text(.body).foregroundStyle(palette.mutedForeground)
            case .loaded(let items):
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(items, id: \.id) { item in
                        let attached = draft.attachments.contains { $0.id == item.id }
                        Button {
                            if attached { draft.attachments.removeAll { $0.id == item.id } } else { draft.attachments.append(item) }
                        } label: {
                            Color.clear
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .overlay { MediaStill(image: item.image, artwork: item.artwork) }
                                .overlay(alignment: .topTrailing) {
                                    if attached {
                                        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(palette.primaryForeground)
                                            .frame(width: 20, height: 20).background(palette.primary, in: Circle()).padding(5)
                                    }
                                }
                                .clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(attached ? palette.foreground : palette.hairline, lineWidth: attached ? 2 : 1))
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel(item.title)
                        .accessibilityAddTraits(attached ? .isSelected : [])
                    }
                }
                .sensoryFeedback(.selection, trigger: draft.attachments.count)
            }
        }
        .task { await support.loadLibrary() }
        .onDisappear { support.clearUploadError() }
    }
}

/// The upload button's face: what it does, or that it is doing it.
private struct UploadLabel: View {
    let uploading: Bool
    @Environment(\.palette) private var palette

    var body: some View {
        HStack(spacing: 8) {
            if uploading { ProgressView().tint(palette.foreground) } else { Image(systemName: "square.and.arrow.up").imageScale(.medium) }
            Text(uploading ? "Uploading…" : "Upload from your photos")
        }
        .text(.body, weight: .medium)
        .foregroundStyle(palette.foreground)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(palette.border, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
    }
}

/// Characters to put on screen. Picking one closes the tray.
private struct CastTray: View {
    @Binding var draft: Draft
    let done: () -> Void
    @Environment(ComposerSupport.self) private var support
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Their portrait becomes the first frame, so they look like themselves in every shot.").text(.body).foregroundStyle(palette.mutedForeground)
            switch support.characters {
            case .idle, .loading: PickerSkeleton(aspect: 3 / 4)
            case .failed: LoadFailure(message: "Characters didn't load.") { Task { await support.loadCharacters() } }
            case .loaded(let characters) where characters.isEmpty:
                Text("No characters yet. Make one on the web and it shows up here.").text(.body).foregroundStyle(palette.mutedForeground)
            case .loaded(let characters):
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 10) {
                    ForEach(characters, id: \.slug) { character in
                        Button {
                            support.cast(character, into: &draft)
                            done()
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Color.clear
                                    .aspectRatio(3 / 4, contentMode: .fit)
                                    .overlay { MediaStill(image: character.image, artwork: character.artwork) }
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(draft.cast?.slug == character.slug ? palette.foreground : palette.hairline, lineWidth: draft.cast?.slug == character.slug ? 2 : 1))
                                Text(character.name).text(.caption, weight: .medium).foregroundStyle(palette.foreground).lineLimit(1)
                            }
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel("\(character.name), \(character.tagline)")
                    }
                }
            }
        }
        .task { await support.loadCharacters() }
    }
}

/// A picker grid's shape while it loads.
private struct PickerSkeleton: View {
    let aspect: CGFloat
    @Environment(\.palette) private var palette

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(0..<6, id: \.self) { _ in
                RoundedRectangle(cornerRadius: Radius.field, style: .continuous).fill(palette.card).aspectRatio(aspect, contentMode: .fit)
            }
        }
        .breathing()
        .accessibilityLabel("Loading")
    }
}
