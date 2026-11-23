import SwiftUI

/// Press feedback: text buttons settle to 0.97, round ones to 0.92.
struct PressStyle: ButtonStyle {
    var round = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? (round ? 0.92 : 0.97) : 1)
            .opacity(configuration.isPressed && reduceMotion ? 0.7 : 1)
            .animation(.exit, value: configuration.isPressed)
    }
}

/// Liquid glass for controls that sit over footage. It is the system's own glass, the tab bar's, where
/// the phone has it; before that, a see-through fill, a blur and a bright edge.
private struct Glass<S: InsettableShape>: ViewModifier {
    let shape: S
    @Environment(\.palette) private var palette

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content
                .background(.ultraThinMaterial, in: shape)
                .background(palette.glassFill, in: shape)
                .overlay(shape.strokeBorder(palette.glassEdge, lineWidth: 1))
                // Depth, so glass holds its edge on a pale page; on a dark one the shadow is lost in it, as intended.
                .overlay(shape.strokeBorder(palette.hairline, lineWidth: 1))
                .shadow(color: .black.opacity(0.1), radius: 14, y: 8)
        }
    }
}

extension View {
    func glass<S: InsettableShape>(in shape: S) -> some View { modifier(Glass(shape: shape)) }
}

/// A pill that selects something. Never the primary action.
struct Chip: View {
    let label: String
    var symbol: String?
    var selected = false
    var mono = false
    let action: () -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol).imageScale(.small) }
                Text(label).text(.body, weight: .medium, mono: mono)
            }
            .foregroundStyle(selected ? palette.foreground : palette.foreground.opacity(0.85))
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .glass(in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? palette.foreground.opacity(0.45) : .clear, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Opacity that breathes while something is in progress. Still, at full strength, with Reduce Motion.
private struct Breathe: ViewModifier {
    let active: Bool
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(active && !reduceMotion && dim ? 0.55 : 1)
            .onChange(of: active, initial: true) { _, isActive in
                guard isActive, !reduceMotion else { dim = false; return }
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { dim = true }
            }
    }
}

extension View {
    func breathing(_ active: Bool = true) -> some View { modifier(Breathe(active: active)) }
}

/// What a screen shows when its data didn't load.
struct LoadFailure: View {
    let message: String
    let retry: () -> Void
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(spacing: 12) {
            Text(message)
                .text(.body)
                .foregroundStyle(palette.mutedForeground)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .text(.body, weight: .medium)
                .foregroundStyle(palette.foreground)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(palette.card, in: Capsule())
                .overlay(Capsule().strokeBorder(palette.border, lineWidth: 1))
                .buttonStyle(PressStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}
