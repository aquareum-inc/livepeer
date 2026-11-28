import Foundation
import Testing
@testable import Livepeer

/// What the composer sends, and the responses its menus and trays read.
struct ComposerTests {
    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let fixtures = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../docs/mobile/fixtures").standardizedFileURL
        return try JSONDecoder().decode(type, from: Data(contentsOf: fixtures.appending(path: "\(name).json")))
    }

    @Test func anAttachmentAloneAsksForASummary() throws {
        let video = try #require(try fixture("search_library", as: [MediaItem].self).first)
        #expect(!Draft().canSend)
        var draft = Draft(attachments: [video])
        #expect(draft.canSend)
        #expect(draft.text == "Summarise this and list the key moments.")
        draft.prompt = "  Make it slower "
        #expect(draft.text == "Make it slower")
    }

    @Test func aPictureAloneAsksToBeBroughtToLife() throws {
        var picture = try #require(try fixture("search_library", as: [MediaItem].self).first)
        picture.kind = .image
        #expect(Draft(attachments: [picture]).text == "Bring this picture to life.")
    }

    @Test func aPickedPhotoGetsTheNearestShapeAndAName() throws {
        #expect(PickedFile.shape(width: 4032, height: 3024) == "16:9")
        #expect(PickedFile.shape(width: 3024, height: 4032) == "9:16")
        #expect(PickedFile.shape(width: 1080, height: 1080) == "1:1")
        #expect(PickedFile.shape(width: 0, height: 10) == nil)
        #expect(PickedFile.name(for: "image").hasPrefix("Photo, "))
        #expect(PickedFile.name(for: "video").hasPrefix("Video, "))
        let ticket = try fixture("request_upload", as: UploadTicket.self)
        #expect(ticket.method == "PUT" && ticket.headers["Content-Type"] == "image/png")
        // An address on the instance is resolved against it; one on a storage service is used as it is.
        let instance = URL(string: "http://localhost:3100/api/v1")!
        #expect(APITransport.uploadURL(ticket.url, instance: instance)?.absoluteString.hasPrefix("http://localhost:3100/api/storage/uploads/upl_") == true)
        #expect(APITransport.uploadURL("https://media.example.com/bucket/uploads/upl_1?X-Amz-Signature=abc", instance: instance)?.host == "media.example.com")
        #expect(APITransport.uploadURL("file:///etc/hosts", instance: instance) == nil)
        #expect(APITransport.uploadURL("javascript:alert(1)", instance: instance) == nil)
    }

    @Test func theModelAndTheCastCarryOn() {
        let cast = CharacterCast(slug: "mara", name: "Mara", image: nil)
        let carried = Draft(prompt: "On a rooftop", app: "image-to-video", cast: cast, model: "northlight/chat/gemma-3-27b").carriedOn
        #expect(carried.prompt.isEmpty)
        #expect(carried.cast == cast && carried.model == "northlight/chat/gemma-3-27b" && carried.app == "image-to-video")
        #expect(Draft(app: "text-to-video").carriedOn.app == nil)
    }

    @Test func menusAndTraysDecode() throws {
        let menu = try fixture("list_agent_model_menu", as: [AgentModelEntry].self)
        #expect(menu.count >= 2 && menu.allSatisfy { !$0.name.isEmpty && !$0.description.isEmpty })
        #expect(try !fixture("list_characters", as: [Character].self).isEmpty)
        #expect(try !fixture("list_conversations", as: [ConversationSummary].self).isEmpty)
        #expect(try fixture("search_library", as: [MediaItem].self).allSatisfy { $0.kind == .video })
    }
}

/// The agent's orb says what kind of work the running step is, as on the web.
struct AgentOrbTests {
    private func step(_ kind: AgentStepKind, _ app: String?) -> AgentStep {
        AgentStep(id: "stp", kind: kind, title: "", detail: "", app: app, state: .running)
    }

    @Test func eachStepReadsAsItsKindOfWork() {
        #expect(OrbState(step: nil) == .breathing)
        #expect(OrbState(step: step(.plan, nil)) == .solving)
        #expect(OrbState(step: step(.review, "video-understanding")) == .searching)
        #expect(OrbState(step: step(.tool, "image-to-video")) == .composing)
        #expect(OrbState(step: step(.tool, "chat")) == .weaving)
        #expect(OrbState(step: step(.tool, "something-new")) == .working)
    }
}
