// Generated from docs/mobile/openapi.json by packages/mobile-codegen.
// Do not edit: change apps/web/lib/public-api/operations.ts or the API client's types and run `pnpm mobile:generate`.

import Foundation

/// A language model the agent can run on: one app serving it, with what the menu needs to show.
struct AgentModel: Codable, Sendable, Hashable {
    var app: String
    /// The model's id, e.g. `qwen3.8-27b`.
    var model: String
    var contextTokens: Double?
    /// No runner is free right now, so a job would queue.
    var busy: Bool

    enum CodingKeys: String, CodingKey {
        case app
        case model
        case contextTokens = "context_tokens"
        case busy
    }
}

/// One row of the agent's model menu: a language model, however many apps serve it. Named by the same rules as the web's menu, so every client lists models the same way.
struct AgentModelEntry: Codable, Sendable, Hashable {
    /// The app to send as `agent_model`: the copy with a runner free and the most context.
    var app: String
    /// Other apps serving the same model.
    var also: [String]
    /// The model's readable name, "Qwen3.8 27B".
    var name: String
    /// What sets it apart, "128K context".
    var description: String
    /// No runner is free right now, so a job would queue.
    var busy: Bool
}

/// How a discovered app reads in the interface, so every client names it the same way.
struct CapabilityLabel: Codable, Sendable, Hashable {
    var app: String
    /// What it is: "Text to video", or a language model's name.
    var name: String
    /// How it reads where it did a piece of work, with its model when known: "Text to image · FLUX.2 klein 4B".
    var work: String
}

struct CapabilityRun: Codable, Sendable, Hashable {
    var app: String
    var request: JSONValue
    var response: JSONValue
    var status: Double
    var elapsedMs: Double
    var creditsCharged: Double

    enum CodingKeys: String, CodingKey {
        case app
        case request
        case response
        case status
        case elapsedMs = "elapsed_ms"
        case creditsCharged = "credits_charged"
    }
}

enum CharacterVisibility: String, Codable, Sendable, Hashable, CaseIterable {
    case `private` = "private"
    case `public` = "public"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct Character: Codable, Sendable, Hashable {
    var slug: String
    var name: String
    var tagline: String
    var description: String
    /// How the character opens a conversation.
    var greeting: String
    var author: String
    var visibility: CharacterVisibility
    var mature: Bool
    /// Can take a live voice or video call.
    var calls: Bool
    var tags: [String]
    var rating: Double
    var chats: Double
    var mine: Bool
    /// A portrait, when there is one. Without one, `artwork` stands in with the name's initial.
    var image: String?
    var artwork: MockArtwork
}

/// Stand-in artwork for mocked media, until real outputs exist.
struct MockArtwork: Codable, Sendable, Hashable {
    var hues: [Double]
    var seed: Double
}

/// A character someone blocked: it, and everything else by its author, is hidden from them.
struct CharacterBlock: Codable, Sendable, Hashable {
    var characterSlug: String
    var author: String

    enum CodingKeys: String, CodingKey {
        case characterSlug = "character_slug"
        case author
    }
}

/// Open until the operator acts: dismissed leaves the character up; hidden takes it off the instance.
enum CharacterReportState: String, Codable, Sendable, Hashable, CaseIterable {
    case open = "open"
    case dismissed = "dismissed"
    case hidden = "hidden"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// A report of a public character, as the operator reviews it. Who reported it is kept, never shown.
struct CharacterReport: Codable, Sendable, Hashable {
    var id: String
    var characterSlug: String
    var characterName: String
    var author: String
    var reason: ReportReason
    /// What the person added in their own words.
    var note: String?
    var createdAt: String
    /// Open until the operator acts: dismissed leaves the character up; hidden takes it off the instance.
    var state: CharacterReportState

    enum CodingKeys: String, CodingKey {
        case id
        case characterSlug = "character_slug"
        case characterName = "character_name"
        case author
        case reason
        case note
        case createdAt = "created_at"
        case state
    }
}

/// Why someone reported a character.
enum ReportReason: String, Codable, Sendable, Hashable, CaseIterable {
    case sexual = "sexual"
    case hateful = "hateful"
    case violent = "violent"
    case impersonation = "impersonation"
    case spam = "spam"
    case other = "other"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

enum ComputeOperatorStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case allowed = "allowed"
    case blocked = "blocked"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// An operator's view of one compute operator, derived from the jobs it served.
struct ComputeOperator: Codable, Sendable, Hashable {
    var orchestratorUrl: String
    var runners: Double
    var apps: [String]
    var jobs: Double
    var failures: Double
    var medianResponseMs: Double?
    var status: ComputeOperatorStatus

    enum CodingKeys: String, CodingKey {
        case orchestratorUrl = "orchestrator_url"
        case runners
        case apps
        case jobs
        case failures
        case medianResponseMs = "median_response_ms"
        case status
    }
}

struct Conversation: Codable, Sendable, Hashable {
    var id: String
    var title: String
    var updatedAt: String
    var messages: [Message]

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case updatedAt = "updated_at"
        case messages
    }
}

enum Message: Codable, Sendable, Hashable {
    case user(UserMessage)
    case agent(AgentMessage)

    private enum Discriminator: String, CodingKey { case role = "role" }

