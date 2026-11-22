package org.livepeer.app.console

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.livepeer.app.BuildConfig
import org.livepeer.app.design.LoadFailure
import org.livepeer.app.design.LocalPalette
import org.livepeer.app.design.pressable
import org.livepeer.app.design.style
import org.livepeer.app.generated.ComputeOperator
import org.livepeer.app.generated.CostSummary
import org.livepeer.app.generated.EngineHealth
import org.livepeer.app.generated.Grant
import org.livepeer.app.generated.OfferedCapability
import org.livepeer.app.generated.OverviewStats
import org.livepeer.app.generated.Plan
import org.livepeer.app.generated.TypeSize

/** The pages behind the More tab, by the name each has in the address of its route. */
enum class MorePage(val route: String, val title: String) {
    Revenue("revenue", "Revenue and margin"),
    Costs("costs", "Network cost"),
    Grants("grants", "Grants"),
    Plans("plans", "Plans"),
    Compute("compute", "Compute operators"),
    Offered("offered", "What's offered"),
    System("system", "System"),
    Alerts("alerts", "Alerts"),
}

/**
 * The numbers and the network, grouped as the web console groups them, with only what a phone offers. Keys,
 * pricing, billing and settings stay on the web, and the foot of the page says so.
 */
@Composable
fun MoreScreen(onBack: (() -> Unit)?, alerts: String, open: (MorePage) -> Unit) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    ConsolePage("More", onBack) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            ConsoleSection("Money") {
                PageLink(MorePage.Revenue, open)
                RowRule()
                PageLink(MorePage.Costs, open)
                RowRule()
                PageLink(MorePage.Grants, open)
                RowRule()
                PageLink(MorePage.Plans, open)
            }
            ConsoleSection("Network") {
                PageLink(MorePage.Compute, open)
                RowRule()
                PageLink(MorePage.Offered, open)
            }
            ConsoleSection("Instance") { PageLink(MorePage.System, open) }
            // What this phone is told. Where it stands is said beside the name, in mono, as a fact.
            ConsoleSection("This phone") { PageLink(MorePage.Alerts, open, fact = alerts) }
            Box(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).pressable(label = "Opens the web console in the browser") {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.INSTANCE_URL.trimEnd('/') + "/operator")))
                },
                contentAlignment = Alignment.Center,
            ) {
                BasicText("Keys, pricing, billing and settings are on the web console.", style = TypeSize.Body.style().copy(color = palette.mutedForeground, textAlign = TextAlign.Center))
            }
        }
    }
}

@Composable
private fun PageLink(page: MorePage, open: (MorePage) -> Unit, fact: String = "") {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).pressable { open(page) }.padding(horizontal = 16.dp, vertical = 12.dp).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        BasicText(page.title, style = TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground), modifier = Modifier.weight(1f))
        if (fact.isNotEmpty()) BasicText(fact, style = TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = palette.subtleForeground, modifier = Modifier.size(20.dp))
    }
}

/**
 * A pushed page of the console that shows one read: its rows once they have arrived, the same rows with
 * nothing to read in them while they are on their way, or why they didn't come.
 */
@Composable
private fun <T> ReadPage(title: String, model: ConsoleRead<T>, unlocks: Int, onBack: () -> Unit, placeholder: @Composable ColumnScope.() -> Unit, content: @Composable ColumnScope.(T) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    // Read again each time the console is unlocked: what was on screen may be minutes old.
    LaunchedEffect(unlocks) { model.load() }
    DetailPage(title, onBack, refresh = model::load) {
        val value = state.value
        val phase = state.phase
        when {
            value != null -> content(value)
            phase is Phase.Failed -> LoadFailure(phase.message, Modifier.padding(top = 32.dp)) { scope.launch { model.load() } }
            else -> StandIn { Column(verticalArrangement = Arrangement.spacedBy(24.dp), content = placeholder) }
        }
    }
}

/**
 * A row of a card that names something and gives its facts in mono under it, with a state at the right when
 * it has one. At the largest text sizes the state moves under the name.
 */
