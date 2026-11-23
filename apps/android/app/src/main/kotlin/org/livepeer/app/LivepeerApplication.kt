package org.livepeer.app

import android.app.Application
import android.content.Context
import android.os.UserManager
import org.livepeer.app.account.Account
import org.livepeer.app.alerts.FirebasePush
import org.livepeer.app.api.ApiTransport
import org.livepeer.app.api.ConsoleTransport
import org.livepeer.app.api.DeviceKey
import org.livepeer.app.console.AlertsMemory
import org.livepeer.app.console.Console
import org.livepeer.app.console.ConsoleSession
import org.livepeer.app.generated.OperatorApi
import org.livepeer.app.api.Refusal
import org.livepeer.app.api.TokenVault
import org.livepeer.app.design.VectorMark
import org.livepeer.app.generated.Api
import org.livepeer.app.generated.Conversation
import org.livepeer.app.generated.InstanceDescription
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

class LivepeerApplication : Application(), SingletonImageLoader.Factory {
    /**
     * Made when first needed, not when the process starts: Google's messaging can start the process after a
     * restart and before the phone has been unlocked, when nothing the app keeps can be read yet.
     */
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        // From the description kept from the last launch, so an alert that starts the app finds Firebase ready
        // to show it. Nothing is asked of Google here: a push token is made only when alerts are turned on.
        // Before the first unlock that description can't be read, and an alert that arrives then isn't shown.
        if (getSystemService(UserManager::class.java).isUserUnlocked) container.push.start()
    }

    override fun newImageLoader(context: Context): ImageLoader =
        ImageLoader.Builder(context).components { add(OkHttpNetworkFetcherFactory(callFactory = { container.http })) }.build()
}

/** What the screens share: the API client, who is signed in and what is known about the instance. */
class AppContainer(context: Context) {
    val http = OkHttpClient()
    private val vault = TokenVault(context)
    private lateinit var refusals: (Refusal) -> Unit

    private val transport = ApiTransport(BuildConfig.INSTANCE_URL, token = { vault.token }, client = http, refused = { refusals(it) })
    val api = Api(transport)

    // The instance's description is read without a session: a session that has ended must not keep the app from
    // learning what the instance now serves.
    val instance = InstanceStore(Api(ApiTransport(BuildConfig.INSTANCE_URL, token = { null }, client = http)), http, context)
    val account = Account(api, vault, instance, MainScope(), deviceName(context)).also { account -> refusals = account::refused }
    val theme = ThemePreference(context)
    val composer = org.livepeer.app.composer.ComposerSupport(api, transport)
    val studio = org.livepeer.app.studio.StudioModel(api)
    val characters = org.livepeer.app.characters.CharactersModel(api)
    val settings = org.livepeer.app.settings.SettingsModel(api)

    /** How an operator's alerts reach this phone: through the Firebase project the instance names. */
    val push = FirebasePush(context) { instance.description.value?.mobile?.android?.firebase }

    /** The operator's console: a session, a token entry and a key of its own, apart from everything above. */
    val console = TokenVault.operator(context).let { operatorVault ->
        Console(
            session = ConsoleSession(
                api = OperatorApi(ConsoleTransport(BuildConfig.INSTANCE_URL, token = { operatorVault.token }, client = http)),
                vault = operatorVault,
                key = DeviceKey(context),
                scope = MainScope(),
                baseUrl = BuildConfig.INSTANCE_URL,
                deviceName = deviceName(context),
                instanceName = { instance.description.value?.name ?: context.getString(R.string.app_name) },
                refreshInstance = instance::refresh,
                elapsed = android.os.SystemClock::elapsedRealtime,
            ),
            device = push,
            // Beside the console's own token, sealed the same way, and gone when the console signs out.
            memory = AlertsMemory(TokenVault(context, name = "operator-alerts", alias = "operator-alerts")),
            scope = MainScope(),
        )
    }

    /** Conversations as last seen, so opening one shows it at once and then refreshes. */
    val conversations = mutableMapOf<String, Conversation>()
}

/**
 * The instance this build belongs to, as it describes itself: name, marks, theme, what it serves.
 * Shown from the last copy at once, then refreshed, so the theme never flashes.
 */
class InstanceStore(private val api: Api, private val http: OkHttpClient, context: Context) {
    private val cache = context.getSharedPreferences("instance", Context.MODE_PRIVATE)
    private val _description = MutableStateFlow(cache.getString(DESCRIPTION, null)?.let { runCatching { ApiTransport.json.decodeFromString(InstanceDescription.serializer(), it) }.getOrNull() })
    private val _symbol = MutableStateFlow(cache.getString(SYMBOL, null)?.let(VectorMark::parse))
    private val _settled = MutableStateFlow(_description.value != null)