    init(from decoder: Decoder) throws {
        let kind = try decoder.container(keyedBy: Discriminator.self).decode(String.self, forKey: .role)
        switch kind {
        case "user": self = .user(try UserMessage(from: decoder))
        case "agent": self = .agent(try AgentMessage(from: decoder))
        default: throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown Message role: \(kind)"))
        }
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case .user(let value): try value.encode(to: encoder)
        case .agent(let value): try value.encode(to: encoder)
        }
    }
}

struct UserMessage: Codable, Sendable, Hashable {
    var id: String
    var role: String
    var text: String
    /// The character the message asked to put on screen, if any.
    var cast: CharacterCast?
    /// The language model the user picked to run the agent; `null` was Auto.
    var agentModel: String?
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case text
        case cast
        case agentModel = "agent_model"
        case createdAt = "created_at"
    }
}

/// Who a request puts on screen: just enough of a character to show and to start a shot from.
struct CharacterCast: Codable, Sendable, Hashable {
    var slug: String
    var name: String
    /// A portrait, when there is one. Without one, `artwork` stands in with the name's initial.
    var image: String?
}

enum AgentMessageState: String, Codable, Sendable, Hashable, CaseIterable {
    case working = "working"
    case done = "done"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct AgentMessage: Codable, Sendable, Hashable {
    var id: String
    var role: String
    var state: AgentMessageState
    var steps: [AgentStep]
    /// The reply, once the agent has finished.
    var text: String?
    /// Generations produced in this turn; each can be opened in the studio.
    var generationIds: [String]
    /// Set when the turn analysed a video.
    var analysis: VideoAnalysis?
    var elapsedMs: Double
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case state
        case steps
        case text
        case generationIds = "generation_ids"
        case analysis
        case elapsedMs = "elapsed_ms"
        case createdAt = "created_at"
    }
}

enum AgentStepKind: String, Codable, Sendable, Hashable, CaseIterable {
    case plan = "plan"
    case tool = "tool"
    case review = "review"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// One thing the agent did: a decision, a tool call against a capability, or a review of its own output.
struct AgentStep: Codable, Sendable, Hashable {
    var id: String
    var kind: AgentStepKind
    var title: String
    var detail: String
    /// The capability called, for tool and review steps.
    var app: String?
    var state: AgentStepState
}

enum AgentStepState: String, Codable, Sendable, Hashable, CaseIterable {
    case pending = "pending"
    case running = "running"
    case done = "done"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct VideoAnalysis: Codable, Sendable, Hashable {
    var summary: String
    var moments: [VideoMoment]
    var tags: [String]
}

/// A moment an understanding capability found in a video.
struct VideoMoment: Codable, Sendable, Hashable {
    var atSeconds: Double
    var label: String

    enum CodingKeys: String, CodingKey {
        case atSeconds = "at_seconds"
        case label
    }
}

struct ConversationSummary: Codable, Sendable, Hashable {
    var id: String
    var title: String
    var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case updatedAt = "updated_at"
    }
}

struct CostSummaryByClass: Codable, Sendable, Hashable {
    var delivered: Fees
    var failedAfterPayment: Fees
    var uncertain: Fees
    var pending: Fees

    enum CodingKeys: String, CodingKey {
        case delivered
        case failedAfterPayment = "failed_after_payment"
        case uncertain
        case pending
    }
}

struct CostSummaryByApp: Codable, Sendable, Hashable {
    var delivered: Fees?
    var failedAfterPayment: Fees?
    var uncertain: Fees?
    var pending: Fees?

    enum CodingKeys: String, CodingKey {
        case delivered
        case failedAfterPayment = "failed_after_payment"
        case uncertain
        case pending
    }
}

/// `GET /v1/costs/summary`.
struct CostSummary: Codable, Sendable, Hashable {
    var start: String
    var end: String
    var byClass: CostSummaryByClass
    var jobsWithCost: Double
    var jobsPending: Double
    var byApp: [String: CostSummaryByApp]

    enum CodingKeys: String, CodingKey {
        case start
        case end
        case byClass = "by_class"
        case jobsWithCost = "jobs_with_cost"
        case jobsPending = "jobs_pending"
        case byApp = "by_app"
    }
}

struct Fees: Codable, Sendable, Hashable {
    var feeEth: String
    var feeUsd: String?
    var rowCount: Double

    enum CodingKeys: String, CodingKey {
        case feeEth = "fee_eth"
        case feeUsd = "fee_usd"
        case rowCount = "row_count"
    }
}

/// A user's balance in credits: their allocation's available amount after the instance's markup rule.
struct CreditBalance: Codable, Sendable, Hashable {
    var credits: Double
    var allowance: BudgetSummary
}

/// A user's budget in the provider's currency: what was granted, spent and is left.
struct BudgetSummary: Codable, Sendable, Hashable {
    var granted: String
    var spent: String
    var available: String
    var currency: String
}

/// The answer to a delete.
struct Deleted: Codable, Sendable, Hashable {
    var deleted: Bool
}

enum DeviceSessionPlatform: String, Codable, Sendable, Hashable, CaseIterable {
    case ios = "ios"
    case android = "android"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// A phone or tablet signed in to the instance with its own revocable session.
struct DeviceSession: Codable, Sendable, Hashable {
    var id: String
    /// The device's own name, as it reported it ("Adam's iPhone").
    var name: String
    var platform: DeviceSessionPlatform
    var createdAt: String
    var lastUsedAt: String
    /// The session making this request.
    var current: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case platform
        case createdAt = "created_at"
        case lastUsedAt = "last_used_at"
        case current
    }
}

/// A new device session. The token is shown once; the instance keeps only a keyed hash of it.
struct DeviceToken: Codable, Sendable, Hashable {
    var token: String
    var device: DeviceSession
}

/// The answer to a change that has nothing else to say.
struct Done: Codable, Sendable, Hashable {
    var ok: Bool
}

/// `GET /readyz`.
struct EngineHealth: Codable, Sendable, Hashable {
    var ready: Bool
    var discoveryFresh: Bool
    var discoveryObservedAt: String?
    var discoveryError: String?
    var costSyncAt: String?
    var costSyncError: String?
    var runningJobs: Double
    var allocationMode: String
    var version: String

