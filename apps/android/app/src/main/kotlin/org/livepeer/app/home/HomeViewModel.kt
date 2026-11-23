package org.livepeer.app.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import org.livepeer.app.account.Account
import org.livepeer.app.api.ApiError
import org.livepeer.app.composer.ComposerSupport
import org.livepeer.app.generated.Api
import org.livepeer.app.generated.Conversation
import org.livepeer.app.generated.PromptStarter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class Phase { Loading, Loaded, Failed }

data class HomeState(
    val phase: Phase = Phase.Loading,
    val starters: List<PromptStarter> = emptyList(),
    val draft: Draft = Draft(),
    val sending: Boolean = false,
    /** Why the last send didn't go through, in words for the user. */
    val sendError: String? = null,
)

class HomeViewModel(private val api: Api, account: Account, composer: ComposerSupport) : ViewModel() {
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state

    init {
        load()
        // Again on signing in or out: what loaded with an old session may have been refused.
        viewModelScope.launch { account.signedIn.drop(1).collect { refresh() } }
        // A character cast from their page arrives in the composer, ready for a scene.
        viewModelScope.launch {
            composer.pendingCast.filterNotNull().collect { character ->
                _state.update { it.copy(draft = composer.cast(character, it.draft)) }
                composer.pendingCast.value = null
            }
        }
    }

    fun load() = viewModelScope.launch { refresh() }

    suspend fun refresh() {
        _state.update { if (it.phase == Phase.Failed) it.copy(phase = Phase.Loading) else it }
        try {
            val starters = api.listPromptStarters()
            _state.update { it.copy(phase = Phase.Loaded, starters = starters) }
        } catch (error: Exception) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            _state.update { if (it.starters.isEmpty()) it.copy(phase = Phase.Failed) else it }
        }
    }

    fun setDraft(draft: Draft) = _state.update { it.copy(draft = draft) }

    /**
     * Starts a conversation from a starting point. Its name is the whole request: the agent asks for the
     * rest before it makes anything. What is in the composer stays there.
     */
    fun start(starter: PromptStarter, onOpen: (Conversation) -> Unit) {
        val draft = _state.value.draft
        create(Draft(prompt = starter.label, app = starter.app, aspect = draft.aspect, durationSeconds = draft.durationSeconds, model = draft.model), clears = false, onOpen)
    }

    fun send(onOpen: (Conversation) -> Unit) {
        val draft = _state.value.draft
        if (draft.canSend) create(draft, clears = true, onOpen)
    }

    private fun create(request: Draft, clears: Boolean, onOpen: (Conversation) -> Unit) {
        if (_state.value.sending) return
        _state.update { it.copy(sending = true, sendError = null) }
        viewModelScope.launch {
            try {
                val conversation = api.createConversation(
                    text = request.text,
                    app = request.app,
                    aspect = request.aspect,
                    durationSeconds = request.durationSeconds.toDouble(),
                    attachmentIds = request.attachments.map { it.id }.ifEmpty { null },
                    agentModel = request.model,
                    characterSlug = request.cast?.slug,
                )
                _state.update { it.copy(sending = false, draft = if (clears) Draft() else it.draft) }
                onOpen(conversation)
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                val message = if (error is ApiError && error.isSignedOut) "Sign in to send a request." else "That didn't send. Check your connection and try again."
                _state.update { it.copy(sending = false, sendError = message) }
            }
        }
    }
}