    val description: StateFlow<InstanceDescription?> = _description
    val symbol: StateFlow<VectorMark?> = _symbol

    /**
     * Whether the instance has said what it serves, now or on an earlier launch, or couldn't be asked. Until
     * then a first launch draws nothing: the build may be the app, the console, or both.
     */
    val settled: StateFlow<Boolean> = _settled

    /** Whether this build can be used with the instance right now. */
    enum class Availability {
        Available,
        /** The instance doesn't serve phones, or doesn't list this app. */
        NotOffered,
        /** The instance needs a newer build than this one. */
        UpdateRequired,
    }

    /** Reads the description again. A failure keeps the last copy: the app stays usable offline. */
    suspend fun refresh() {
        val fresh = runCatching { api.getInstance() }.getOrNull()
        if (fresh == null) {
            _settled.value = true
            return
        }
        _description.value = fresh
        _settled.value = true
        cache.edit().putString(DESCRIPTION, ApiTransport.json.encodeToString(InstanceDescription.serializer(), fresh)).apply()

        val svg = fresh.logo.symbol?.takeIf { it.substringBefore('?').endsWith(".svg", ignoreCase = true) }?.let { address ->
            withContext(Dispatchers.IO) { runCatching { http.newCall(Request.Builder().url(address).build()).execute().use { it.body.string() } }.getOrNull() }
        }
        val mark = svg?.let(VectorMark::parse)
        _symbol.value = mark
        cache.edit().apply { if (mark != null) putString(SYMBOL, svg) else remove(SYMBOL) }.apply()
    }

    companion object {
        private const val DESCRIPTION = "description"
        private const val SYMBOL = "symbol.svg"

        /** Before the first answer the app is usable: it can't know otherwise, and the first request will tell. */
        fun availability(description: InstanceDescription?, applicationId: String = BuildConfig.APPLICATION_ID, version: String = BuildConfig.VERSION_NAME): Availability {
            if (description == null) return Availability.Available
            val app = description.mobile.android
            // The app and the console each have their own switch; either one is a reason for this build to exist.
            val served = description.surfaces.mobile || description.surfaces.mobileConsole
            if (!served || app == null || !app.applicationId.equals(applicationId, ignoreCase = true)) return Availability.NotOffered
            val minimum = app.minimumVersion ?: return Availability.Available
            return if (compareVersions(version, minimum) < 0) Availability.UpdateRequired else Availability.Available
        }

        /** The instance serves its console to phones and not its app: this build is the console and nothing else. */
        fun consoleOnly(description: InstanceDescription?): Boolean = description != null && description.surfaces.mobileConsole && !description.surfaces.mobile

        /** "0.9.3" < "0.10.0": compared number by number. */
        fun compareVersions(a: String, b: String): Int {
            val left = a.split('.').map { it.toIntOrNull() ?: 0 }
            val right = b.split('.').map { it.toIntOrNull() ?: 0 }
            for (index in 0 until maxOf(left.size, right.size)) {
                val difference = left.getOrElse(index) { 0 }.compareTo(right.getOrElse(index) { 0 })
                if (difference != 0) return difference
            }
            return 0
        }
    }
}

/** The name the person gave this device ("Adam's Pixel"), or its maker and model. */
private fun deviceName(context: Context): String =
    android.provider.Settings.Global.getString(context.contentResolver, android.provider.Settings.Global.DEVICE_NAME)?.takeIf { it.isNotBlank() }
        ?: android.os.Build.MODEL.let { model -> if (model.startsWith(android.os.Build.MANUFACTURER, ignoreCase = true)) model else "${android.os.Build.MANUFACTURER.replaceFirstChar(Char::uppercase)} $model" }

/** The person's choice of theme: follow the system, or always dark or light. Kept on this device. */
class ThemePreference(context: Context) {
    enum class Choice { System, Dark, Light }

    private val store = context.getSharedPreferences("preferences", Context.MODE_PRIVATE)
    private val _choice = MutableStateFlow(runCatching { Choice.valueOf(store.getString(KEY, null) ?: "") }.getOrDefault(Choice.System))
    val choice: StateFlow<Choice> = _choice

    fun set(choice: Choice) {
        _choice.value = choice
        store.edit().putString(KEY, choice.name).apply()
    }

    private companion object {
        const val KEY = "theme"
    }
}
