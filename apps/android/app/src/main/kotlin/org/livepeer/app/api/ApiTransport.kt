package org.livepeer.app.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.URLEncoder
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** What the instance said when it refused or failed a request. */
class ApiError(val status: Int, override val message: String, val code: String? = null) : Exception(message) {
    /** The session is missing, expired or revoked. */
    val isSignedOut: Boolean get() = status == 401
    /** The instance has stopped serving its apps. */
    val isMobileOff: Boolean get() = code == "mobile_off"
}

/**
 * A refusal that changes the whole app, not just one screen: a token that stopped working, or an instance
 * that stopped serving phones. [token] is the one the request carried, so a late answer to an old session
 * can't sign out a newer one.
 */
class Refusal(val error: ApiError, val token: String)

/**
 * The last answer to each read and its ETag, so a read that hasn't changed comes back as 304 with no body.
 * Small: it only needs to hold what is being followed right now.
 */
class ReadCache {
    private class Entry(val etag: String, val body: String, val token: String?)
    private val entries = LinkedHashMap<String, Entry>()

    @Synchronized fun validator(url: String, token: String?): String? = entries[url]?.takeIf { it.token == token }?.etag
    @Synchronized fun body(url: String): String? = entries[url]?.body

    @Synchronized fun store(url: String, etag: String, body: String, token: String?) {
        if (entries.size >= LIMIT && url !in entries) entries.remove(entries.keys.first())
        entries[url] = Entry(etag, body, token)
    }

    private companion object {
        const val LIMIT = 64
    }
}

/** Sends requests to one instance's `/api/v1`. The generated `Api` calls this; nothing else does. */
class ApiTransport(
    baseUrl: String,
    /** The bearer token to send, if the caller has one. Guests send none. */
    private val token: () -> String?,
    private val client: OkHttpClient,
    /** Told about refusals that end the session or close the app; see [Refusal]. */
    private val refused: (Refusal) -> Unit = {},
    private val cache: ReadCache = ReadCache(),
) {
    private val root = baseUrl.trimEnd('/') + "/api/v1"

    @Serializable
    private data class Envelope(val error: Body) {
        @Serializable
        data class Body(val status: Int, val message: String, val code: String? = null)
    }

    suspend fun <T> send(output: DeserializationStrategy<T>, method: String, path: String, query: Map<String, JsonElement?>, body: Map<String, JsonElement?>?): T {
        val url = (root + path).toHttpUrl().newBuilder().apply {
            for ((key, value) in query.toSortedMap()) (value as? JsonPrimitive)?.let { addQueryParameter(key, it.content) }
        }.build()
        // OkHttp refuses a POST, PUT or PATCH without a body, so one with no inputs sends an empty object.
        val fields = body ?: if (method == "POST" || method == "PUT" || method == "PATCH") emptyMap() else null
        val payload = fields?.let { json.encodeToString(JsonObject.serializer(), JsonObject(it.filterValues { value -> value != null }.mapValues { entry -> entry.value!! })).toRequestBody(JSON) }
        val sent = token()
        val key = url.toString()
        val request = Request.Builder().url(url).header("Accept", "application/json").method(method, payload).apply {
            sent?.let { header("Authorization", "Bearer $it") }
            if (method == "GET") cache.validator(key, sent)?.let { header("If-None-Match", it) }
        }.build()

        // The reply is read and decoded off the main thread: a large or chunked body is still arriving when
        // the call returns, and reading it is network work.
        val (status, text) = withContext(Dispatchers.IO) {
            client.newCall(request).await().use { response ->
                val text = if (response.code == 304) cache.body(key) else response.body.string()
                if (method == "GET" && response.code == 200 && text != null) response.header("ETag")?.let { cache.store(key, it, text, sent) }
                response.code to text
            }
        }
        if (status == 304 && text != null) return json.decodeFromString(output, text)
        if (status !in 200..299 || text == null) {
            val body = text?.let { runCatching { json.decodeFromString(Envelope.serializer(), it).error }.getOrNull() }
            val error = ApiError(status, body?.message ?: "The request failed.", body?.code)
            if (sent != null && (error.isSignedOut || error.isMobileOff)) refused(Refusal(error, sent))
            throw error
        }
        return json.decodeFromString(output, text)
    }

    companion object {
        private val JSON = "application/json".toMediaType()

        /** Reads what the instance sends, and ignores fields a newer instance adds. */
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

        /** A value as one path segment. */
        fun escape(segment: String): String = URLEncoder.encode(segment, "UTF-8").replace("+", "%20")
    }
}

/** Runs a call without blocking, and cancels it when the caller is cancelled. */
internal suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) = continuation.resume(response)
        override fun onFailure(call: Call, e: IOException) {
            if (!continuation.isCancelled) continuation.resumeWithException(e)
        }
    })
}