    enum CodingKeys: String, CodingKey {
        case ready
        case discoveryFresh = "discovery_fresh"
        case discoveryObservedAt = "discovery_observed_at"
        case discoveryError = "discovery_error"
        case costSyncAt = "cost_sync_at"
        case costSyncError = "cost_sync_error"
        case runningJobs = "running_jobs"
        case allocationMode = "allocation_mode"
        case version
    }
}

enum EngineJobMode: String, Codable, Sendable, Hashable, CaseIterable {
    case immediate = "immediate"
    case async = "async"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// `GET /v1/jobs` item.
struct EngineJob: Codable, Sendable, Hashable {
    var id: String
    var actorId: String
    var applicationId: String
    var operationRef: String?
    var mode: EngineJobMode
    var app: String
    var capability: String?
    var model: String?
    var state: JobState
    var attempts: [JobAttempt]
    var failure: JobFailure?
    var createdAt: String
    var completedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case actorId = "actor_id"
        case applicationId = "application_id"
        case operationRef = "operation_ref"
        case mode
        case app
        case capability
        case model
        case state
        case attempts
        case failure
        case createdAt = "created_at"
        case completedAt = "completed_at"
    }
}

/// Operator-side types. The engine shapes are as documented in docs/research/engine.md §4.
enum JobState: String, Codable, Sendable, Hashable, CaseIterable {
    case queued = "queued"
    case running = "running"
    case succeeded = "succeeded"
    case failed = "failed"
    case uncertain = "uncertain"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct JobAttemptTimings: Codable, Sendable, Hashable {
    var challengeMs: Double?
    var signingMs: Double?
    var responseMs: Double?

    enum CodingKeys: String, CodingKey {
        case challengeMs = "challenge_ms"
        case signingMs = "signing_ms"
        case responseMs = "response_ms"
    }
}

struct JobAttempt: Codable, Sendable, Hashable {
    var jobId: String
    var number: Double
    var runnerUrl: String?
    var orchestratorUrl: String?
    var allocationId: String?
    var paymentSent: Bool
    var outcome: String
    var statusCode: Double?
    var startedAt: String
    var endedAt: String?
    var timings: JobAttemptTimings?

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case number
        case runnerUrl = "runner_url"
        case orchestratorUrl = "orchestrator_url"
        case allocationId = "allocation_id"
        case paymentSent = "payment_sent"
        case outcome
        case statusCode = "status_code"
        case startedAt = "started_at"
        case endedAt = "ended_at"
        case timings
    }
}

struct JobFailure: Codable, Sendable, Hashable {
    var kind: String
    var message: String
    var statusCode: Double?
    var body: String?
    var paymentSent: Bool
    var reason: String?

    enum CodingKeys: String, CodingKey {
        case kind
        case message
        case statusCode = "status_code"
        case body
        case paymentSent = "payment_sent"
        case reason
    }
}

/// An async generation job. Mocked: the engine's async jobs return 501 today.
struct Generation: Codable, Sendable, Hashable {
    var id: String
    var state: GenerationState
    var progress: Double
    var request: GenerationRequest
    var creditsCharged: Double
    var createdAt: String
    var artwork: MockArtwork

    enum CodingKeys: String, CodingKey {
        case id
        case state
        case progress
        case request
        case creditsCharged = "credits_charged"
        case createdAt = "created_at"
        case artwork
    }
}

enum GenerationState: String, Codable, Sendable, Hashable, CaseIterable {
    case queued = "queued"
    case running = "running"
    case succeeded = "succeeded"
    case failed = "failed"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

enum GenerationRequestAspect: String, Codable, Sendable, Hashable, CaseIterable {
    case v16x9 = "16:9"
    case v9x16 = "9:16"
    case v1x1 = "1:1"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// Video only.
enum GenerationRequestResolution: String, Codable, Sendable, Hashable, CaseIterable {
    case v720p = "720p"
    case v1080p = "1080p"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct GenerationRequest: Codable, Sendable, Hashable {
    var kind: MediaKind
    var app: String
    var prompt: String
    var aspect: GenerationRequestAspect
    /// Video and audio only.
    var durationSeconds: Double?
    /// Video only.
    var resolution: GenerationRequestResolution?
    var negativePrompt: String?
    /// Image-to-video only: the image the shot starts from, such as a character's portrait.
    var firstFrame: String?

    enum CodingKeys: String, CodingKey {
        case kind
        case app
        case prompt
        case aspect
        case durationSeconds = "duration_seconds"
        case resolution
        case negativePrompt = "negative_prompt"
        case firstFrame = "first_frame"
    }
}

enum MediaKind: String, Codable, Sendable, Hashable, CaseIterable {
    case video = "video"
    case image = "image"
    case audio = "audio"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct Grant: Codable, Sendable, Hashable {
    var id: String
    var label: String
    var funded: Money
    var allocated: Money
    var spent: Money
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case label
        case funded
        case allocated
        case spent
        case createdAt = "created_at"
    }
}

/// The payment and identity provider behind the engine, in the engine's terms: grants fund allocations, an allocation is a user's budget, usage is what was spent, a plan is the provider's plan. Nothing here is a second ledger: every amount is read from the provider.
struct Money: Codable, Sendable, Hashable {
    /// Decimal string, as the engine and providers report amounts.
    var amount: String
    var currency: String
}

struct InstanceDescriptionLogo: Codable, Sendable, Hashable {
    /// A square mark, or null to set the name's first letter in type.
    var symbol: String?
    /// The full logo, or null to set the name in type.
    var wordmark: String?
    /// Draw the marks in the text colour, using only their shape.
    var tint: Bool
}

/// Overrides for colour tokens, per theme, keyed by token name ("primary"). Tokens not listed keep their default.
struct InstanceDescriptionTheme: Codable, Sendable, Hashable {
    var dark: [String: String]
    var light: [String: String]
}

struct InstanceDescriptionSurfaces: Codable, Sendable, Hashable {
    var app: Bool
    var console: Bool
    var api: Bool
    var mcp: Bool
    var mobile: Bool
    var mobileConsole: Bool

