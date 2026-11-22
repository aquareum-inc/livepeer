package org.livepeer.app.console

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import org.livepeer.app.api.ApiError
import org.livepeer.app.generated.ComputeOperator
import org.livepeer.app.generated.ComputeOperatorStatus
import org.livepeer.app.generated.CostSummary
import org.livepeer.app.generated.EngineHealth
import org.livepeer.app.generated.Fees
import org.livepeer.app.generated.Grant
import org.livepeer.app.generated.Money
import org.livepeer.app.generated.OfferedCapability
import org.livepeer.app.generated.OverviewStats
import org.livepeer.app.generated.Plan
import org.livepeer.app.generated.PlanAllowancePeriod
import org.livepeer.app.generated.PlanInterval
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Locale

/** One of the console's reads and where it has got to. */
data class ReadState<T>(val value: T? = null, val phase: Phase = Phase.Loading)

/**
 * A read behind one of the console's pages. It is read when its page opens, again each time the console is
 * unlocked, and on pull to refresh. What is shown stays until a newer answer arrives.
 */
class ConsoleRead<T>(
    /** What to say when the instance didn't answer at all. */
    private val failure: String,
    private val read: suspend () -> T,
) {
    private val _state = MutableStateFlow(ReadState<T>())
    val state: StateFlow<ReadState<T>> = _state

    suspend fun load() {
        try {
            val fresh = read()
            _state.value = ReadState(fresh, Phase.Loaded)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // A lock or a sign-out replaces the whole console; there's nothing for this page to say.
            if (error is ApiError && error.status == 401) return
            _state.update { if (it.value != null) it else it.copy(phase = Phase.Failed((error as? ApiError)?.message ?: failure)) }
        }
    }
}

/** The console's reads beyond the four tabs, each read when its page opens. */
class MoreModels(session: ConsoleSession) {
    val overview = ConsoleRead("The figures didn't load. Check your connection.") { session.read { it.operatorOverview() } }
    val costs = ConsoleRead("The costs didn't load. Check your connection.") { session.read { it.operatorCosts(COST_DAYS.toDouble()) } }
    val grants = ConsoleRead("The grants didn't load. Check your connection.") { session.read { it.operatorListGrants() } }
    val plans = ConsoleRead("The plans didn't load. Check your connection.") { session.read { it.operatorListPlans() } }
    val compute = ConsoleRead("The compute operators didn't load. Check your connection.") { session.read { it.operatorListCompute() } }
    val offered = ConsoleRead("The capabilities didn't load. Check your connection.") { session.read { it.operatorListCapabilities() } }
    val health = ConsoleRead<EngineHealth>("The engine's state didn't load. Check your connection.") { session.read { it.operatorHealth() } }

    companion object {
        /** How many days of network cost the phone asks for. */
        const val COST_DAYS = 30
    }
}

// What the money and network pages make of the instance's answers. Nothing here is fetched: it is worked out
// from what one read already carries.

/** Facts on one line, each holding together when the line wraps, with a separator that holds to the fact before it. */
fun factLine(facts: List<String>): String = facts.joinToString(FACT_GAP) { it.replace(' ', '\u00A0') }

/** An amount as the provider writes it ("500.00" in USD), as money. */
fun ConsoleFormat.money(money: Money): String {
    val amount = money.amount.toDoubleOrNull() ?: return "${money.amount} ${money.currency}"
    val currency = runCatching { Currency.getInstance(money.currency) }.getOrNull() ?: return "${money.amount} ${money.currency}"
    return NumberFormat.getCurrencyInstance(Locale.US).apply { this.currency = currency }.format(amount)
}

/** A network fee in dollars. Fees can be fractions of a cent, so small ones keep four places. */
fun ConsoleFormat.fee(usd: Double): String =
    if (usd > 0 && usd < 0.01) NumberFormat.getCurrencyInstance(Locale.US).apply { minimumFractionDigits = 4; maximumFractionDigits = 4 }.format(usd) else money(usd)

/** "1.3×", or the instance's own when a capability or plan sets none. */
fun ConsoleFormat.markup(value: Double?): String =
    value?.let { NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 2 }.format(it) + "×" } ?: "default markup"

/** "22%", or nothing to say when there was no revenue. */
fun ConsoleFormat.share(part: Double, whole: Double): String? =
    if (whole > 0) NumberFormat.getPercentInstance(Locale.US).apply { maximumFractionDigits = 0 }.format(part / whole) else null

