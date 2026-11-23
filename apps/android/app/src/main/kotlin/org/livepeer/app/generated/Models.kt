// Generated from docs/mobile/openapi.json by packages/mobile-codegen.
// Do not edit: change apps/web/lib/public-api/operations.ts or the API client's types and run `pnpm mobile:generate`.

package org.livepeer.app.generated

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** A language model the agent can run on: one app serving it, with what the menu needs to show. */
@Serializable
data class AgentModel(
    @SerialName("app") val app: String,
    /** The model's id, e.g. `qwen3.8-27b`. */
    @SerialName("model") val model: String,
    @SerialName("context_tokens") val contextTokens: Double? = null,
    /** No runner is free right now, so a job would queue. */
    @SerialName("busy") val busy: Boolean,
)

/** One row of the agent's model menu: a language model, however many apps serve it. Named by the same rules as the web's menu, so every client lists models the same way. */
@Serializable
data class AgentModelEntry(
    /** The app to send as `agent_model`: the copy with a runner free and the most context. */
    @SerialName("app") val app: String,
    /** Other apps serving the same model. */
    @SerialName("also") val also: List<String>,
    /** The model's readable name, "Qwen3.8 27B". */
    @SerialName("name") val name: String,
    /** What sets it apart, "128K context". */
    @SerialName("description") val description: String,
    /** No runner is free right now, so a job would queue. */
    @SerialName("busy") val busy: Boolean,
)

/** How a discovered app reads in the interface, so every client names it the same way. */
@Serializable
data class CapabilityLabel(
    @SerialName("app") val app: String,
    /** What it is: "Text to video", or a language model's name. */
    @SerialName("name") val name: String,
    /** How it reads where it did a piece of work, with its model when known: "Text to image · FLUX.2 klein 4B". */
    @SerialName("work") val work: String,
)

@Serializable
data class CapabilityRun(
    @SerialName("app") val app: String,
    @SerialName("request") val request: JsonElement,
    @SerialName("response") val response: JsonElement,
    @SerialName("status") val status: Double,
    @SerialName("elapsed_ms") val elapsedMs: Double,
    @SerialName("credits_charged") val creditsCharged: Double,
)

@Serializable(with = CharacterVisibility.Serializer::class)
enum class CharacterVisibility(val value: String) {
    Private("private"),
    Public("public"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<CharacterVisibility> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("CharacterVisibility", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): CharacterVisibility = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: CharacterVisibility) = encoder.encodeString(value.value)
    }
}

@Serializable
data class Character(
    @SerialName("slug") val slug: String,
    @SerialName("name") val name: String,
    @SerialName("tagline") val tagline: String,
    @SerialName("description") val description: String,
    /** How the character opens a conversation. */
    @SerialName("greeting") val greeting: String,
    @SerialName("author") val author: String,
    @SerialName("visibility") val visibility: CharacterVisibility,
    @SerialName("mature") val mature: Boolean,
    /** Can take a live voice or video call. */
    @SerialName("calls") val calls: Boolean,
    @SerialName("tags") val tags: List<String>,
    @SerialName("rating") val rating: Double,
    @SerialName("chats") val chats: Double,
    @SerialName("mine") val mine: Boolean,
    /** A portrait, when there is one. Without one, `artwork` stands in with the name's initial. */
    @SerialName("image") val image: String? = null,
    @SerialName("artwork") val artwork: MockArtwork,
)

/** Stand-in artwork for mocked media, until real outputs exist. */
@Serializable
data class MockArtwork(
    @SerialName("hues") val hues: List<Double>,
    @SerialName("seed") val seed: Double,
)

/** A character someone blocked: it, and everything else by its author, is hidden from them. */
@Serializable
data class CharacterBlock(
    @SerialName("character_slug") val characterSlug: String,
    @SerialName("author") val author: String,
)

/** Open until the operator acts: dismissed leaves the character up; hidden takes it off the instance. */
@Serializable(with = CharacterReportState.Serializer::class)
enum class CharacterReportState(val value: String) {
    Open("open"),
    Dismissed("dismissed"),
    Hidden("hidden"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<CharacterReportState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("CharacterReportState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): CharacterReportState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: CharacterReportState) = encoder.encodeString(value.value)
    }
}

/** A report of a public character, as the operator reviews it. Who reported it is kept, never shown. */
@Serializable
data class CharacterReport(
    @SerialName("id") val id: String,
    @SerialName("character_slug") val characterSlug: String,
    @SerialName("character_name") val characterName: String,
    @SerialName("author") val author: String,
    @SerialName("reason") val reason: ReportReason,
    /** What the person added in their own words. */
    @SerialName("note") val note: String? = null,
    @SerialName("created_at") val createdAt: String,
    /** Open until the operator acts: dismissed leaves the character up; hidden takes it off the instance. */
    @SerialName("state") val state: CharacterReportState,
)

/** Why someone reported a character. */
@Serializable(with = ReportReason.Serializer::class)
enum class ReportReason(val value: String) {
    Sexual("sexual"),
    Hateful("hateful"),
    Violent("violent"),
    Impersonation("impersonation"),
    Spam("spam"),
    Other("other"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<ReportReason> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("ReportReason", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): ReportReason = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: ReportReason) = encoder.encodeString(value.value)
    }
}

@Serializable(with = ComputeOperatorStatus.Serializer::class)
enum class ComputeOperatorStatus(val value: String) {
    Allowed("allowed"),
    Blocked("blocked"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<ComputeOperatorStatus> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("ComputeOperatorStatus", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): ComputeOperatorStatus = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: ComputeOperatorStatus) = encoder.encodeString(value.value)
    }
}

/** An operator's view of one compute operator, derived from the jobs it served. */
@Serializable
data class ComputeOperator(
    @SerialName("orchestrator_url") val orchestratorUrl: String,
    @SerialName("runners") val runners: Double,
    @SerialName("apps") val apps: List<String>,
    @SerialName("jobs") val jobs: Double,
    @SerialName("failures") val failures: Double,
    @SerialName("median_response_ms") val medianResponseMs: Double? = null,
    @SerialName("status") val status: ComputeOperatorStatus,
)

@Serializable
data class Conversation(
    @SerialName("id") val id: String,
    @SerialName("title") val title: String,
    @SerialName("updated_at") val updatedAt: String,
    @SerialName("messages") val messages: List<Message>,
)