    enum CodingKeys: String, CodingKey {
        case app
        case console
        case api
        case mcp
        case mobile
        case mobileConsole = "mobile_console"
    }
}

struct InstanceDescriptionMobileIos: Codable, Sendable, Hashable {
    var bundleId: String
    var minimumVersion: String?

    enum CodingKeys: String, CodingKey {
        case bundleId = "bundle_id"
        case minimumVersion = "minimum_version"
    }
}

struct InstanceDescriptionMobileAndroid: Codable, Sendable, Hashable {
    var applicationId: String
    var minimumVersion: String?
    /// What the Android app starts Firebase Cloud Messaging with, to be given an address for alerts. None of it is secret: it ships in every Android app. Null when the instance has none.
    var firebase: InstanceFirebase?

    enum CodingKeys: String, CodingKey {
        case applicationId = "application_id"
        case minimumVersion = "minimum_version"
        case firebase
    }
}

/// The native apps built for this instance. Sign-in returns only to these; an app not listed can't sign in.
struct InstanceDescriptionMobile: Codable, Sendable, Hashable {
    var ios: InstanceDescriptionMobileIos?
    var android: InstanceDescriptionMobileAndroid?
}

enum InstanceDescriptionSignInSignUp: String, Codable, Sendable, Hashable, CaseIterable {
    case open = "open"
    case invite = "invite"
    case closed = "closed"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct InstanceDescriptionSignIn: Codable, Sendable, Hashable {
    var methods: [SignInMethodName]
    var signUp: InstanceDescriptionSignInSignUp

    enum CodingKeys: String, CodingKey {
        case methods
        case signUp = "sign_up"
    }
}

struct InstanceDescriptionContent: Codable, Sendable, Hashable {
    var characters: Bool
    var adultContent: Bool

    enum CodingKeys: String, CodingKey {
        case characters
        case adultContent = "adult_content"
    }
}

struct InstanceDescriptionHome: Codable, Sendable, Hashable {
    var backgroundImage: String?
    var backgroundPoster: String?
    var backgroundVideo: String?
    /// Draw a live aurora over the background image.
    var aurora: Bool

    enum CodingKeys: String, CodingKey {
        case backgroundImage = "background_image"
        case backgroundPoster = "background_poster"
        case backgroundVideo = "background_video"
        case aurora
    }
}

/// What a client needs to know about an instance before anyone signs in: how it looks, what it serves and how to sign in. Read from the instance config, so there is no engine call behind it. URLs are absolute and theme colours are sRGB hex, so a client that can't read CSS can use them as they are.
struct InstanceDescription: Codable, Sendable, Hashable {
    var apiVersion: String
    var name: String
    var logo: InstanceDescriptionLogo
    /// Overrides for colour tokens, per theme, keyed by token name ("primary"). Tokens not listed keep their default.
    var theme: InstanceDescriptionTheme
    var surfaces: InstanceDescriptionSurfaces
    /// The native apps built for this instance. Sign-in returns only to these; an app not listed can't sign in.
    var mobile: InstanceDescriptionMobile
    var signIn: InstanceDescriptionSignIn
    var content: InstanceDescriptionContent
    var home: InstanceDescriptionHome

    enum CodingKeys: String, CodingKey {
        case apiVersion = "api_version"
        case name
        case logo
        case theme
        case surfaces
        case mobile
        case signIn = "sign_in"
        case content
        case home
    }
}

/// The public values of a Firebase project, as its settings page gives them for one Android app.
struct InstanceFirebase: Codable, Sendable, Hashable {
    var projectId: String
    var appId: String
    var apiKey: String
    var senderId: String