@Composable
fun NamedRow(name: String, facts: List<String>, state: Pair<String, Tone>? = null) {
    val palette = LocalPalette.current
    val title: @Composable (Modifier) -> Unit = { Words(name, TypeSize.Lead.style(FontWeight.Medium).copy(color = palette.foreground), it) }
    val stateView: @Composable () -> Unit = {
        state?.let { (word, tone) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StateDot(tone)
                Words(word, TypeSize.Body.style(FontWeight.Medium).copy(color = if (tone == Tone.Bad) palette.destructive else palette.foreground))
            }
        }
    }
    Column(Modifier.fillMaxWidth().heightIn(min = 56.dp).semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically)) {
        if (largeText()) {
            title(Modifier)
            stateView()
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                title(Modifier.weight(1f))
                stateView()
            }
        }
        if (facts.isNotEmpty()) Words(factLine(facts), TypeSize.Caption.style(mono = true).copy(color = palette.mutedForeground))
    }
}

// Money

/** What came in, what the network cost, and what was left: today, and day by day. */
@Composable
fun RevenueScreen(model: ConsoleRead<OverviewStats>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.Revenue.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("Today") {
            FactRow("Revenue", "$0.00")
            RowRule()
            FactRow("Network cost", "$0.00")
            RowRule()
            FactRow("Margin", "$0.00")
        }
    }) { stats ->
        ConsoleSection("Today") {
            FactRow(if (stats.revenueEstimated) "Revenue, estimated" else "Revenue", ConsoleFormat.money(stats.revenueUsd))
            RowRule()
            FactRow("Network cost", ConsoleFormat.money(stats.wholesaleUsd))
            RowRule()
            FactRow("Margin", marginLine(stats.marginUsd, stats.revenueUsd))
            if (stats.pendingUsd > 0) {
                RowRule()
                FactRow("Cost not yet settled", ConsoleFormat.money(stats.pendingUsd))
            }
        }
        if (stats.series.isNotEmpty()) {
            ConsoleSection("Last ${stats.series.size} days") {
                DayBars(stats)
                RowRule()
                FactRow("Revenue", ConsoleFormat.money(stats.periodRevenue))
                RowRule()
                FactRow("Network cost", ConsoleFormat.money(stats.periodCost))
                RowRule()
                FactRow("Margin", marginLine(stats.periodMargin, stats.periodRevenue))
            }
        }
    }
}

/**
 * A bar a day: the muted part at its foot is what the network cost and the ink above it is the margin, so the
 * whole bar is the day's revenue. A day that cost more than it made is all muted. The two parts sit one on the
 * other, never overlapping: the muted colour is see-through.
 */
@Composable
private fun DayBars(stats: OverviewStats) {
    val palette = LocalPalette.current
    val first = ConsoleFormat.day(stats.series.first().day)
    val last = ConsoleFormat.day(stats.series.last().day)
    val peak = stats.peak
    Column(
        Modifier.fillMaxWidth().padding(16.dp).clearAndSetSemantics { contentDescription = "Revenue and network cost by day, $first to $last. The totals follow." },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth().height(BAR_HEIGHT.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
            for (day in stats.series) {
                Column(Modifier.weight(1f).clip(RoundedCornerShape(2.dp))) {
                    BarPart((day.revenueUsd - day.wholesaleUsd).coerceAtLeast(0.0), peak, palette.foreground)
                    BarPart(day.wholesaleUsd, peak, palette.subtleForeground)
                }
            }
        }
        Row(Modifier.fillMaxWidth()) {
            BasicText(first, style = TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground), modifier = Modifier.weight(1f))
            BasicText(last, style = TypeSize.Caption.style(mono = true).copy(color = palette.subtleForeground))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            BarKey("Margin", palette.foreground)
            BarKey("Network cost", palette.subtleForeground)
        }
    }
}

private const val BAR_HEIGHT = 96