@Serializable(with = Message.Serializer::class)
sealed interface Message {
    data class User(val value: UserMessage) : Message
    data class Agent(val value: AgentMessage) : Message

    object Serializer : KSerializer<Message> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("Message")

        override fun deserialize(decoder: Decoder): Message {
            val input = decoder as? JsonDecoder ?: throw SerializationException("Message is read from JSON only")
            val element = input.decodeJsonElement()
            return when (val kind = element.jsonObject["role"]?.jsonPrimitive?.content) {
                "user" -> User(input.json.decodeFromJsonElement(UserMessage.serializer(), element))
                "agent" -> Agent(input.json.decodeFromJsonElement(AgentMessage.serializer(), element))
                else -> throw SerializationException("Unknown Message role: $kind")
            }
        }

        override fun serialize(encoder: Encoder, value: Message) = when (value) {
            is User -> encoder.encodeSerializableValue(UserMessage.serializer(), value.value)
            is Agent -> encoder.encodeSerializableValue(AgentMessage.serializer(), value.value)
        }
    }
}

@Serializable
data class UserMessage(
    @SerialName("id") val id: String,
    @SerialName("role") val role: String,
    @SerialName("text") val text: String,
    /** The character the message asked to put on screen, if any. */
    @SerialName("cast") val cast: CharacterCast? = null,
    /** The language model the user picked to run the agent; `null` was Auto. */
    @SerialName("agent_model") val agentModel: String? = null,
    @SerialName("created_at") val createdAt: String,
)

/** Who a request puts on screen: just enough of a character to show and to start a shot from. */
@Serializable
data class CharacterCast(
    @SerialName("slug") val slug: String,
    @SerialName("name") val name: String,
    /** A portrait, when there is one. Without one, `artwork` stands in with the name's initial. */
    @SerialName("image") val image: String? = null,
)

@Serializable(with = AgentMessageState.Serializer::class)
enum class AgentMessageState(val value: String) {
    Working("working"),
    Done("done"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<AgentMessageState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("AgentMessageState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): AgentMessageState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: AgentMessageState) = encoder.encodeString(value.value)
    }
}

@Serializable
data class AgentMessage(
    @SerialName("id") val id: String,
    @SerialName("role") val role: String,
    @SerialName("state") val state: AgentMessageState,
    @SerialName("steps") val steps: List<AgentStep>,
    /** The reply, once the agent has finished. */
    @SerialName("text") val text: String? = null,
    /** Generations produced in this turn; each can be opened in the studio. */
    @SerialName("generation_ids") val generationIds: List<String>,
    /** Set when the turn analysed a video. */
    @SerialName("analysis") val analysis: VideoAnalysis? = null,
    @SerialName("elapsed_ms") val elapsedMs: Double,
    @SerialName("created_at") val createdAt: String,
)

@Serializable(with = AgentStepKind.Serializer::class)
enum class AgentStepKind(val value: String) {
    Plan("plan"),
    Tool("tool"),
    Review("review"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<AgentStepKind> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("AgentStepKind", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): AgentStepKind = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: AgentStepKind) = encoder.encodeString(value.value)
    }
}

/** One thing the agent did: a decision, a tool call against a capability, or a review of its own output. */
@Serializable
data class AgentStep(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: AgentStepKind,
    @SerialName("title") val title: String,
    @SerialName("detail") val detail: String,
    /** The capability called, for tool and review steps. */
    @SerialName("app") val app: String? = null,
    @SerialName("state") val state: AgentStepState,
)

@Serializable(with = AgentStepState.Serializer::class)
enum class AgentStepState(val value: String) {
    Pending("pending"),
    Running("running"),
    Done("done"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<AgentStepState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("AgentStepState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): AgentStepState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: AgentStepState) = encoder.encodeString(value.value)
    }
}

@Serializable
data class VideoAnalysis(
    @SerialName("summary") val summary: String,
    @SerialName("moments") val moments: List<VideoMoment>,
    @SerialName("tags") val tags: List<String>,
)

/** A moment an understanding capability found in a video. */
@Serializable
data class VideoMoment(
    @SerialName("at_seconds") val atSeconds: Double,
    @SerialName("label") val label: String,
)

@Serializable
data class ConversationSummary(
    @SerialName("id") val id: String,
    @SerialName("title") val title: String,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
data class CostSummaryByClass(
    @SerialName("delivered") val delivered: Fees,
    @SerialName("failed_after_payment") val failedAfterPayment: Fees,
    @SerialName("uncertain") val uncertain: Fees,
    @SerialName("pending") val pending: Fees,
)

@Serializable
data class CostSummaryByApp(
    @SerialName("delivered") val delivered: Fees? = null,
    @SerialName("failed_after_payment") val failedAfterPayment: Fees? = null,
    @SerialName("uncertain") val uncertain: Fees? = null,
    @SerialName("pending") val pending: Fees? = null,
)

/** `GET /v1/costs/summary`. */
@Serializable
data class CostSummary(
    @SerialName("start") val start: String,
    @SerialName("end") val end: String,
    @SerialName("by_class") val byClass: CostSummaryByClass,
    @SerialName("jobs_with_cost") val jobsWithCost: Double,
    @SerialName("jobs_pending") val jobsPending: Double,
    @SerialName("by_app") val byApp: Map<String, CostSummaryByApp>,
)

@Serializable
data class Fees(
    @SerialName("fee_eth") val feeEth: String,
    @SerialName("fee_usd") val feeUsd: String? = null,
    @SerialName("row_count") val rowCount: Double,
)

/** A user's balance in credits: their allocation's available amount after the instance's markup rule. */
@Serializable
data class CreditBalance(
    @SerialName("credits") val credits: Double,
    @SerialName("allowance") val allowance: BudgetSummary,
)

/** A user's budget in the provider's currency: what was granted, spent and is left. */
@Serializable
data class BudgetSummary(
    @SerialName("granted") val granted: String,
    @SerialName("spent") val spent: String,
    @SerialName("available") val available: String,
    @SerialName("currency") val currency: String,
)

/** The answer to a delete. */
@Serializable
data class Deleted(
    @SerialName("deleted") val deleted: Boolean,
)

@Serializable(with = DeviceSessionPlatform.Serializer::class)
enum class DeviceSessionPlatform(val value: String) {
    Ios("ios"),
    Android("android"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<DeviceSessionPlatform> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("DeviceSessionPlatform", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): DeviceSessionPlatform = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: DeviceSessionPlatform) = encoder.encodeString(value.value)
    }
}

/** A phone or tablet signed in to the instance with its own revocable session. */
@Serializable
data class DeviceSession(
    @SerialName("id") val id: String,
    /** The device's own name, as it reported it ("Adam's iPhone"). */
    @SerialName("name") val name: String,
    @SerialName("platform") val platform: DeviceSessionPlatform,
    @SerialName("created_at") val createdAt: String,
    @SerialName("last_used_at") val lastUsedAt: String,
    /** The session making this request. */
    @SerialName("current") val current: Boolean,
)

/** A new device session. The token is shown once; the instance keeps only a keyed hash of it. */
@Serializable
data class DeviceToken(
    @SerialName("token") val token: String,
    @SerialName("device") val device: DeviceSession,
)

/** The answer to a change that has nothing else to say. */
@Serializable
data class Done(
    @SerialName("ok") val ok: Boolean,
)

/** `GET /readyz`. */
@Serializable
data class EngineHealth(
    @SerialName("ready") val ready: Boolean,
    @SerialName("discovery_fresh") val discoveryFresh: Boolean,
    @SerialName("discovery_observed_at") val discoveryObservedAt: String? = null,
    @SerialName("discovery_error") val discoveryError: String? = null,
    @SerialName("cost_sync_at") val costSyncAt: String? = null,
    @SerialName("cost_sync_error") val costSyncError: String? = null,
    @SerialName("running_jobs") val runningJobs: Double,
    @SerialName("allocation_mode") val allocationMode: String,
    @SerialName("version") val version: String,
)

@Serializable(with = EngineJobMode.Serializer::class)
enum class EngineJobMode(val value: String) {
    Immediate("immediate"),
    Async("async"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<EngineJobMode> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("EngineJobMode", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): EngineJobMode = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: EngineJobMode) = encoder.encodeString(value.value)
    }
}

