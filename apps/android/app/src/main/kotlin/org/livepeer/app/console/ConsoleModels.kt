package org.livepeer.app.console

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import org.livepeer.app.api.ApiError
import org.livepeer.app.api.DeviceKeyFailure
import org.livepeer.app.generated.CharacterReport
import org.livepeer.app.generated.CharacterReportState
import org.livepeer.app.generated.EngineJob
import org.livepeer.app.generated.JobState
import org.livepeer.app.generated.KnownActor
import org.livepeer.app.generated.KnownActorAllocationStatus
import org.livepeer.app.generated.OperatorAttention
import org.livepeer.app.generated.OperatorAttentionKind
import org.livepeer.app.generated.OperatorStatus

/**
 * What a state looks like beside its word. Good and bad are states of the service; active is work in progress;
 * ink is something waiting for a person; quiet is finished and unremarkable.
 */
enum class Tone { Good, Bad, Active, Ink, Quiet }

/** Where a list has got to. */
sealed interface Phase {
    data object Loading : Phase
    data object Loaded : Phase
    data class Failed(val message: String) : Phase
}

/** How a change an operator confirmed came out. Nothing on screen moves until it is [Done]. */
sealed interface ChangeOutcome {
    /** The instance made the change. */
    data object Done : ChangeOutcome

    /** The person closed the fingerprint or face prompt. Nothing was sent. */
    data object Cancelled : ChangeOutcome

    /** It didn't happen, and why. */
    data class Refused(val message: String) : ChangeOutcome
}

/** A lock or a sign-out replaces the whole console; a screen has nothing to say about it. */
internal val Exception.endsTheConsole: Boolean get() = this is ApiError && status == 401

internal suspend fun change(instance: String, run: suspend () -> ChangeOutcome): ChangeOutcome = try {
    run()
} catch (error: CancellationException) {
    throw error
} catch (error: DeviceKeyFailure) {
    if (error.kind == DeviceKeyFailure.Kind.Cancelled) ChangeOutcome.Cancelled else ChangeOutcome.Refused(ConsoleSession.changeMessage(error, instance))
} catch (error: Exception) {
    ChangeOutcome.Refused(ConsoleSession.changeMessage(error, instance))
}

// Status

data class StatusState(
    val status: OperatorStatus? = null,
    /** When this phone got the last answer, by its own clock, so "Checked 12 s ago" doesn't depend on the instance's. */
    val checked: Long? = null,
    val trouble: Trouble? = null,
    val loading: Boolean = false,
) {
    sealed interface Trouble {
        /** The instance didn't answer at all. */
        data object Unreachable : Trouble

        /** It answered and refused, in its own words. */
        data class Refused(val message: String) : Trouble
    }
}

/** The Status screen's answer and how it was got: read once when the console opens, then on pull to refresh. */
class StatusModel(private val now: () -> Long = System::currentTimeMillis, private val read: suspend () -> OperatorStatus) {
    private val _state = MutableStateFlow(StatusState())
    val state: StateFlow<StatusState> = _state

    suspend fun load() {
        if (_state.value.loading) return
        _state.update { it.copy(loading = true) }
        try {
            val fresh = read()
            _state.update { it.copy(status = fresh, checked = now(), trouble = null) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: ApiError) {
            _state.update { it.copy(trouble = if (error.endsTheConsole) null else StatusState.Trouble.Refused(error.message)) }
        } catch (error: Exception) {
            _state.update { it.copy(trouble = StatusState.Trouble.Unreachable) }
        } finally {
            _state.update { it.copy(loading = false) }
        }
    }

    companion object {
        /** Whether what needs attention includes the service itself, not only work waiting in a queue. */
        fun serviceIsDown(attention: List<OperatorAttention>): Boolean = attention.any { it.kind != OperatorAttentionKind.ReportsWaiting }

        /** The dot beside the sentence: green when all is well, red when the service is in trouble, ink for a queue. */
        fun tone(attention: List<OperatorAttention>): Tone = when {
            attention.isEmpty() -> Tone.Good
            serviceIsDown(attention) -> Tone.Bad
            else -> Tone.Ink
        }
    }
}

// Jobs

enum class JobFilter(val label: String, /** The state the instance filters by; none for all. */ val status: String?, val emptyMessage: String) {
    All("All", null, "No jobs have run yet."),
    Failed("Failed", "failed", "Nothing has failed."),
    Running("Running", "running", "Nothing is running."),
}

data class JobsState(
    val filter: JobFilter = JobFilter.All,
    val jobs: List<EngineJob> = emptyList(),
    val phase: Phase = Phase.Loading,
    /** Whether there may be older jobs than the last one shown. */
    val more: Boolean = false,
    val loadingMore: Boolean = false,
    /** Why the next page didn't come, shown at the foot of the list. */
    val moreFailure: String? = null,
)

/** Recent jobs across all users, newest first, filtered by state and read a page at a time. */
class JobsModel(private val page: suspend (status: String?, before: String?, limit: Int) -> List<EngineJob>) {
    private val _state = MutableStateFlow(JobsState())
    val state: StateFlow<JobsState> = _state

