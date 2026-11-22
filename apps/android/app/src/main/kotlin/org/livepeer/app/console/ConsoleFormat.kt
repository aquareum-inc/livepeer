package org.livepeer.app.console

import org.livepeer.app.generated.EngineJob
import org.livepeer.app.generated.JobState
import java.net.URI
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** How the console writes facts: ages, money, durations, ids. Short, and the same on every screen. */
object ConsoleFormat {
    /** A time as the instance writes it, with or without fractions of a second, in milliseconds. */
    fun millis(text: String?): Long? = text?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    /** "just now", "12 s ago", "3 min ago", "2 h ago", "4 d ago". */
    fun ago(then: Long, now: Long): String {
        val seconds = ((now - then) / 1000).coerceAtLeast(0)
        return when {
            seconds < 5 -> "just now"
            seconds < 60 -> "$seconds s ago"
            seconds < 3600 -> "${seconds / 60} min ago"
            seconds < 86400 -> "${seconds / 3600} h ago"
            else -> "${seconds / 86400} d ago"
        }
    }

    /** The time alone for today, with the day before it otherwise. */
    fun clock(then: Long, now: Long, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String {
        val at = Instant.ofEpochMilli(then).atZone(zone)
        val time = at.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
        return if (at.toLocalDate() == Instant.ofEpochMilli(now).atZone(zone).toLocalDate()) time else "${at.format(DAY.withLocale(locale))} $time"
    }

    /** The day and the time to the second, for a job's own page. */
    fun moment(then: Long, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String {
        val at = Instant.ofEpochMilli(then).atZone(zone)
        return "${at.format(DAY.withLocale(locale))} ${at.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.MEDIUM).withLocale(locale))}"
    }

    /** A day without its time, "21 Dec": for something that ends on a date. */
    fun day(then: Long, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String = Instant.ofEpochMilli(then).atZone(zone).format(DAY.withLocale(locale))

    private val DAY = DateTimeFormatter.ofPattern("d MMM")

    fun money(usd: Double): String = NumberFormat.getCurrencyInstance(Locale.US).format(usd)

    fun count(value: Double): String = NumberFormat.getIntegerInstance(Locale.US).format(value.roundToLong())

    /** "640 ms", "9.2 s", "1 min 12 s". */
    fun duration(seconds: Double): String {
        if (seconds < 1) return "${(seconds * 1000).roundToInt()} ms"
        if (seconds < 60) return String.format(Locale.US, "%.1f s", seconds)
        val whole = seconds.roundToInt()
        return if (whole % 60 == 0) "${whole / 60} min" else "${whole / 60} min ${whole % 60} s"
    }

    fun milliseconds(value: Double): String = "${value.roundToInt()} ms"

    /** What a job ran, in words: "text-to-video" reads "Text to video". */
    fun appName(app: String): String = app.replace('-', ' ').replace('_', ' ').replaceFirstChar(Char::uppercase)

    /** The end of an id, enough to tell two apart in a list. */
    fun tail(id: String): String = "…\u2060" + id.takeLast(4)

    /** A compute operator by its host, without the scheme, port and path. */
    fun host(address: String?): String? = address?.let { runCatching { URI(it).host }.getOrNull() }

    /** The Status screen's one sentence. */
    fun headline(needing: Int): String = when (needing) {
        0 -> "Everything is running."
        1 -> "1 thing needs you."
        else -> "$needing things need you."
    }
}

val EngineJob.created: Long? get() = ConsoleFormat.millis(createdAt)

/** How long it ran, in seconds, once it has finished. */
val EngineJob.took: Double?
    get() {
        val start = created ?: return null
        val end = ConsoleFormat.millis(completedAt) ?: return null
        return (end - start) / 1000.0
    }

val EngineJob.stateWord: String
    get() = when (state) {
        JobState.Queued -> "Queued"
        JobState.Running -> "Running"
        JobState.Succeeded -> "Done"
        JobState.Failed -> "Failed"
        JobState.Uncertain -> "Uncertain"
        JobState.Unknown -> "Unknown"
    }

/** The facts on a row's second line, after the state. Each holds together when the line wraps. */
val EngineJob.facts: List<String>
    get() = buildList {
        val kind = failure?.kind
        val ran = took
        if (kind != null) add(kind) else if (ran != null) add(ConsoleFormat.duration(ran))
        add(if (attempts.size == 1) "1 attempt" else "${attempts.size} attempts")
        add(ConsoleFormat.tail(id))
    }.map { it.replace(' ', '\u00A0') }

/** "Failed after 900 ms", "Done in 9.2 s", or the state alone while it runs. */
val EngineJob.stateLine: String
    get() = took?.let { "$stateWord ${if (state == JobState.Succeeded) "in" else "after"} ${ConsoleFormat.duration(it)}" } ?: stateWord

/** The job in a few lines, for the share sheet. */
val EngineJob.summary: String
    get() = buildList {
        add("${ConsoleFormat.appName(app)}: ${stateWord.lowercase()}")
        add("Job $id")
        add("User $actorId")
        created?.let { add("Started ${ConsoleFormat.moment(it)}") }
        took?.let { add("Took ${ConsoleFormat.duration(it)}") }
        failure?.let { failure ->
            add("Failure: ${failure.message}")
            add((listOf(failure.kind) + listOfNotNull(failure.statusCode?.let(ConsoleFormat::count))).joinToString(", "))
        }
        for (attempt in attempts) {
            add("Attempt ${ConsoleFormat.count(attempt.number)}: ${attempt.outcome}" + (ConsoleFormat.host(attempt.orchestratorUrl)?.let { " on $it" } ?: ""))
        }
    }.joinToString("\n")