/** `GET /v1/jobs` item. */
@Serializable
data class EngineJob(
    @SerialName("id") val id: String,
    @SerialName("actor_id") val actorId: String,
    @SerialName("application_id") val applicationId: String,
    @SerialName("operation_ref") val operationRef: String? = null,
    @SerialName("mode") val mode: EngineJobMode,
    @SerialName("app") val app: String,
    @SerialName("capability") val capability: String? = null,
    @SerialName("model") val model: String? = null,
    @SerialName("state") val state: JobState,
    @SerialName("attempts") val attempts: List<JobAttempt>,
    @SerialName("failure") val failure: JobFailure? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("completed_at") val completedAt: String? = null,
)

/** Operator-side types. The engine shapes are as documented in docs/research/engine.md §4. */
@Serializable(with = JobState.Serializer::class)
enum class JobState(val value: String) {
    Queued("queued"),
    Running("running"),
    Succeeded("succeeded"),
    Failed("failed"),
    Uncertain("uncertain"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<JobState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("JobState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): JobState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: JobState) = encoder.encodeString(value.value)
    }
}

@Serializable
data class JobAttemptTimings(
    @SerialName("challenge_ms") val challengeMs: Double? = null,
    @SerialName("signing_ms") val signingMs: Double? = null,
    @SerialName("response_ms") val responseMs: Double? = null,
)

@Serializable
data class JobAttempt(
    @SerialName("job_id") val jobId: String,
    @SerialName("number") val number: Double,
    @SerialName("runner_url") val runnerUrl: String? = null,
    @SerialName("orchestrator_url") val orchestratorUrl: String? = null,
    @SerialName("allocation_id") val allocationId: String? = null,
    @SerialName("payment_sent") val paymentSent: Boolean,
    @SerialName("outcome") val outcome: String,
    @SerialName("status_code") val statusCode: Double? = null,
    @SerialName("started_at") val startedAt: String,
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("timings") val timings: JobAttemptTimings? = null,
)

@Serializable
data class JobFailure(
    @SerialName("kind") val kind: String,
    @SerialName("message") val message: String,
    @SerialName("status_code") val statusCode: Double? = null,
    @SerialName("body") val body: String? = null,
    @SerialName("payment_sent") val paymentSent: Boolean,
    @SerialName("reason") val reason: String? = null,
)

/** An async generation job. Mocked: the engine's async jobs return 501 today. */
@Serializable
data class Generation(
    @SerialName("id") val id: String,
    @SerialName("state") val state: GenerationState,
    @SerialName("progress") val progress: Double,
    @SerialName("request") val request: GenerationRequest,
    @SerialName("credits_charged") val creditsCharged: Double,
    @SerialName("created_at") val createdAt: String,
    @SerialName("artwork") val artwork: MockArtwork,
)

@Serializable(with = GenerationState.Serializer::class)
enum class GenerationState(val value: String) {
    Queued("queued"),
    Running("running"),
    Succeeded("succeeded"),
    Failed("failed"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<GenerationState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("GenerationState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): GenerationState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: GenerationState) = encoder.encodeString(value.value)
    }
}

@Serializable(with = GenerationRequestAspect.Serializer::class)
enum class GenerationRequestAspect(val value: String) {
    V16x9("16:9"),
    V9x16("9:16"),
    V1x1("1:1"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<GenerationRequestAspect> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("GenerationRequestAspect", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): GenerationRequestAspect = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: GenerationRequestAspect) = encoder.encodeString(value.value)
    }
}

/** Video only. */
@Serializable(with = GenerationRequestResolution.Serializer::class)
enum class GenerationRequestResolution(val value: String) {
    V720p("720p"),
    V1080p("1080p"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<GenerationRequestResolution> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("GenerationRequestResolution", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): GenerationRequestResolution = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: GenerationRequestResolution) = encoder.encodeString(value.value)
    }
}

@Serializable
data class GenerationRequest(
    @SerialName("kind") val kind: MediaKind,
    @SerialName("app") val app: String,
    @SerialName("prompt") val prompt: String,
    @SerialName("aspect") val aspect: GenerationRequestAspect,
    /** Video and audio only. */
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    /** Video only. */
    @SerialName("resolution") val resolution: GenerationRequestResolution? = null,
    @SerialName("negative_prompt") val negativePrompt: String? = null,
    /** Image-to-video only: the image the shot starts from, such as a character's portrait. */
    @SerialName("first_frame") val firstFrame: String? = null,
)

