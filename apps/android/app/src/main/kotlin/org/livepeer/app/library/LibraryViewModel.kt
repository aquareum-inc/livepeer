package org.livepeer.app.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import org.livepeer.app.account.Account
import org.livepeer.app.generated.Api
import org.livepeer.app.generated.Conversation
import org.livepeer.app.generated.MediaItem
import org.livepeer.app.generated.MediaKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LibraryState(
    val signedIn: Boolean = false,
    val loading: Boolean = true,
    val failed: Boolean = false,
    val items: List<MediaItem> = emptyList(),
    /** What is on screen, in words: "a runner at night", "harbour". */
    val query: String = "",
    /** One type, or every type with null. */
    val kind: MediaKind? = null,
    /** Set while a new search is under way, so the grid can dim instead of emptying. */
    val searching: Boolean = false,
    /** Why the last change didn't go through, in words for the person. */
    val actionError: String? = null,
) {
    val filtered: Boolean get() = query.isNotBlank() || kind != null
}

/** The person's library: what matches the search and the type, newest first. */
@OptIn(FlowPreview::class)
class LibraryViewModel(private val api: Api, account: Account) : ViewModel() {
    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state
    private val search = MutableStateFlow("" to (null as MediaKind?))

    init {
        viewModelScope.launch {
            // A moment after typing stops, and again whenever someone signs in or starts working in another account.
            combine(account.signedIn, search.debounce(220), account.accountEpoch) { signedIn, filter, _ -> signedIn to filter }.collect { (signedIn, filter) ->
                _state.update { it.copy(signedIn = signedIn) }
                if (signedIn) run(filter.first, filter.second) else _state.update { LibraryState(signedIn = false) }
            }
        }
    }

    fun setQuery(query: String) {
        _state.update { it.copy(query = query) }
        search.value = query to _state.value.kind
    }

    fun setKind(kind: MediaKind?) {
        _state.update { it.copy(kind = kind) }
        search.value = _state.value.query to kind
    }

    suspend fun refresh() = run(_state.value.query, _state.value.kind)

    private suspend fun run(query: String, kind: MediaKind?) {
        _state.update { it.copy(searching = true) }
        try {
            val items = api.searchLibrary(query = query.trim().ifEmpty { null }, kind = kind?.value)
            _state.update { it.copy(loading = false, failed = false, searching = false, items = items) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            _state.update { it.copy(loading = false, searching = false, failed = it.items.isEmpty()) }
        }
    }

    fun retry() = viewModelScope.launch { refresh() }

    /** Deletes an item. It leaves the grid at once and comes back if the instance refuses. */
    fun delete(item: MediaItem) {
        val before = _state.value.items
        _state.update { it.copy(items = before - item, actionError = null) }
        viewModelScope.launch {
            try {
                api.deleteMedia(item.id)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.update { it.copy(items = before, actionError = "“${item.title}” wasn't deleted. Try again.") }
            }
        }
    }

    /** Starts a conversation about an item: the agent watches it, summarises it and lists its moments. */
    suspend fun ask(item: MediaItem): Conversation? = try {
        _state.update { it.copy(actionError = null) }
        api.createConversation(
            text = "Summarise “${item.title}” from my library and list the key moments with timestamps.",
            aspect = item.aspect.value,
            durationSeconds = item.durationSeconds ?: 5.0,
            attachmentIds = listOf(item.id),
        )
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        _state.update { it.copy(actionError = "That didn't start. Check your connection and try again.") }
        null
    }

    companion object {
        /** The words to start from in the studio: the prompt that made it, or what is in it. */
        fun studioPrompt(item: MediaItem): String = item.prompt ?: item.description
    }
}