@Composable
private fun BarPart(value: Double, peak: Double, colour: Color) {
    val height = if (peak > 0) (BAR_HEIGHT * value / peak).coerceAtLeast(if (value > 0) 1.0 else 0.0) else 0.0
    Box(Modifier.fillMaxWidth().height(height.dp).background(colour))
}

@Composable
private fun BarKey(name: String, colour: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(10.dp).background(colour, RoundedCornerShape(2.dp)))
        BasicText(name, style = TypeSize.Caption.style().copy(color = LocalPalette.current.mutedForeground))
    }
}

/** What the network was paid, by what became of the work and by capability. */
@Composable
fun CostsScreen(model: ConsoleRead<CostSummary>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.Costs.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("Last ${MoreModels.COST_DAYS} days") {
            FactRow("Paid to the network", "$0.00")
            RowRule()
            FactRow("For delivered work", "$0.00")
            RowRule()
            FactRow("For work that failed", "$0.00")
        }
    }) { summary ->
        ConsoleSection("Last ${MoreModels.COST_DAYS} days") {
            FactRow("Paid to the network", ConsoleFormat.fee(summary.paid))
            RowRule()
            FactRow("For delivered work", ConsoleFormat.fee(summary.byClass.delivered.usd))
            RowRule()
            FactRow("For work that failed", ConsoleFormat.fee(summary.byClass.failedAfterPayment.usd))
            if (summary.byClass.uncertain.usd > 0) {
                RowRule()
                FactRow("Outcome not known", ConsoleFormat.fee(summary.byClass.uncertain.usd))
            }
            RowRule()
            FactRow("Not yet settled", ConsoleFormat.fee(summary.byClass.pending.usd))
            RowRule()
            FactRow("Jobs with a cost", ConsoleFormat.count(summary.jobsWithCost))
        }
        val lines = summary.lines
        if (lines.isEmpty()) {
            EmptyLine("Nothing has cost anything yet.", Modifier.padding(top = 8.dp))
        } else {
            ConsoleSection("By capability") {
                lines.forEachIndexed { index, line ->
                    if (index > 0) RowRule()
                    NamedRow(ConsoleFormat.appName(line.app), listOfNotNull("${ConsoleFormat.fee(line.delivered)} delivered", if (line.showsLost) "${ConsoleFormat.fee(line.lost)} failed" else null))
                }
            }
        }
    }
}

/** Grants and how far each has been spent. Creating and funding one is a desk job on the web. */
@Composable
fun GrantsScreen(model: ConsoleRead<List<Grant>>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.Grants.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("A grant") {
            FactRow("Funded", "$000.00")
            RowRule()
            FactRow("Set aside for users", "$000.00")
            RowRule()
            FactRow("Spent", "$00.00")
        }
    }) { grants ->
        if (grants.isEmpty()) EmptyLine("No grants have been funded yet.", Modifier.padding(top = 32.dp))
        for (grant in grants) {
            ConsoleSection(grant.label) {
                FactRow("Funded", ConsoleFormat.money(grant.funded))
                RowRule()
                FactRow("Set aside for users", ConsoleFormat.money(grant.allocated))
                RowRule()
                FactRow("Spent", ConsoleFormat.money(grant.spent))
                RowRule()
                FactRow("Not yet set aside", ConsoleFormat.money(grant.unallocated))
                RowRule()
                FactRow("Id", grant.id, copies = true)
            }
        }
    }
}

/** The provider's plans, as users are offered them. Changing one is done at the provider. */
@Composable
fun PlansScreen(model: ConsoleRead<List<Plan>>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.Plans.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("Offered to users") {
            NamedRow("A plan", listOf("$00.00 a month", "0,000 credits a month"))
            RowRule()
            NamedRow("A plan", listOf("$00.00 a month", "0,000 credits a month"))
        }
    }) { plans ->
        if (plans.isEmpty()) {
            EmptyLine("The payment provider has no plans yet.", Modifier.padding(top = 32.dp))
        } else {
            ConsoleSection("Offered to users") {
                plans.forEachIndexed { index, plan ->
                    if (index > 0) RowRule()
                    NamedRow(plan.name, listOf(plan.priceLine, plan.allowanceLine, ConsoleFormat.markup(plan.markup)), if (plan.active) null else "Not offered" to Tone.Quiet)
                }
            }
        }
    }
}