@Serializable(with = MediaKind.Serializer::class)
enum class MediaKind(val value: String) {
    Video("video"),
    Image("image"),
    Audio("audio"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<MediaKind> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("MediaKind", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): MediaKind = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: MediaKind) = encoder.encodeString(value.value)
    }
}

@Serializable
data class Grant(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("funded") val funded: Money,
    @SerialName("allocated") val allocated: Money,
    @SerialName("spent") val spent: Money,
    @SerialName("created_at") val createdAt: String,
)

/** The payment and identity provider behind the engine, in the engine's terms: grants fund allocations, an allocation is a user's budget, usage is what was spent, a plan is the provider's plan. Nothing here is a second ledger: every amount is read from the provider. */
@Serializable
data class Money(
    /** Decimal string, as the engine and providers report amounts. */
    @SerialName("amount") val amount: String,
    @SerialName("currency") val currency: String,
)

@Serializable
data class InstanceDescriptionLogo(
    /** A square mark, or null to set the name's first letter in type. */
    @SerialName("symbol") val symbol: String? = null,
    /** The full logo, or null to set the name in type. */
    @SerialName("wordmark") val wordmark: String? = null,
    /** Draw the marks in the text colour, using only their shape. */
    @SerialName("tint") val tint: Boolean,
)

/** Overrides for colour tokens, per theme, keyed by token name ("primary"). Tokens not listed keep their default. */
@Serializable
data class InstanceDescriptionTheme(
    @SerialName("dark") val dark: Map<String, String>,
    @SerialName("light") val light: Map<String, String>,
)

@Serializable
data class InstanceDescriptionSurfaces(
    @SerialName("app") val app: Boolean,
    @SerialName("console") val console: Boolean,
    @SerialName("api") val api: Boolean,
    @SerialName("mcp") val mcp: Boolean,
    @SerialName("mobile") val mobile: Boolean,
    @SerialName("mobile_console") val mobileConsole: Boolean,
)

@Serializable
data class InstanceDescriptionMobileIos(
    @SerialName("bundle_id") val bundleId: String,
    @SerialName("minimum_version") val minimumVersion: String? = null,
)

@Serializable
data class InstanceDescriptionMobileAndroid(
    @SerialName("application_id") val applicationId: String,
    @SerialName("minimum_version") val minimumVersion: String? = null,
    /** What the Android app starts Firebase Cloud Messaging with, to be given an address for alerts. None of it is secret: it ships in every Android app. Null when the instance has none. */
    @SerialName("firebase") val firebase: InstanceFirebase? = null,
)

/** The native apps built for this instance. Sign-in returns only to these; an app not listed can't sign in. */
@Serializable
data class InstanceDescriptionMobile(
    @SerialName("ios") val ios: InstanceDescriptionMobileIos? = null,
    @SerialName("android") val android: InstanceDescriptionMobileAndroid? = null,
)

@Serializable(with = InstanceDescriptionSignInSignUp.Serializer::class)
enum class InstanceDescriptionSignInSignUp(val value: String) {
    Open("open"),
    Invite("invite"),
    Closed("closed"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<InstanceDescriptionSignInSignUp> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("InstanceDescriptionSignInSignUp", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): InstanceDescriptionSignInSignUp = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: InstanceDescriptionSignInSignUp) = encoder.encodeString(value.value)
    }
}

@Serializable
data class InstanceDescriptionSignIn(
    @SerialName("methods") val methods: List<SignInMethodName>,
    @SerialName("sign_up") val signUp: InstanceDescriptionSignInSignUp,
)

@Serializable
data class InstanceDescriptionContent(
    @SerialName("characters") val characters: Boolean,
    @SerialName("adult_content") val adultContent: Boolean,
)

@Serializable
data class InstanceDescriptionHome(
    @SerialName("background_image") val backgroundImage: String? = null,
    @SerialName("background_poster") val backgroundPoster: String? = null,
    @SerialName("background_video") val backgroundVideo: String? = null,
    /** Draw a live aurora over the background image. */
    @SerialName("aurora") val aurora: Boolean,
)

/** What a client needs to know about an instance before anyone signs in: how it looks, what it serves and how to sign in. Read from the instance config, so there is no engine call behind it. URLs are absolute and theme colours are sRGB hex, so a client that can't read CSS can use them as they are. */
@Serializable
data class InstanceDescription(
    @SerialName("api_version") val apiVersion: String,
    @SerialName("name") val name: String,
    @SerialName("logo") val logo: InstanceDescriptionLogo,
    /** Overrides for colour tokens, per theme, keyed by token name ("primary"). Tokens not listed keep their default. */
    @SerialName("theme") val theme: InstanceDescriptionTheme,
    @SerialName("surfaces") val surfaces: InstanceDescriptionSurfaces,
    /** The native apps built for this instance. Sign-in returns only to these; an app not listed can't sign in. */
    @SerialName("mobile") val mobile: InstanceDescriptionMobile,
    @SerialName("sign_in") val signIn: InstanceDescriptionSignIn,
    @SerialName("content") val content: InstanceDescriptionContent,
    @SerialName("home") val home: InstanceDescriptionHome,
)

/** The public values of a Firebase project, as its settings page gives them for one Android app. */
@Serializable
data class InstanceFirebase(
    @SerialName("project_id") val projectId: String,
    @SerialName("app_id") val appId: String,
    @SerialName("api_key") val apiKey: String,
    @SerialName("sender_id") val senderId: String,
)

/** A way to sign in that an instance can offer. */
@Serializable(with = SignInMethodName.Serializer::class)
enum class SignInMethodName(val value: String) {
    Email("email"),
    Passkey("passkey"),
    Google("google"),
    Apple("apple"),
    Discord("discord"),
    Coinbase("coinbase"),
    Wallet("wallet"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<SignInMethodName> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("SignInMethodName", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): SignInMethodName = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: SignInMethodName) = encoder.encodeString(value.value)
    }
}

