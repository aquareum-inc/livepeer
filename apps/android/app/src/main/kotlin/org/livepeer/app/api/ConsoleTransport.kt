package org.livepeer.app.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import okhttp3.CacheControl
import okhttp3.CookieJar
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.livepeer.app.generated.OperatorProof
import org.livepeer.app.generated.OperatorTransport
import java.util.concurrent.TimeUnit

/**
 * Carries the console's requests to the instance's `/api/v1` with the operator device session's token and, for
 * a change, its proof. Apart from the user app's transport on purpose: nothing an operator reads is cached or
 * written to disk, and a refusal here never touches the user's own session.
 */
class ConsoleTransport(
    baseUrl: String,
    /** The operator device session's token, when this phone has one. */
    private val token: () -> String?,
    client: OkHttpClient,
) : OperatorTransport {
    private val root = baseUrl.trimEnd('/') + "/api/v1"

    /** No cache, no cookies, nothing on disk. */
    private val client = client.newBuilder().cache(null).cookieJar(CookieJar.NO_COOKIES).callTimeout(15, TimeUnit.SECONDS).build()

    @Serializable
    private data class Envelope(val error: Body) {
        @Serializable
        data class Body(val status: Int, val message: String, val code: String? = null)
    }

    override suspend fun <T> send(output: DeserializationStrategy<T>, method: String, path: String, query: Map<String, JsonElement?>, body: Map<String, JsonElement?>?, proof: OperatorProof?): T {
        val url = (root + path).toHttpUrl().newBuilder().apply {
            for ((key, value) in query.toSortedMap()) (value as? JsonPrimitive)?.let { addQueryParameter(key, queryText(it)) }
        }.build()
        // OkHttp refuses a POST without a body, so one with no inputs sends an empty object.
        val fields = body ?: if (method == "POST" || method == "PUT" || method == "PATCH") emptyMap() else null
        val payload = fields?.let { ApiTransport.json.encodeToString(JsonObject.serializer(), JsonObject(it.filterValues { value -> value != null }.mapValues { entry -> entry.value!! })).toRequestBody(JSON) }
        val request = Request.Builder().url(url).header("Accept", "application/json").cacheControl(CacheControl.FORCE_NETWORK).method(method, payload).apply {
            token()?.let { header("Authorization", "Bearer $it") }
            proof?.let { header(PROOF_HEADER, it.header) }
        }.build()

        val (status, text) = withContext(Dispatchers.IO) {
            client.newCall(request).await().use { response -> response.code to response.body.string() }
        }
        if (status !in 200..299) {
            val refusal = runCatching { ApiTransport.json.decodeFromString(Envelope.serializer(), text).error }.getOrNull()
            throw ApiError(status, refusal?.message ?: "The request failed.", refusal?.code)
        }
        return ApiTransport.json.decodeFromString(output, text)
    }

    /** A whole number is written without a fraction: a limit of 30 is sent as 30, not 30.0. */
    private fun queryText(value: JsonPrimitive): String =
        if (value.isString) value.content else value.doubleOrNull?.takeIf { it % 1.0 == 0.0 }?.toLong()?.toString() ?: value.content

    companion object {
        const val PROOF_HEADER = "X-Operator-Proof"
        private val JSON = "application/json".toMediaType()
    }
}