    enum CodingKeys: String, CodingKey {
        case projectId = "project_id"
        case appId = "app_id"
        case apiKey = "api_key"
        case senderId = "sender_id"
    }
}

/// A way to sign in that an instance can offer.
enum SignInMethodName: String, Codable, Sendable, Hashable, CaseIterable {
    case email = "email"
    case passkey = "passkey"
    case google = "google"
    case apple = "apple"
    case discord = "discord"
    case coinbase = "coinbase"
    case wallet = "wallet"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

enum KnownActorAllocationStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case active = "active"
    case paused = "paused"
    case exhausted = "exhausted"
    case revoked = "revoked"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct KnownActorAllocation: Codable, Sendable, Hashable {
    var grantId: String
    var allocationId: String
    var currency: String
    var status: KnownActorAllocationStatus
    var createdAt: String
    var updatedAt: String
    var label: String

    enum CodingKeys: String, CodingKey {
        case grantId = "grant_id"
        case allocationId = "allocation_id"
        case currency
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case label
    }
}

/// `GET /v1/admin/actors` item.
struct KnownActor: Codable, Sendable, Hashable {
    var applicationId: String
    var actorId: String
    var label: String
    var name: String?
    var allocation: KnownActorAllocation?
    var firstSeenAt: String?
    var lastSeenAt: String?
    var provisioned: Bool

    enum CodingKeys: String, CodingKey {
        case applicationId = "application_id"
        case actorId = "actor_id"
        case label
        case name
        case allocation
        case firstSeenAt = "first_seen_at"
        case lastSeenAt = "last_seen_at"
        case provisioned
    }
}

enum LiveSessionState: String, Codable, Sendable, Hashable, CaseIterable {
    case live = "live"
    case ended = "ended"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct LiveSession: Codable, Sendable, Hashable {
    var id: String
    var app: String
    var state: LiveSessionState
    var prompt: String
    var destinationIds: [String]
    var recording: Bool
    var startedAt: String
    /// Set when the session ended and was recorded.
    var recordingMediaId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case app
        case state
        case prompt
        case destinationIds = "destination_ids"
        case recording
        case startedAt = "started_at"
        case recordingMediaId = "recording_media_id"
    }
}

/// Whether the person runs this instance. An app offers the console from this; the server still decides every request.
enum MeRole: String, Codable, Sendable, Hashable, CaseIterable {
    case user = "user"
    case `operator` = "operator"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// The signed-in user, as the account menu shows them.
struct Me: Codable, Sendable, Hashable {
    var id: String
    var name: String
    var email: String?
    /// Whether the person runs this instance. An app offers the console from this; the server still decides every request.
    var role: MeRole
    var balance: CreditBalance
}

enum MediaItemSource: String, Codable, Sendable, Hashable, CaseIterable {
    case generation = "generation"
    case upload = "upload"
    case recording = "recording"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

enum MediaItemAspect: String, Codable, Sendable, Hashable, CaseIterable {
    case v16x9 = "16:9"
    case v9x16 = "9:16"
    case v1x1 = "1:1"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// Something in the user's library: an upload or a generation, with what the product understood about it.
struct MediaItem: Codable, Sendable, Hashable {
    var id: String
    var kind: MediaKind
    var source: MediaItemSource
    var title: String
    /// Automatic description, from a video understanding capability.
    var description: String
    var tags: [String]
    var app: String?
    var prompt: String?
    var aspect: MediaItemAspect
    var durationSeconds: Double?
    var createdAt: String
    /// A still of the media, when there is one. Tiles without one show `artwork`.
    var image: String?
    var artwork: MockArtwork

    enum CodingKeys: String, CodingKey {
        case id
        case kind
        case source
        case title
        case description
        case tags
        case app
        case prompt
        case aspect
        case durationSeconds = "duration_seconds"
        case createdAt = "created_at"
        case image
        case artwork
    }
}

/// A capability on the network as the operator sees it: what it's called, whether this instance offers it, and who can run it now.
struct OfferedCapability: Codable, Sendable, Hashable {
    var app: String
    /// What it is, as the interface names it: "Text to video".
    var name: String
    /// Whether this instance offers it to its users.
    var enabled: Bool
    /// Multiplier on wholesale cost; null uses the instance default.
    var markup: Double?
    /// Compute operators' runners that advertise it, and how many are ready now.
    var runnerCount: Double
    var readyCount: Double
    /// True when discovery hasn't seen it lately.
    var stale: Bool

    enum CodingKeys: String, CodingKey {
        case app
        case name
        case enabled
        case markup
        case runnerCount = "runner_count"
        case readyCount = "ready_count"
        case stale
    }
}

/// One row of `GET /v1/offerings`. Identity is (app, currency, unit).
struct Offering: Codable, Sendable, Hashable {
    var app: String
    var modes: [InteractionMode]
    var rateLow: RatePoint?
    var rateHigh: RatePoint?
    var rateStatus: String
    var stale: Bool
    var runnerCount: Double
    var readyCount: Double
    var observedAt: String

    enum CodingKeys: String, CodingKey {
        case app
        case modes
        case rateLow = "rate_low"
        case rateHigh = "rate_high"
        case rateStatus = "rate_status"
        case stale
        case runnerCount = "runner_count"
        case readyCount = "ready_count"
        case observedAt = "observed_at"
    }
}

/// Types shaped on the engine's real responses (livepeer-builder `GET /v1/offerings`, `GET /v1/allowance`). See docs/research/engine.md. Amounts are decimal strings.
enum InteractionMode: String, Codable, Sendable, Hashable, CaseIterable {
    case singleShot = "single-shot"
    case persistent = "persistent"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct RatePoint: Codable, Sendable, Hashable {
    var amount: String
    var currency: String
    var unit: String
    var priceUsd: String?
    var source: String
    var observedAt: String
    var observedBy: String

    enum CodingKeys: String, CodingKey {
        case amount
        case currency
        case unit
        case priceUsd = "price_usd"
        case source
        case observedAt = "observed_at"
        case observedBy = "observed_by"
    }
}

/// Off, on, or on but Apple or Google has said the phone can no longer be reached.
enum OperatorAlertsState: String, Codable, Sendable, Hashable, CaseIterable {
    case off = "off"
    case on = "on"
    case notReaching = "not_reaching"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// Alerts on one operator's phone: whether the instance can send any, which are on, and until when.
struct OperatorAlerts: Codable, Sendable, Hashable {
    /// Whether this instance can send to this phone's platform at all.
    var offered: Bool
    /// Off, on, or on but Apple or Google has said the phone can no longer be reached.
    var state: OperatorAlertsState
    var kinds: [OperatorAlertChoice]
    /// When alerts end unless the phone signs in again. Null while they are off.
    var until: String?
    var lastAlertAt: String?