@Serializable(with = KnownActorAllocationStatus.Serializer::class)
enum class KnownActorAllocationStatus(val value: String) {
    Active("active"),
    Paused("paused"),
    Exhausted("exhausted"),
    Revoked("revoked"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<KnownActorAllocationStatus> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("KnownActorAllocationStatus", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): KnownActorAllocationStatus = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: KnownActorAllocationStatus) = encoder.encodeString(value.value)
    }
}

@Serializable
data class KnownActorAllocation(
    @SerialName("grant_id") val grantId: String,
    @SerialName("allocation_id") val allocationId: String,
    @SerialName("currency") val currency: String,
    @SerialName("status") val status: KnownActorAllocationStatus,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    @SerialName("label") val label: String,
)

/** `GET /v1/admin/actors` item. */
@Serializable
data class KnownActor(
    @SerialName("application_id") val applicationId: String,
    @SerialName("actor_id") val actorId: String,
    @SerialName("label") val label: String,
    @SerialName("name") val name: String? = null,
    @SerialName("allocation") val allocation: KnownActorAllocation? = null,
    @SerialName("first_seen_at") val firstSeenAt: String? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("provisioned") val provisioned: Boolean,
)

@Serializable(with = LiveSessionState.Serializer::class)
enum class LiveSessionState(val value: String) {
    Live("live"),
    Ended("ended"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<LiveSessionState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LiveSessionState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): LiveSessionState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: LiveSessionState) = encoder.encodeString(value.value)
    }
}

@Serializable
data class LiveSession(
    @SerialName("id") val id: String,
    @SerialName("app") val app: String,
    @SerialName("state") val state: LiveSessionState,
    @SerialName("prompt") val prompt: String,
    @SerialName("destination_ids") val destinationIds: List<String>,
    @SerialName("recording") val recording: Boolean,
    @SerialName("started_at") val startedAt: String,
    /** Set when the session ended and was recorded. */
    @SerialName("recording_media_id") val recordingMediaId: String? = null,
)

/** Whether the person runs this instance. An app offers the console from this; the server still decides every request. */
@Serializable(with = MeRole.Serializer::class)
enum class MeRole(val value: String) {
    User("user"),
    Operator("operator"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<MeRole> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("MeRole", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): MeRole = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: MeRole) = encoder.encodeString(value.value)
    }
}

/** The signed-in user, as the account menu shows them. */
@Serializable
data class Me(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("email") val email: String? = null,
    /** Whether the person runs this instance. An app offers the console from this; the server still decides every request. */
    @SerialName("role") val role: MeRole,
    @SerialName("balance") val balance: CreditBalance,
)

@Serializable(with = MediaItemSource.Serializer::class)
enum class MediaItemSource(val value: String) {
    Generation("generation"),
    Upload("upload"),
    Recording("recording"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<MediaItemSource> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("MediaItemSource", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): MediaItemSource = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: MediaItemSource) = encoder.encodeString(value.value)
    }
}

@Serializable(with = MediaItemAspect.Serializer::class)
enum class MediaItemAspect(val value: String) {
    V16x9("16:9"),
    V9x16("9:16"),
    V1x1("1:1"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<MediaItemAspect> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("MediaItemAspect", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): MediaItemAspect = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: MediaItemAspect) = encoder.encodeString(value.value)
    }
}

/** Something in the user's library: an upload or a generation, with what the product understood about it. */
@Serializable
data class MediaItem(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: MediaKind,
    @SerialName("source") val source: MediaItemSource,
    @SerialName("title") val title: String,
    /** Automatic description, from a video understanding capability. */
    @SerialName("description") val description: String,
    @SerialName("tags") val tags: List<String>,
    @SerialName("app") val app: String? = null,
    @SerialName("prompt") val prompt: String? = null,
    @SerialName("aspect") val aspect: MediaItemAspect,
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    @SerialName("created_at") val createdAt: String,
    /** A still of the media, when there is one. Tiles without one show `artwork`. */
    @SerialName("image") val image: String? = null,
    @SerialName("artwork") val artwork: MockArtwork,
)

/** A capability on the network as the operator sees it: what it's called, whether this instance offers it, and who can run it now. */
@Serializable
data class OfferedCapability(
    @SerialName("app") val app: String,
    /** What it is, as the interface names it: "Text to video". */
    @SerialName("name") val name: String,
    /** Whether this instance offers it to its users. */
    @SerialName("enabled") val enabled: Boolean,
    /** Multiplier on wholesale cost; null uses the instance default. */
    @SerialName("markup") val markup: Double? = null,
    /** Compute operators' runners that advertise it, and how many are ready now. */
    @SerialName("runner_count") val runnerCount: Double,
    @SerialName("ready_count") val readyCount: Double,
    /** True when discovery hasn't seen it lately. */
    @SerialName("stale") val stale: Boolean,
)

/** One row of `GET /v1/offerings`. Identity is (app, currency, unit). */
@Serializable
data class Offering(
    @SerialName("app") val app: String,
    @SerialName("modes") val modes: List<InteractionMode>,
    @SerialName("rate_low") val rateLow: RatePoint? = null,
    @SerialName("rate_high") val rateHigh: RatePoint? = null,
    @SerialName("rate_status") val rateStatus: String,
    @SerialName("stale") val stale: Boolean,
    @SerialName("runner_count") val runnerCount: Double,
    @SerialName("ready_count") val readyCount: Double,
    @SerialName("observed_at") val observedAt: String,
)

/** Types shaped on the engine's real responses (livepeer-builder `GET /v1/offerings`, `GET /v1/allowance`). See docs/research/engine.md. Amounts are decimal strings. */
@Serializable(with = InteractionMode.Serializer::class)
enum class InteractionMode(val value: String) {
    SingleShot("single-shot"),
    Persistent("persistent"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<InteractionMode> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("InteractionMode", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): InteractionMode = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: InteractionMode) = encoder.encodeString(value.value)
    }
}

@Serializable
data class RatePoint(
    @SerialName("amount") val amount: String,
    @SerialName("currency") val currency: String,
    @SerialName("unit") val unit: String,
    @SerialName("price_usd") val priceUsd: String? = null,
    @SerialName("source") val source: String,
    @SerialName("observed_at") val observedAt: String,
    @SerialName("observed_by") val observedBy: String,
)

