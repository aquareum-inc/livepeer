import SwiftUI

/// A tray: one thing, opened by an action, over the screen it came from, which stays visible and dimmed.
/// A fixed header holds the title and one icon. The tray is as tall as what it holds, so each step of a
/// sequence has its own height and the tray resizes between them rather than stacking.
private struct TrayModifier<Item: Identifiable, Body: View>: ViewModifier {
    @Binding var item: Item?
    let title: (Item) -> String
    let destructive: (Item) -> Bool
    let dismissed: () -> Void
    let content: (Item) -> Body

    func body(content base: Content) -> some View {
        base.sheet(item: $item, onDismiss: dismissed) { item in
            TrayFrame(title: title(item), destructive: destructive(item)) { content(item) }
        }
    }
}

private struct TrayFrame<Body: View>: View {
    let title: String
    /// A tray that asks for something that takes away carries the destructive tint, so its stakes show before
    /// a word of it is read.
    var destructive = false
    @ViewBuilder let content: Body
    @State private var headerHeight: CGFloat = 64
    @State private var contentHeight: CGFloat = 256
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var palette
    @Environment(\.motion) private var motion

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).text(.lead, weight: .semibold).foregroundStyle(palette.foreground).accessibilityAddTraits(.isHeader)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(palette.mutedForeground)
                        .frame(width: 30, height: 30)
                        .background(palette.active, in: Circle())
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle(round: true))
                .accessibilityLabel("Close")
            }
            .padding(.leading, 20)
            .padding(.trailing, 8)
            .padding(.top, 10)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }

            // Scrolls only when what it holds is taller than the screen, as at the largest text sizes.
            ScrollView {
                content
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 8)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measured in
                        withAnimation(motion(.layout)) { contentHeight = measured }
                    }
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .presentationDetents([.height(headerHeight + contentHeight)])
        .presentationCornerRadius(Radius.sheet)
        .presentationBackground {
            ZStack {
                palette.panel
                if destructive { palette.destructive.opacity(0.1) }
            }
        }
        // A sheet doesn't inherit the app's tint, so set it again: the cursor and placeholders follow the theme.
        .tint(palette.foreground)
        .presentationDragIndicator(.hidden)
    }
}

extension View {
    /// Presents `item` in a tray. `dismissed` runs however it closes.
    func tray<Item: Identifiable, Body: View>(item: Binding<Item?>, title: @escaping (Item) -> String, destructive: @escaping (Item) -> Bool = { _ in false }, dismissed: @escaping () -> Void = {}, @ViewBuilder content: @escaping (Item) -> Body) -> some View {
        modifier(TrayModifier(item: item, title: title, destructive: destructive, dismissed: dismissed, content: content))
    }
}

/// The one ink action in a view: full width, filled with the primary colour.
struct PrimaryButton: View {
    let label: String
    var busy = false
    let action: () -> Void
    @Environment(\.palette) private var palette
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(label).opacity(busy ? 0 : 1)
                if busy { ProgressView().tint(palette.primaryForeground) }
            }
            .text(.lead, weight: .semibold)
            .foregroundStyle(palette.primaryForeground)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(palette.primary.opacity(enabled ? 1 : 0.4), in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }
}

/// The action in a tray that takes something away: full width, filled with the destructive colour.
struct DestructiveButton: View {
    let label: String
    var busy = false
    let action: () -> Void
    @Environment(\.palette) private var palette
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(label).opacity(busy ? 0 : 1)
                if busy { ProgressView().tint(.white) }
            }
            .text(.lead, weight: .semibold)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(palette.destructiveFill.opacity(enabled ? 1 : 0.4), in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }
}

/// A full-width button that isn't the main action: outlined, on the card colour.
struct SecondaryButton: View {
    let label: String
    var symbol: String?
    let action: () -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let symbol { Image(systemName: symbol).font(.system(size: 17, weight: .medium)) }
                Text(label).text(.lead, weight: .medium)
            }
            .foregroundStyle(palette.foreground)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(palette.card, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.field, style: .continuous).strokeBorder(palette.hairline, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
        }
        .buttonStyle(PressStyle())
    }
}