    enum CodingKeys: String, CodingKey {
        case offered
        case state
        case kinds
        case until
        case lastAlertAt = "last_alert_at"
    }
}

/// One choice on a phone's Alerts page, with the words for its switch.
struct OperatorAlertChoice: Codable, Sendable, Hashable {
    var kind: OperatorAlertKind
    /// "The engine stops being ready".
    var label: String
    var on: Bool
}

/// Something an operator's phone can choose to be told about. The names are the ones Status uses.
enum OperatorAlertKind: String, Codable, Sendable, Hashable, CaseIterable {
    case engineNotReady = "engine_not_ready"
    case jobsFailing = "jobs_failing"
    case reportsWaiting = "reports_waiting"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// A value for the phone's key to sign, once, before it expires.
struct OperatorChallenge: Codable, Sendable, Hashable {
    var nonce: String
    var expiresAt: String

    enum CodingKeys: String, CodingKey {
        case nonce
        case expiresAt = "expires_at"
    }
}

/// A new operator device session. The token is shown once; the instance keeps only a keyed hash of it.
struct OperatorDeviceToken: Codable, Sendable, Hashable {
    var token: String
    var device: OperatorDeviceSession
}

enum OperatorDeviceSessionPlatform: String, Codable, Sendable, Hashable, CaseIterable {
    case ios = "ios"
    case android = "android"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// An operator's phone enrolled for the console: its own session, bound to a key in the phone's secure hardware.
struct OperatorDeviceSession: Codable, Sendable, Hashable {
    var id: String
    /// Whose phone it is.
    var userId: String
    var userName: String
    /// The phone's own name, as it reported it.
    var name: String
    var platform: OperatorDeviceSessionPlatform
    var createdAt: String
    var lastUsedAt: String
    /// When the phone last proved a face or fingerprint to open the console.
    var lastUnlockedAt: String?
    /// When the session ends whatever its use, and the operator signs in again.
    var expiresAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case userName = "user_name"
        case name
        case platform
        case createdAt = "created_at"
        case lastUsedAt = "last_used_at"
        case lastUnlockedAt = "last_unlocked_at"
        case expiresAt = "expires_at"
    }
}

struct OperatorStatusToday: Codable, Sendable, Hashable {
    var activeUsers: Double
    var jobs: Double
    var failed: Double
    var revenueUsd: Double
    var wholesaleUsd: Double
    var marginUsd: Double
    var revenueEstimated: Bool

    enum CodingKeys: String, CodingKey {
        case activeUsers = "active_users"
        case jobs
        case failed
        case revenueUsd = "revenue_usd"
        case wholesaleUsd = "wholesale_usd"
        case marginUsd = "margin_usd"
        case revenueEstimated = "revenue_estimated"
    }
}

struct OperatorStatusService: Codable, Sendable, Hashable {
    var engineReady: Bool
    var discoveryFresh: Bool
    var discoveryObservedAt: String?
    var costSyncAt: String?
    var costSyncError: String?
    var runningJobs: Double
    var engineVersion: String

    enum CodingKeys: String, CodingKey {
        case engineReady = "engine_ready"
        case discoveryFresh = "discovery_fresh"
        case discoveryObservedAt = "discovery_observed_at"
        case costSyncAt = "cost_sync_at"
        case costSyncError = "cost_sync_error"
        case runningJobs = "running_jobs"
        case engineVersion = "engine_version"
    }
}

/// Whether anything is wrong, today's figures and the state of the service, in one answer.
struct OperatorStatus: Codable, Sendable, Hashable {
    var checkedAt: String
    /// Empty when everything is running.
    var attention: [OperatorAttention]
    var today: OperatorStatusToday
    var service: OperatorStatusService

    enum CodingKeys: String, CodingKey {
        case checkedAt = "checked_at"
        case attention
        case today
        case service
    }
}

enum OperatorAttentionKind: String, Codable, Sendable, Hashable, CaseIterable {
    case engineNotReady = "engine_not_ready"
    case discoveryStale = "discovery_stale"
    case costsNotSynced = "costs_not_synced"
    case jobsFailing = "jobs_failing"
    case reportsWaiting = "reports_waiting"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// Where to deal with it.
enum OperatorAttentionOpens: String, Codable, Sendable, Hashable, CaseIterable {
    case status = "status"
    case jobs = "jobs"
    case reports = "reports"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// Something that needs the operator, as the Status screen lists it.
struct OperatorAttention: Codable, Sendable, Hashable {
    var kind: OperatorAttentionKind
    /// The line to show: "3 reports are waiting".
    var message: String
    var count: Double?
    /// Where to deal with it.
    var opens: OperatorAttentionOpens
}

/// The console is open on this phone until then.
struct OperatorUnlock: Codable, Sendable, Hashable {
    var unlockedUntil: String