/** Off, on, or on but Apple or Google has said the phone can no longer be reached. */
@Serializable(with = OperatorAlertsState.Serializer::class)
enum class OperatorAlertsState(val value: String) {
    Off("off"),
    On("on"),
    NotReaching("not_reaching"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<OperatorAlertsState> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("OperatorAlertsState", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): OperatorAlertsState = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: OperatorAlertsState) = encoder.encodeString(value.value)
    }
}

/** Alerts on one operator's phone: whether the instance can send any, which are on, and until when. */
@Serializable
data class OperatorAlerts(
    /** Whether this instance can send to this phone's platform at all. */
    @SerialName("offered") val offered: Boolean,
    /** Off, on, or on but Apple or Google has said the phone can no longer be reached. */
    @SerialName("state") val state: OperatorAlertsState,
    @SerialName("kinds") val kinds: List<OperatorAlertChoice>,
    /** When alerts end unless the phone signs in again. Null while they are off. */
    @SerialName("until") val until: String? = null,
    @SerialName("last_alert_at") val lastAlertAt: String? = null,
)

/** One choice on a phone's Alerts page, with the words for its switch. */
@Serializable
data class OperatorAlertChoice(
    @SerialName("kind") val kind: OperatorAlertKind,
    /** "The engine stops being ready". */
    @SerialName("label") val label: String,
    @SerialName("on") val on: Boolean,
)

/** Something an operator's phone can choose to be told about. The names are the ones Status uses. */
@Serializable(with = OperatorAlertKind.Serializer::class)
enum class OperatorAlertKind(val value: String) {
    EngineNotReady("engine_not_ready"),
    JobsFailing("jobs_failing"),
    ReportsWaiting("reports_waiting"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<OperatorAlertKind> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("OperatorAlertKind", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): OperatorAlertKind = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: OperatorAlertKind) = encoder.encodeString(value.value)
    }
}

/** A value for the phone's key to sign, once, before it expires. */
@Serializable
data class OperatorChallenge(
    @SerialName("nonce") val nonce: String,
    @SerialName("expires_at") val expiresAt: String,
)

/** A new operator device session. The token is shown once; the instance keeps only a keyed hash of it. */
@Serializable
data class OperatorDeviceToken(
    @SerialName("token") val token: String,
    @SerialName("device") val device: OperatorDeviceSession,
)

@Serializable(with = OperatorDeviceSessionPlatform.Serializer::class)
enum class OperatorDeviceSessionPlatform(val value: String) {
    Ios("ios"),
    Android("android"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<OperatorDeviceSessionPlatform> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("OperatorDeviceSessionPlatform", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): OperatorDeviceSessionPlatform = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: OperatorDeviceSessionPlatform) = encoder.encodeString(value.value)
    }
}

/** An operator's phone enrolled for the console: its own session, bound to a key in the phone's secure hardware. */
@Serializable
data class OperatorDeviceSession(
    @SerialName("id") val id: String,
    /** Whose phone it is. */
    @SerialName("user_id") val userId: String,
    @SerialName("user_name") val userName: String,
    /** The phone's own name, as it reported it. */
    @SerialName("name") val name: String,
    @SerialName("platform") val platform: OperatorDeviceSessionPlatform,
    @SerialName("created_at") val createdAt: String,
    @SerialName("last_used_at") val lastUsedAt: String,
    /** When the phone last proved a face or fingerprint to open the console. */
    @SerialName("last_unlocked_at") val lastUnlockedAt: String? = null,
    /** When the session ends whatever its use, and the operator signs in again. */
    @SerialName("expires_at") val expiresAt: String,
)

@Serializable
data class OperatorStatusToday(
    @SerialName("active_users") val activeUsers: Double,
    @SerialName("jobs") val jobs: Double,
    @SerialName("failed") val failed: Double,
    @SerialName("revenue_usd") val revenueUsd: Double,
    @SerialName("wholesale_usd") val wholesaleUsd: Double,
    @SerialName("margin_usd") val marginUsd: Double,
    @SerialName("revenue_estimated") val revenueEstimated: Boolean,
)

@Serializable
data class OperatorStatusService(
    @SerialName("engine_ready") val engineReady: Boolean,
    @SerialName("discovery_fresh") val discoveryFresh: Boolean,
    @SerialName("discovery_observed_at") val discoveryObservedAt: String? = null,
    @SerialName("cost_sync_at") val costSyncAt: String? = null,
    @SerialName("cost_sync_error") val costSyncError: String? = null,
    @SerialName("running_jobs") val runningJobs: Double,
    @SerialName("engine_version") val engineVersion: String,
)

/** Whether anything is wrong, today's figures and the state of the service, in one answer. */
@Serializable
data class OperatorStatus(
    @SerialName("checked_at") val checkedAt: String,
    /** Empty when everything is running. */
    @SerialName("attention") val attention: List<OperatorAttention>,
    @SerialName("today") val today: OperatorStatusToday,
    @SerialName("service") val service: OperatorStatusService,
)

@Serializable(with = OperatorAttentionKind.Serializer::class)
enum class OperatorAttentionKind(val value: String) {
    EngineNotReady("engine_not_ready"),
    DiscoveryStale("discovery_stale"),
    CostsNotSynced("costs_not_synced"),
    JobsFailing("jobs_failing"),
    ReportsWaiting("reports_waiting"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<OperatorAttentionKind> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("OperatorAttentionKind", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): OperatorAttentionKind = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: OperatorAttentionKind) = encoder.encodeString(value.value)
    }
}

/** Where to deal with it. */
@Serializable(with = OperatorAttentionOpens.Serializer::class)
enum class OperatorAttentionOpens(val value: String) {
    Status("status"),
    Jobs("jobs"),
    Reports("reports"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<OperatorAttentionOpens> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("OperatorAttentionOpens", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): OperatorAttentionOpens = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: OperatorAttentionOpens) = encoder.encodeString(value.value)
    }
}

/** Something that needs the operator, as the Status screen lists it. */
@Serializable
data class OperatorAttention(
    @SerialName("kind") val kind: OperatorAttentionKind,
    /** The line to show: "3 reports are waiting". */
    @SerialName("message") val message: String,
    @SerialName("count") val count: Double? = null,
    /** Where to deal with it. */
    @SerialName("opens") val opens: OperatorAttentionOpens,
)