// Network

/** The compute operators that ran this instance's recent work, and how they did. */
@Composable
fun ComputeScreen(model: ConsoleRead<List<ComputeOperator>>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.Compute.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("From recent jobs") {
            NamedRow("a-compute-operator.example", listOf("00 jobs", "0 failed", "0.0 s median"))
            RowRule()
            NamedRow("a-compute-operator.example", listOf("00 jobs", "0 failed", "0.0 s median"))
        }
    }) { operators ->
        if (operators.isEmpty()) {
            EmptyLine("No compute operator has run a job yet.", Modifier.padding(top = 32.dp))
        } else {
            ConsoleSection("From recent jobs") {
                operators.forEachIndexed { index, compute ->
                    if (index > 0) RowRule()
                    NamedRow(compute.host, compute.facts, if (compute.blocked) "Blocked" to Tone.Bad else null)
                }
            }
        }
    }
}

/** Every capability discovered on the network: whether this instance offers it, and whether anyone can run it now. */
@Composable
fun OfferedScreen(model: ConsoleRead<List<OfferedCapability>>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.Offered.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("On the network") {
            repeat(4) { index ->
                if (index > 0) RowRule()
                NamedRow("A capability", listOf("0 of 0 ready", "default markup"), "Offered" to Tone.Quiet)
            }
        }
    }) { capabilities ->
        if (capabilities.isEmpty()) {
            EmptyLine("Nothing has been discovered on the network yet.", Modifier.padding(top = 32.dp))
        } else {
            ConsoleSection("On the network") {
                capabilities.forEachIndexed { index, capability ->
                    if (index > 0) RowRule()
                    NamedRow(capability.name, capability.facts, capability.standing)
                }
            }
        }
    }
}

// Instance

/** The engine as it reports itself: ready or not, how fresh its view of the network is, and its version. */
@Composable
fun SystemScreen(model: ConsoleRead<EngineHealth>, unlocks: Int, onBack: () -> Unit) {
    ReadPage(MorePage.System.title, model, unlocks, onBack, placeholder = {
        ConsoleSection("Engine") {
            NamedRow("Engine", emptyList(), "Ready" to Tone.Quiet)
            RowRule()
            NamedRow("Discovery", listOf("00 s ago"), "Fresh" to Tone.Quiet)
            RowRule()
            NamedRow("Cost sync", listOf("0 min ago"), "Synced" to Tone.Quiet)
        }
    }) { health ->
        val now = rememberNow(1_000)
        // When a part of the service was last seen, as one fact; none when it never was.
        val seen = { text: String? -> listOfNotNull(ConsoleFormat.millis(text)?.let { ConsoleFormat.ago(it, now) }) }
        ConsoleSection("Engine") {
            NamedRow("Engine", emptyList(), if (health.ready) "Ready" to Tone.Good else "Not ready" to Tone.Bad)
            RowRule()
            NamedRow("Discovery", seen(health.discoveryObservedAt) + listOfNotNull(health.discoveryError), if (health.discoveryFresh) "Fresh" to Tone.Good else "Stale" to Tone.Bad)
            RowRule()
            NamedRow("Cost sync", seen(health.costSyncAt) + listOfNotNull(health.costSyncError), if (health.costSyncError == null) "Synced" to Tone.Good else "Failing" to Tone.Bad)
        }
        ConsoleSection("About") {
            FactRow("Engine version", health.version)
            RowRule()
            FactRow("Allocations", health.allocationMode.replace('_', ' '))
            RowRule()
            FactRow("Running now", ConsoleFormat.count(health.runningJobs))
        }
        BasicText(
            "The instance's own setup checks are on the web console's System page.",
            style = TypeSize.Body.style().copy(color = LocalPalette.current.mutedForeground),
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}