/** "8 Nov" from a day written as 2026-11-08: the day as the instance wrote it, wherever the phone is. */
fun ConsoleFormat.day(text: String, locale: Locale = Locale.getDefault()): String =
    runCatching { LocalDate.parse(text).format(DateTimeFormatter.ofPattern("d MMM", locale)) }.getOrDefault(text)

/** "$1.50 · 22%": the margin, and its share of revenue when there was any. */
fun marginLine(margin: Double, revenue: Double): String = factLine(listOfNotNull(ConsoleFormat.money(margin), ConsoleFormat.share(margin, revenue)))

/** The fee in dollars; nothing where the engine hasn't priced it yet. */
val Fees.usd: Double get() = feeUsd?.toDoubleOrNull() ?: 0.0

/** What the days shown add up to. */
val OverviewStats.periodRevenue: Double get() = series.sumOf { it.revenueUsd }
val OverviewStats.periodCost: Double get() = series.sumOf { it.wholesaleUsd }
val OverviewStats.periodMargin: Double get() = periodRevenue - periodCost

/** The tallest day, which sets the chart's scale. */
val OverviewStats.peak: Double get() = series.maxOfOrNull { maxOf(it.revenueUsd, it.wholesaleUsd) } ?: 0.0

/** One capability's share of the network cost. */
data class CostLine(
    val app: String,
    /** Paid for work that was delivered. */
    val delivered: Double,
    /** Paid for work that failed after payment went, or whose outcome isn't known. */
    val lost: Double,
) {
    /** Whether the lost part is large enough to write: at least a hundredth of a cent. */
    val showsLost: Boolean get() = lost >= 0.00005
}

/** Capabilities by what they cost, dearest first; ones that cost nothing are left out. */
val CostSummary.lines: List<CostLine>
    get() = byApp.map { (app, fees) -> CostLine(app, fees.delivered?.usd ?: 0.0, (fees.failedAfterPayment?.usd ?: 0.0) + (fees.uncertain?.usd ?: 0.0)) }
        .filter { it.delivered + it.lost > 0 }
        .sortedWith(compareByDescending<CostLine> { it.delivered + it.lost }.thenBy { it.app })

/** Everything paid to the network in the period, whatever became of the work. */
val CostSummary.paid: Double get() = byClass.delivered.usd + byClass.failedAfterPayment.usd + byClass.uncertain.usd

/** What is funded and not yet set aside for anyone. */
val Grant.unallocated: Double get() = ((funded.amount.toDoubleOrNull() ?: 0.0) - (allocated.amount.toDoubleOrNull() ?: 0.0)).coerceAtLeast(0.0)

/** "$18.00 a month". */
val Plan.priceLine: String get() = "${ConsoleFormat.money(price)} a ${if (interval == PlanInterval.Year) "year" else "month"}"

/** "2,000 credits a month". */
val Plan.allowanceLine: String get() = "${ConsoleFormat.count(allowance.credits)} credits a ${if (allowance.period == PlanAllowancePeriod.Year) "year" else "month"}"

/** The operator by its host; the whole address when it has none. */
val ComputeOperator.host: String get() = ConsoleFormat.host(orchestratorUrl) ?: orchestratorUrl

val ComputeOperator.blocked: Boolean get() = status == ComputeOperatorStatus.Blocked

/** "67 jobs", "5 failed", "1.7 s median". */
val ComputeOperator.facts: List<String>
    get() = listOfNotNull(
        if (jobs == 1.0) "1 job" else "${ConsoleFormat.count(jobs)} jobs",
        "${ConsoleFormat.count(failures)} failed",
        medianResponseMs?.let { "${ConsoleFormat.duration(it / 1000)} median" },
    )

/** Whether anyone can run it now. */
val OfferedCapability.available: Boolean get() = readyCount > 0 && !stale

/** "5 of 6 ready", the markup, and "not seen lately" when discovery has lost sight of it. */
val OfferedCapability.facts: List<String>
    get() = listOfNotNull("${ConsoleFormat.count(readyCount)} of ${ConsoleFormat.count(runnerCount)} ready", ConsoleFormat.markup(markup), if (stale) "not seen lately" else null)

/** Offered and runnable is unremarkable; offered with no one to run it is a problem; not offered is a choice. */
val OfferedCapability.standing: Pair<String, Tone>
    get() = when {
        !enabled -> "Not offered" to Tone.Quiet
        available -> "Offered" to Tone.Good
        else -> "No one ready" to Tone.Bad
    }