/** The console is open on this phone until then. */
@Serializable
data class OperatorUnlock(
    @SerialName("unlocked_until") val unlockedUntil: String,
)

@Serializable
data class OverviewStatsSeries(
    @SerialName("day") val day: String,
    @SerialName("revenue_usd") val revenueUsd: Double,
    @SerialName("wholesale_usd") val wholesaleUsd: Double,
)

@Serializable
data class OverviewStats(
    @SerialName("active_users") val activeUsers: Double,
    @SerialName("jobs_today") val jobsToday: Double,
    @SerialName("jobs_failed_today") val jobsFailedToday: Double,
    /** Credits charged, as money at the instance's rate. */
    @SerialName("revenue_usd") val revenueUsd: Double,
    @SerialName("wholesale_usd") val wholesaleUsd: Double,
    @SerialName("margin_usd") val marginUsd: Double,
    @SerialName("pending_usd") val pendingUsd: Double,
    /** True while revenue is worked out from wholesale cost at the default markup, rather than reported by the payment provider. */
    @SerialName("revenue_estimated") val revenueEstimated: Boolean,
    /** Per day, oldest first. */
    @SerialName("series") val series: List<OverviewStatsSeries>,
)

@Serializable(with = PlanInterval.Serializer::class)
enum class PlanInterval(val value: String) {
    Month("month"),
    Year("year"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<PlanInterval> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("PlanInterval", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): PlanInterval = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: PlanInterval) = encoder.encodeString(value.value)
    }
}

@Serializable
data class Plan(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String,
    @SerialName("price") val price: Money,
    @SerialName("interval") val interval: PlanInterval,
    @SerialName("allowance") val allowance: PlanAllowance,
    @SerialName("features") val features: List<String>,
    /** Multiplier on wholesale cost for subscribers; null uses the instance default. */
    @SerialName("markup") val markup: Double? = null,
    @SerialName("active") val active: Boolean,
)

@Serializable(with = PlanAllowancePeriod.Serializer::class)
enum class PlanAllowancePeriod(val value: String) {
    Month("month"),
    Year("year"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<PlanAllowancePeriod> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("PlanAllowancePeriod", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): PlanAllowancePeriod = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: PlanAllowancePeriod) = encoder.encodeString(value.value)
    }
}

@Serializable
data class PlanAllowance(
    /** Credits included each period. */
    @SerialName("credits") val credits: Double,
    @SerialName("period") val period: PlanAllowancePeriod,
    /** Months unused credits carry forward; 0 means they expire. */
    @SerialName("rollover_months") val rolloverMonths: Double,
)

@Serializable
data class PlanAndCreditsTopUp(
    @SerialName("min") val min: Money,
    @SerialName("max") val max: Money,
    @SerialName("credits_per_usd") val creditsPerUsd: Double,
)

@Serializable
data class PlanAndCreditsProvider(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("features") val features: ProviderFeatures,
)

/** The signed-in user's plan, what they could change to, and what the provider supports. */
@Serializable
data class PlanAndCredits(
    @SerialName("plan") val plan: Plan? = null,
    @SerialName("plans") val plans: List<Plan>,
    @SerialName("packs") val packs: List<CreditPack>,
    /** Top-ups of the user's own amount, or null when the provider can't take them or the operator turned them off. */
    @SerialName("top_up") val topUp: PlanAndCreditsTopUp? = null,
    @SerialName("provider") val provider: PlanAndCreditsProvider,
)

/** A one-off top-up the provider sells at a fixed price. Buying one adds to the user's allocation. */
@Serializable
data class CreditPack(
    @SerialName("id") val id: String,
    @SerialName("credits") val credits: Double,
    @SerialName("price") val price: Money,
    /** Shown first and marked to users. At most one pack is. */
    @SerialName("popular") val popular: Boolean,
    /** Offered to users. Packs are withdrawn rather than deleted, so past purchases still name them. */
    @SerialName("active") val active: Boolean,
)

/** What the connected provider can do, so the UI can say so instead of failing. */
@Serializable
data class ProviderFeatures(
    @SerialName("users") val users: Boolean,
    @SerialName("grants") val grants: Boolean,
    @SerialName("plans") val plans: Boolean,
    @SerialName("allowances") val allowances: Boolean,
    @SerialName("credit_packs") val creditPacks: Boolean,
    /** Top-ups of an amount the user chooses. */
    @SerialName("custom_top_up") val customTopUp: Boolean,
    @SerialName("invoices") val invoices: Boolean,
    @SerialName("oidc") val oidc: Boolean,
    /** Shared accounts with members and roles. */
    @SerialName("workspaces") val workspaces: Boolean,
)

@Serializable(with = PreferencesDefaultAspect.Serializer::class)
enum class PreferencesDefaultAspect(val value: String) {
    V16x9("16:9"),
    V9x16("9:16"),
    V1x1("1:1"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<PreferencesDefaultAspect> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("PreferencesDefaultAspect", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): PreferencesDefaultAspect = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: PreferencesDefaultAspect) = encoder.encodeString(value.value)
    }
}

@Serializable
data class Preferences(
    /** Confirmed to be 18 or over. Required before adult content can be switched on. */
    @SerialName("ageConfirmed") val ageConfirmed: Boolean,
    @SerialName("adultContent") val adultContent: Boolean,
    @SerialName("saveChats") val saveChats: Boolean,
    @SerialName("confirmBeforeSpending") val confirmBeforeSpending: Boolean,
    @SerialName("enterSends") val enterSends: Boolean,
    @SerialName("completionNotifications") val completionNotifications: Boolean,
    @SerialName("defaultAspect") val defaultAspect: PreferencesDefaultAspect,
    @SerialName("defaultDuration") val defaultDuration: Double,
)

/** How this instance treats what people make, in plain words. */
@Serializable
data class PrivacyDescription(
    /** Whether the instance keeps prompts and outputs on its servers. */
    @SerialName("retains_chats") val retainsChats: Boolean,
    @SerialName("tiers") val tiers: List<PrivacyTier>,
)

/** Who can see a job, per way of running the instance. The same words on every surface. */
@Serializable
data class PrivacyTier(
    @SerialName("name") val name: String,
    /** Set when the tier isn't plainly available, such as "Planned, not available". */
    @SerialName("status") val status: String? = null,
    @SerialName("summary") val summary: String,
    @SerialName("instance_sees") val instanceSees: String,
    @SerialName("compute_sees") val computeSees: String,
)