    enum CodingKeys: String, CodingKey {
        case unlockedUntil = "unlocked_until"
    }
}

struct OverviewStatsSeries: Codable, Sendable, Hashable {
    var day: String
    var revenueUsd: Double
    var wholesaleUsd: Double

    enum CodingKeys: String, CodingKey {
        case day
        case revenueUsd = "revenue_usd"
        case wholesaleUsd = "wholesale_usd"
    }
}

struct OverviewStats: Codable, Sendable, Hashable {
    var activeUsers: Double
    var jobsToday: Double
    var jobsFailedToday: Double
    /// Credits charged, as money at the instance's rate.
    var revenueUsd: Double
    var wholesaleUsd: Double
    var marginUsd: Double
    var pendingUsd: Double
    /// True while revenue is worked out from wholesale cost at the default markup, rather than reported by the payment provider.
    var revenueEstimated: Bool
    /// Per day, oldest first.
    var series: [OverviewStatsSeries]

    enum CodingKeys: String, CodingKey {
        case activeUsers = "active_users"
        case jobsToday = "jobs_today"
        case jobsFailedToday = "jobs_failed_today"
        case revenueUsd = "revenue_usd"
        case wholesaleUsd = "wholesale_usd"
        case marginUsd = "margin_usd"
        case pendingUsd = "pending_usd"
        case revenueEstimated = "revenue_estimated"
        case series
    }
}

enum PlanInterval: String, Codable, Sendable, Hashable, CaseIterable {
    case month = "month"
    case year = "year"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct Plan: Codable, Sendable, Hashable {
    var id: String
    var name: String
    var description: String
    var price: Money
    var interval: PlanInterval
    var allowance: PlanAllowance
    var features: [String]
    /// Multiplier on wholesale cost for subscribers; null uses the instance default.
    var markup: Double?
    var active: Bool
}

enum PlanAllowancePeriod: String, Codable, Sendable, Hashable, CaseIterable {
    case month = "month"
    case year = "year"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct PlanAllowance: Codable, Sendable, Hashable {
    /// Credits included each period.
    var credits: Double
    var period: PlanAllowancePeriod
    /// Months unused credits carry forward; 0 means they expire.
    var rolloverMonths: Double

    enum CodingKeys: String, CodingKey {
        case credits
        case period
        case rolloverMonths = "rollover_months"
    }
}

struct PlanAndCreditsTopUp: Codable, Sendable, Hashable {
    var min: Money
    var max: Money
    var creditsPerUsd: Double

    enum CodingKeys: String, CodingKey {
        case min
        case max
        case creditsPerUsd = "credits_per_usd"
    }
}

struct PlanAndCreditsProvider: Codable, Sendable, Hashable {
    var id: String
    var name: String
    var features: ProviderFeatures
}

/// The signed-in user's plan, what they could change to, and what the provider supports.
struct PlanAndCredits: Codable, Sendable, Hashable {
    var plan: Plan?
    var plans: [Plan]
    var packs: [CreditPack]
    /// Top-ups of the user's own amount, or null when the provider can't take them or the operator turned them off.
    var topUp: PlanAndCreditsTopUp?
    var provider: PlanAndCreditsProvider

    enum CodingKeys: String, CodingKey {
        case plan
        case plans
        case packs
        case topUp = "top_up"
        case provider
    }
}

/// A one-off top-up the provider sells at a fixed price. Buying one adds to the user's allocation.
struct CreditPack: Codable, Sendable, Hashable {
    var id: String
    var credits: Double
    var price: Money
    /// Shown first and marked to users. At most one pack is.
    var popular: Bool
    /// Offered to users. Packs are withdrawn rather than deleted, so past purchases still name them.
    var active: Bool
}

/// What the connected provider can do, so the UI can say so instead of failing.
struct ProviderFeatures: Codable, Sendable, Hashable {
    var users: Bool
    var grants: Bool
    var plans: Bool
    var allowances: Bool
    var creditPacks: Bool
    /// Top-ups of an amount the user chooses.
    var customTopUp: Bool
    var invoices: Bool
    var oidc: Bool
    /// Shared accounts with members and roles.
    var workspaces: Bool

    enum CodingKeys: String, CodingKey {
        case users
        case grants
        case plans
        case allowances
        case creditPacks = "credit_packs"
        case customTopUp = "custom_top_up"
        case invoices
        case oidc
        case workspaces
    }
}

enum PreferencesDefaultAspect: String, Codable, Sendable, Hashable, CaseIterable {
    case v16x9 = "16:9"
    case v9x16 = "9:16"
    case v1x1 = "1:1"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct Preferences: Codable, Sendable, Hashable {
    /// Confirmed to be 18 or over. Required before adult content can be switched on.
    var ageConfirmed: Bool
    var adultContent: Bool
    var saveChats: Bool
    var confirmBeforeSpending: Bool
    var enterSends: Bool
    var completionNotifications: Bool
    var defaultAspect: PreferencesDefaultAspect
    var defaultDuration: Double
}

/// How this instance treats what people make, in plain words.
struct PrivacyDescription: Codable, Sendable, Hashable {
    /// Whether the instance keeps prompts and outputs on its servers.
    var retainsChats: Bool
    var tiers: [PrivacyTier]

