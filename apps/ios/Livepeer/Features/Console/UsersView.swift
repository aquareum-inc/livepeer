import SwiftUI

/// Everyone who uses the instance, with a search field that is always there. Search runs on the instance.
struct UsersView: View {
    @Bindable var model: UsersModel
    @Environment(\.palette) private var palette

    var body: some View {
        ScrollView {
            TimelineView(.everyMinute) { timeline in
                LazyVStack(alignment: .leading, spacing: 0) {
                    content(now: timeline.date)
                }
                .padding(.bottom, 16)
            }
        }
        .refreshable { await model.load() }
        .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name or id")
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .background(palette.background)
        .navigationTitle("Users")
        .toolbar { ConsoleToolbar() }
        .navigationDestination(for: UserRoute.self) { UserDetailView(model: model, id: $0.id) }
        .sensoryFeedback(.success, trigger: model.changes)
        // A moment after typing stops.
        .task(id: model.query) {
            guard model.phase != .loading else { return }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await model.load()
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        switch model.phase {
        case .loading:
            ForEach(0..<6, id: \.self) { _ in
                UserRow(user: .placeholder, now: now).redacted(reason: .placeholder).breathing()
                rule
            }
            .accessibilityHidden(true)
        case .failed(let message):
            LoadFailure(message: message) { Task { await model.load() } }.padding(.top, 32)
        case .loaded where model.users.isEmpty:
            Text(model.query.trimmingCharacters(in: .whitespaces).isEmpty ? "No one has signed up yet." : "No one matches “\(model.query)”.")
                .text(.lead)
                .foregroundStyle(palette.mutedForeground)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
                .padding(.top, 56)
        case .loaded:
            ForEach(model.users, id: \.actorId) { user in
                NavigationLink(value: UserRoute(id: user.actorId)) { UserRow(user: user, now: now) }
                    .buttonStyle(RowPressStyle())
                rule
            }
        }
    }

    private var rule: some View {
        Rectangle().fill(palette.hairline).frame(height: 1).padding(.leading, 36)
    }
}

/// A user's own page, by their id: the page follows the account as it is suspended or resumed.
struct UserRoute: Hashable { let id: String }

/// One user: their name and when they were last seen, then where the account stands and its id in mono.
struct UserRow: View {
    let user: KnownActor
    let now: Date
    @Environment(\.palette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            StateDot(tone: user.tone == .good ? .quiet : user.tone, lift: 2)
            VStack(alignment: .leading, spacing: 3) {
                if typeSize.isAccessibilitySize {
                    title
                    seen
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        title
                        Spacer(minLength: 0)
                        seen
                    }
                }
                (Text(user.standing).foregroundStyle(standingColour)
                    + Text(" · \(user.actorId)").foregroundStyle(palette.mutedForeground))
                    .text(.caption, mono: true)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                    .truncationMode(.middle)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// Suspended and revoked read in the destructive colour; an ordinary active account is as quiet as its id.
    private var standingColour: Color {
        switch user.tone {
        case .bad: palette.destructive
        case .ink, .active: palette.foreground
        case .good, .quiet: palette.mutedForeground
        }
    }

    private var title: some View {
        Text(user.displayName).text(.lead, weight: .medium).foregroundStyle(palette.foreground).lineLimit(typeSize.isAccessibilitySize ? nil : 1)
    }

    private var seen: some View {
        Text(ConsoleFormat.date(user.lastSeenAt).map { ConsoleFormat.ago($0, now: now) } ?? "never seen").text(.caption, mono: true).foregroundStyle(palette.subtleForeground)
    }
}

extension KnownActor {
    /// Stands in for a row while the list is on its way.
    static let placeholder = KnownActor(applicationId: "", actorId: "usr_0000000000", label: "A person's name", name: nil, allocation: nil, firstSeenAt: nil, lastSeenAt: "2026-01-01T12:00:00Z", provisioned: true)
}

/// One user, and the one thing a phone can do to their account: suspend it, or resume it.
struct UserDetailView: View {
    let model: UsersModel
    let id: String
    @Environment(InstanceStore.self) private var instance
    @Environment(\.palette) private var palette
    @State private var change: ConsoleChange?
    /// The user as they were when the page opened, kept in case a new search no longer lists them.
    @State private var last: KnownActor?

    private var user: KnownActor? { model.user(id) ?? last }

    var body: some View {
        ScrollView {
            if let user {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(user.displayName)
                            .text(.title, weight: .semibold)
                            .foregroundStyle(palette.foreground)
                            .accessibilityAddTraits(.isHeader)
                        HStack(spacing: 8) {
                            StateDot(tone: user.tone)
                            Text(user.standing)
                                .text(.body, weight: .medium)
                                .foregroundStyle(user.tone == .bad ? palette.destructive : palette.foreground)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    ConsoleSection(title: "Account") {
                        FactRow(name: "Id", value: user.actorId, copies: true)
                        if let seen = ConsoleFormat.date(user.lastSeenAt) { RowRule(); FactRow(name: "Last seen", value: ConsoleFormat.moment(seen)) }
                        if let first = ConsoleFormat.date(user.firstSeenAt) { RowRule(); FactRow(name: "First seen", value: ConsoleFormat.moment(first)) }
                        RowRule()
                        FactRow(name: "Application", value: user.applicationId)
                    }
                    if let allocation = user.allocation {
                        ConsoleSection(title: "Allocation") {
                            FactRow(name: "Id", value: allocation.allocationId, copies: true)
                            RowRule()
                            FactRow(name: "Grant", value: allocation.grantId, copies: true)
                            RowRule()
                            FactRow(name: "Currency", value: allocation.currency)
                            if let updated = ConsoleFormat.date(allocation.updatedAt) { RowRule(); FactRow(name: "Changed", value: ConsoleFormat.moment(updated)) }
                        }
                    }
                    if user.canSuspend {
                        Button { change = suspend(user) } label: {
                            Text("Suspend")
                                .text(.lead, weight: .medium)
                                .foregroundStyle(palette.destructive)
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(palette.destructive.opacity(0.4), lineWidth: 1))
                                .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                        }
                        .buttonStyle(PressStyle())
                    } else if user.canResume {
                        PrimaryButton(label: "Resume") { change = resume(user) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .background(palette.background)
        .navigationTitle("User")
        .navigationBarTitleDisplayMode(.inline)
        .changeTray($change)
        .onChange(of: model.user(id), initial: true) { _, current in
            if let current { last = current }
        }
    }

    private func suspend(_ user: KnownActor) -> ConsoleChange {
        ConsoleChange(
            title: "Suspend \(user.displayName)?",
            message: "Their work stops and their phones are signed out. You can resume them at any time.",
            action: "Suspend",
            destructive: true
        ) { try await model.set(user, to: .paused, instance: instance.name) }
    }

    private func resume(_ user: KnownActor) -> ConsoleChange {
        ConsoleChange(
            title: "Resume \(user.displayName)?",
            message: "They can sign in and run work again.",
            action: "Resume",
            destructive: false
        ) { try await model.set(user, to: .active, instance: instance.name) }
    }
}