@Serializable
data class PromptStarter(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("app") val app: String,
    @SerialName("examples") val examples: List<String>,
)

/** What one result of a draft would cost. */
@Serializable
data class Quote(
    @SerialName("credits") val credits: Double,
)

@Serializable(with = ShowcaseItemAspect.Serializer::class)
enum class ShowcaseItemAspect(val value: String) {
    V16x9("16:9"),
    V9x16("9:16"),
    V1x1("1:1"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<ShowcaseItemAspect> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("ShowcaseItemAspect", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): ShowcaseItemAspect = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: ShowcaseItemAspect) = encoder.encodeString(value.value)
    }
}

/** An example in the instance's gallery. Instance content; no engine endpoint. */
@Serializable
data class ShowcaseItem(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: MediaKind,
    @SerialName("app") val app: String,
    @SerialName("title") val title: String,
    @SerialName("prompt") val prompt: String,
    @SerialName("aspect") val aspect: ShowcaseItemAspect,
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    /** A still of the result, when there is one. Tiles without one show `artwork`. */
    @SerialName("image") val image: String? = null,
    @SerialName("artwork") val artwork: MockArtwork,
)

@Serializable(with = StudioMediumAspects.Serializer::class)
enum class StudioMediumAspects(val value: String) {
    V16x9("16:9"),
    V9x16("9:16"),
    V1x1("1:1"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<StudioMediumAspects> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("StudioMediumAspects", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): StudioMediumAspects = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: StudioMediumAspects) = encoder.encodeString(value.value)
    }
}

@Serializable(with = StudioMediumResolutions.Serializer::class)
enum class StudioMediumResolutions(val value: String) {
    V720p("720p"),
    V1080p("1080p"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<StudioMediumResolutions> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("StudioMediumResolutions", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): StudioMediumResolutions = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: StudioMediumResolutions) = encoder.encodeString(value.value)
    }
}

@Serializable
data class StudioMediumEmpty(
    @SerialName("title") val title: String,
    @SerialName("body") val body: String,
)

/** A studio medium as the interface shows it: its modes, its settings and what its empty stage says. */
@Serializable
data class StudioMedium(
    @SerialName("kind") val kind: MediaKind,
    @SerialName("label") val label: String,
    @SerialName("aspects") val aspects: List<StudioMediumAspects>? = null,
    @SerialName("resolutions") val resolutions: List<StudioMediumResolutions>? = null,
    @SerialName("prompt_limit") val promptLimit: Double,
    /** How many results one Generate can make at once. */
    @SerialName("max_variants") val maxVariants: Double,
    @SerialName("modes") val modes: List<StudioMode>,
    @SerialName("empty") val empty: StudioMediumEmpty,
)

/** One way of working in a studio medium, resolved against what the network offers right now. */
@Serializable
data class StudioMode(
    @SerialName("value") val value: String,
    @SerialName("label") val label: String,
    @SerialName("placeholder") val placeholder: String,
    /** The placeholder for clients that can't add this mode's inputs yet. */
    @SerialName("words_placeholder") val wordsPlaceholder: String,
    /** The capability a draft in this mode runs: one on offer, or the usual one when none is. */
    @SerialName("app") val app: String,
    /** Some compute operator offers it right now; without one, Generate stays off. */
    @SerialName("available") val available: Boolean,
    @SerialName("durations") val durations: List<Double>? = null,
    /** The inputs the mode takes beside the words, such as "First frame". */
    @SerialName("inputs") val inputs: List<String>,
    /** The mode only makes sense with an input (a source to edit, references to follow). */
    @SerialName("needs_input") val needsInput: Boolean,
)

/** Leave to send one file: where to PUT its bytes, and until when. */
@Serializable
data class UploadTicket(
    @SerialName("id") val id: String,
    /** Where to PUT the file, on this instance, with the same sign-in. The library item comes back. */
    @SerialName("path") val path: String,
    @SerialName("max_bytes") val maxBytes: Double,
    @SerialName("expires_at") val expiresAt: String,
)

/** What a user has spent: totals by capability, and their recent jobs. */
@Serializable
data class Usage(
    @SerialName("summary") val summary: UsageSummary,
    @SerialName("entries") val entries: List<UsageEntry>,
)

@Serializable
data class UsageSummaryByApp(
    @SerialName("app") val app: String,
    @SerialName("credits") val credits: Double,
    @SerialName("jobs") val jobs: Double,
)

@Serializable
data class UsageSummary(
    @SerialName("credits") val credits: Double,
    @SerialName("wholesale") val wholesale: Money,
    @SerialName("jobs") val jobs: Double,
    @SerialName("by_app") val byApp: List<UsageSummaryByApp>,
)

@Serializable(with = UsageEntryStatus.Serializer::class)
enum class UsageEntryStatus(val value: String) {
    Delivered("delivered"),
    FailedAfterPayment("failed_after_payment"),
    Pending("pending"),

    /** A value this build doesn't know, from a newer instance. */
    Unknown("");

    object Serializer : KSerializer<UsageEntryStatus> {
        override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("UsageEntryStatus", PrimitiveKind.STRING)
        override fun deserialize(decoder: Decoder): UsageEntryStatus = decoder.decodeString().let { value -> entries.firstOrNull { it.value == value } ?: Unknown }
        override fun serialize(encoder: Encoder, value: UsageEntryStatus) = encoder.encodeString(value.value)
    }
}

@Serializable
data class UsageEntry(
    @SerialName("id") val id: String,
    /** The account that was charged: a person, or a workspace. */
    @SerialName("user_id") val userId: String,
    /** The person who ran it. On a personal account that is the account's own id; null when an API key ran it. */
    @SerialName("member_id") val memberId: String? = null,
    /** The API key that ran it, or null when a person did. */
    @SerialName("key_id") val keyId: String? = null,
    @SerialName("app") val app: String,
    /** What the network charged. */
    @SerialName("wholesale") val wholesale: Money,
    /** What the user was charged, in credits. */
    @SerialName("credits") val credits: Double,
    @SerialName("status") val status: UsageEntryStatus,
    @SerialName("created_at") val createdAt: String,
)