    enum CodingKeys: String, CodingKey {
        case retainsChats = "retains_chats"
        case tiers
    }
}

/// Who can see a job, per way of running the instance. The same words on every surface.
struct PrivacyTier: Codable, Sendable, Hashable {
    var name: String
    /// Set when the tier isn't plainly available, such as "Planned, not available".
    var status: String?
    var summary: String
    var instanceSees: String
    var computeSees: String

    enum CodingKeys: String, CodingKey {
        case name
        case status
        case summary
        case instanceSees = "instance_sees"
        case computeSees = "compute_sees"
    }
}

struct PromptStarter: Codable, Sendable, Hashable {
    var id: String
    var label: String
    var app: String
    var examples: [String]
}

/// What one result of a draft would cost.
struct Quote: Codable, Sendable, Hashable {
    var credits: Double
}

enum ShowcaseItemAspect: String, Codable, Sendable, Hashable, CaseIterable {
    case v16x9 = "16:9"
    case v9x16 = "9:16"
    case v1x1 = "1:1"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// An example in the instance's gallery. Instance content; no engine endpoint.
struct ShowcaseItem: Codable, Sendable, Hashable {
    var id: String
    var kind: MediaKind
    var app: String
    var title: String
    var prompt: String
    var aspect: ShowcaseItemAspect
    var durationSeconds: Double?
    /// A still of the result, when there is one. Tiles without one show `artwork`.
    var image: String?
    var artwork: MockArtwork

    enum CodingKeys: String, CodingKey {
        case id
        case kind
        case app
        case title
        case prompt
        case aspect
        case durationSeconds = "duration_seconds"
        case image
        case artwork
    }
}

enum StudioMediumAspects: String, Codable, Sendable, Hashable, CaseIterable {
    case v16x9 = "16:9"
    case v9x16 = "9:16"
    case v1x1 = "1:1"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

enum StudioMediumResolutions: String, Codable, Sendable, Hashable, CaseIterable {
    case v720p = "720p"
    case v1080p = "1080p"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct StudioMediumEmpty: Codable, Sendable, Hashable {
    var title: String
    var body: String
}

/// A studio medium as the interface shows it: its modes, its settings and what its empty stage says.
struct StudioMedium: Codable, Sendable, Hashable {
    var kind: MediaKind
    var label: String
    var aspects: [StudioMediumAspects]?
    var resolutions: [StudioMediumResolutions]?
    var promptLimit: Double
    /// How many results one Generate can make at once.
    var maxVariants: Double
    var modes: [StudioMode]
    var empty: StudioMediumEmpty

    enum CodingKeys: String, CodingKey {
        case kind
        case label
        case aspects
        case resolutions
        case promptLimit = "prompt_limit"
        case maxVariants = "max_variants"
        case modes
        case empty
    }
}

/// One way of working in a studio medium, resolved against what the network offers right now.
struct StudioMode: Codable, Sendable, Hashable {
    var value: String
    var label: String
    var placeholder: String
    /// The placeholder for clients that can't add this mode's inputs yet.
    var wordsPlaceholder: String
    /// The capability a draft in this mode runs: one on offer, or the usual one when none is.
    var app: String
    /// Some compute operator offers it right now; without one, Generate stays off.
    var available: Bool
    var durations: [Double]?
    /// The inputs the mode takes beside the words, such as "First frame".
    var inputs: [String]
    /// The mode only makes sense with an input (a source to edit, references to follow).
    var needsInput: Bool

    enum CodingKeys: String, CodingKey {
        case value
        case label
        case placeholder
        case wordsPlaceholder = "words_placeholder"
        case app
        case available
        case durations
        case inputs
        case needsInput = "needs_input"
    }
}

/// Leave to send one file: where to PUT its bytes, and until when.
struct UploadTicket: Codable, Sendable, Hashable {
    var id: String
    /// Where to PUT the file, on this instance, with the same sign-in. The library item comes back.
    var path: String
    var maxBytes: Double
    var expiresAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case path
        case maxBytes = "max_bytes"
        case expiresAt = "expires_at"
    }
}

/// What a user has spent: totals by capability, and their recent jobs.
struct Usage: Codable, Sendable, Hashable {
    var summary: UsageSummary
    var entries: [UsageEntry]
}

struct UsageSummaryByApp: Codable, Sendable, Hashable {
    var app: String
    var credits: Double
    var jobs: Double
}

struct UsageSummary: Codable, Sendable, Hashable {
    var credits: Double
    var wholesale: Money
    var jobs: Double
    var byApp: [UsageSummaryByApp]

    enum CodingKeys: String, CodingKey {
        case credits
        case wholesale
        case jobs
        case byApp = "by_app"
    }
}

enum UsageEntryStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case delivered = "delivered"
    case failedAfterPayment = "failed_after_payment"
    case pending = "pending"
    /// A value this build doesn't know, from a newer instance.
    case unknown = "\u{0}unknown"

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct UsageEntry: Codable, Sendable, Hashable {
    var id: String
    /// The account that was charged: a person, or a workspace.
    var userId: String
    /// The person who ran it. On a personal account that is the account's own id; null when an API key ran it.
    var memberId: String?
    /// The API key that ran it, or null when a person did.
    var keyId: String?
    var app: String
    /// What the network charged.
    var wholesale: Money
    /// What the user was charged, in credits.
    var credits: Double
    var status: UsageEntryStatus
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case memberId = "member_id"
        case keyId = "key_id"
        case app
        case wholesale
        case credits
        case status
        case createdAt = "created_at"
    }
}