    fun job(id: String): EngineJob? = _state.value.jobs.firstOrNull { it.id == id }

    /** Shows a filter's first page, clearing the list at once so one filter's rows never sit under another's name. */
    suspend fun show(next: JobFilter) {
        if (next == _state.value.filter) return
        _state.value = JobsState(filter = next)
        load()
    }

    /** Reads the first page again. Keeps what is shown until the answer arrives. */
    suspend fun load() {
        val asked = _state.value.filter
        try {
            val first = page(asked.status, null, PAGE_SIZE)
            _state.update { if (it.filter != asked) it else it.copy(jobs = first, more = first.size == PAGE_SIZE, moreFailure = null, phase = Phase.Loaded) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (error.endsTheConsole) return
            _state.update { if (it.filter != asked || it.jobs.isNotEmpty()) it else it.copy(phase = Phase.Failed(message(error))) }
        }
    }

    /** Reads the page before the oldest job shown. */
    suspend fun loadMore() {
        val current = _state.value
        val last = current.jobs.lastOrNull() ?: return
        if (!current.more || current.loadingMore || current.phase != Phase.Loaded) return
        val asked = current.filter
        _state.update { it.copy(loadingMore = true) }
        try {
            val older = page(asked.status, last.createdAt, PAGE_SIZE)
            _state.update { state ->
                if (state.filter != asked) return@update state
                val known = state.jobs.mapTo(HashSet()) { it.id }
                state.copy(jobs = state.jobs + older.filter { it.id !in known }, more = older.size == PAGE_SIZE, moreFailure = null)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            _state.update { if (it.filter != asked) it else it.copy(moreFailure = message(error)) }
        } finally {
            _state.update { it.copy(loadingMore = false) }
        }
    }

    companion object {
        const val PAGE_SIZE = 30
        private fun message(error: Exception): String = (error as? ApiError)?.message ?: "The jobs didn't load. Check your connection."
    }
}

val EngineJob.tone: Tone
    get() = when (state) {
        JobState.Failed, JobState.Uncertain -> Tone.Bad
        JobState.Running, JobState.Queued -> Tone.Active
        JobState.Succeeded, JobState.Unknown -> Tone.Quiet
    }

// Reports

/** What an operator can decide about a report. */
enum class ReportOutcome(val value: String) {
    /** The character stays up. */
    Dismissed("dismissed"),

    /** The character comes off the instance for everyone. */
    Hidden("hidden");

    /** The words in the fingerprint or face prompt: the same as the tray's. */
    fun prompt(report: CharacterReport): String = if (this == Hidden) "Take ${report.characterName} down" else "Keep ${report.characterName} up"
}

data class ReportsState(
    val reports: List<CharacterReport> = emptyList(),
    val phase: Phase = Phase.Loading,
    /** Counts confirmed changes, for the one haptic each gets. */
    val changes: Int = 0,
) {
    /** Open reports, oldest first: the one that has waited longest is at the top of the queue. */
    val waiting: List<CharacterReport> get() = reports.filter { it.state == CharacterReportState.Open }.sortedBy { it.createdAt }

    /** Decided reports, newest first. */
    val decided: List<CharacterReport> get() = reports.filter { it.state != CharacterReportState.Open }.sortedByDescending { it.createdAt }

    fun report(id: String): CharacterReport? = reports.firstOrNull { it.id == id }
}

/** Reports of shared characters: the ones waiting for a decision, then the ones already decided. */
class ReportsModel(
    private val read: suspend () -> List<CharacterReport>,
    private val resolve: suspend (CharacterReport, ReportOutcome) -> CharacterReport,
) {
    private val _state = MutableStateFlow(ReportsState())
    val state: StateFlow<ReportsState> = _state

    suspend fun load() {
        try {
            val reports = read()
            _state.update { it.copy(reports = reports, phase = Phase.Loaded) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (error.endsTheConsole) return
            _state.update { if (it.reports.isNotEmpty()) it else it.copy(phase = Phase.Failed((error as? ApiError)?.message ?: "The reports didn't load. Check your connection.")) }
        }
    }

    /**
     * Decides a report. The list changes only from the instance's answer: the decided report as it now is, then
     * the queue read again, since taking a character down closes its other open reports too.
     */
    suspend fun decide(report: CharacterReport, outcome: ReportOutcome, instance: String): ChangeOutcome = change(instance) {
        val decided = resolve(report, outcome)
        _state.update { state -> state.copy(reports = state.reports.map { if (it.id == decided.id) decided else it }, changes = state.changes + 1) }
        load()
        ChangeOutcome.Done
    }
}

/** A decision in words. */
val CharacterReportState.word: String
    get() = when (this) {
        CharacterReportState.Open -> "Waiting"
        CharacterReportState.Dismissed -> "Kept up"
        CharacterReportState.Hidden -> "Taken down"
        CharacterReportState.Unknown -> "Decided"
    }

/** A decided report is a different row from the waiting one it was, so a lazy list draws it again. */
val CharacterReport.rowKey: String get() = "$id ${state.value}"

// Users

/** What an operator can set a user's allocation to from a phone. */
enum class UserStatus(val value: String) {
    Active("active"),
    Paused("paused");

    /** The words in the fingerprint or face prompt: the same as the tray's. */
    fun prompt(user: KnownActor): String = if (this == Paused) "Suspend ${user.displayName}" else "Resume ${user.displayName}"
}

data class UsersState(
    val query: String = "",
    val users: List<KnownActor> = emptyList(),
    val phase: Phase = Phase.Loading,
    /** Counts confirmed changes, for the one haptic each gets. */
    val changes: Int = 0,
) {
    fun user(id: String): KnownActor? = users.firstOrNull { it.actorId == id }
}

/** Every account the engine knows, searched on the instance by name, label or id. */
class UsersModel(
    private val read: suspend (query: String?) -> List<KnownActor>,
    private val setStatus: suspend (KnownActor, UserStatus) -> Boolean,
) {
    private val _state = MutableStateFlow(UsersState())
    val state: StateFlow<UsersState> = _state

    fun search(query: String) = _state.update { it.copy(query = query) }

    /** Searches for what is typed now; an answer to an earlier search is dropped. */
    suspend fun load() {
        val asked = _state.value.query.trim()
        try {
            val found = read(asked.ifEmpty { null })
            _state.update { if (it.query.trim() != asked) it else it.copy(users = found, phase = Phase.Loaded) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (error.endsTheConsole) return
            _state.update { if (it.users.isNotEmpty()) it else it.copy(phase = Phase.Failed((error as? ApiError)?.message ?: "The users didn't load. Check your connection.")) }
        }
    }

    /** Suspends or resumes a user. The row and the detail change only once the instance has said it is done. */
    suspend fun set(user: KnownActor, status: UserStatus, instance: String): ChangeOutcome = change(instance) {
        if (!setStatus(user, status)) return@change ChangeOutcome.Refused("$instance couldn't change that account. Nothing was changed.")
        val standing = if (status == UserStatus.Paused) KnownActorAllocationStatus.Paused else KnownActorAllocationStatus.Active
        _state.update { state ->
            state.copy(users = state.users.map { if (it.actorId == user.actorId) it.copy(allocation = it.allocation?.copy(status = standing)) else it }, changes = state.changes + 1)
        }
        load()
        ChangeOutcome.Done
    }
}

/** The person's name where the engine has one, the account's label otherwise. */
val KnownActor.displayName: String get() = name?.takeIf { it.isNotEmpty() } ?: label.ifEmpty { actorId }

/** Where the account stands, in a word. An account with no allocation can't run anything yet. */
val KnownActor.standing: String
    get() = when (allocation?.status) {
        KnownActorAllocationStatus.Active -> "Active"
        KnownActorAllocationStatus.Paused -> "Suspended"
        KnownActorAllocationStatus.Exhausted -> "Out of credit"
        KnownActorAllocationStatus.Revoked -> "Revoked"
        KnownActorAllocationStatus.Unknown, null -> "No allocation"
    }

val KnownActor.tone: Tone
    get() = when (allocation?.status) {
        KnownActorAllocationStatus.Active -> Tone.Good
        KnownActorAllocationStatus.Paused, KnownActorAllocationStatus.Revoked -> Tone.Bad
        KnownActorAllocationStatus.Exhausted -> Tone.Ink
        KnownActorAllocationStatus.Unknown, null -> Tone.Quiet
    }

/** Whether a phone can suspend or resume the account: only between active and suspended. */
val KnownActor.canSuspend: Boolean get() = allocation?.status == KnownActorAllocationStatus.Active
val KnownActor.canResume: Boolean get() = allocation?.status == KnownActorAllocationStatus.Paused

/** A suspended account is a different row from the active one it was, so a lazy list draws it again. */
val KnownActor.rowKey: String get() = "$actorId ${allocation?.status?.value.orEmpty()}"
