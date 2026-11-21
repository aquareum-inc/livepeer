import SwiftUI

/// The instance this build belongs to, as it describes itself: name, marks, theme, what it serves.
/// Shown from the last copy at once, then refreshed, so the theme never flashes.
@Observable
final class InstanceStore {
    /// Whether this build can be used with the instance right now.
    enum Availability: Equatable {
        case available
        /// The instance doesn't serve phones, or doesn't list this app.
        case notOffered
        /// The instance needs a newer build than this one.
        case updateRequired
    }

    private(set) var description: InstanceDescription?
    /// False only on a first launch that hasn't heard from the instance yet: there is nothing to show until it
    /// says whether it serves the app, the console or both.
    private(set) var settled = false
    private(set) var symbol: VectorMark?
    private let api: API
    private let defaults: UserDefaults
    private static let cacheKey = "instance.description"
    private static let symbolKey = "instance.symbol.svg"

    init(api: API, defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.cacheKey) {
            description = try? JSONDecoder().decode(InstanceDescription.self, from: data)
        }
        if let svg = defaults.string(forKey: Self.symbolKey) { symbol = VectorMark(svg: svg) }
        settled = description != nil
    }

    /// The instance serves its console to phones and not its app: this build is the console and nothing else.
    var consoleOnly: Bool {
        description.map(Self.consoleOnly) ?? false
    }

    static func consoleOnly(_ description: InstanceDescription) -> Bool {
        description.surfaces.mobileConsole && !description.surfaces.mobile
    }

    /// The instance's name; before the first answer, the name the app was built with.
    var name: String {
        description?.name ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String) ?? ""
    }

    /// Before the first answer the app is usable: it can't know otherwise, and the first request will tell.
    var availability: Availability {
        guard let description else { return .available }
        return Self.availability(of: description, bundleID: Bundle.main.bundleIdentifier ?? "", version: BuildConfig.version)
    }

    static func availability(of description: InstanceDescription, bundleID: String, version: String) -> Availability {
        // The app and the console each have their own switch; either one is a reason for this build to exist.
        guard description.surfaces.mobile || description.surfaces.mobileConsole, let app = description.mobile.ios, app.bundleId.lowercased() == bundleID.lowercased() else { return .notOffered }
        if let minimum = app.minimumVersion, version.compare(minimum, options: .numeric) == .orderedAscending { return .updateRequired }
        return .available
    }

    func palette(for scheme: ColorScheme) -> Palette {
        let overrides = scheme == .dark ? description?.theme.dark : description?.theme.light
        return .resolved(for: scheme, overrides: overrides ?? [:])
    }

    /// Reads the description again. A failure keeps the last copy: the app stays usable offline.
    func refresh() async {
        defer { settled = true }
        guard let fresh = try? await api.getInstance() else { return }
        description = fresh
        defaults.set(try? JSONEncoder().encode(fresh), forKey: Self.cacheKey)
        await loadSymbol(from: fresh.logo.symbol)
    }

    private func loadSymbol(from address: String?) async {
        guard let address, let url = URL(string: address), url.pathExtension.lowercased() == "svg",
              let (data, _) = try? await URLSession.shared.data(from: url),
              let svg = String(data: data, encoding: .utf8), let mark = VectorMark(svg: svg)
        else {
            symbol = nil
            defaults.removeObject(forKey: Self.symbolKey)
            return
        }
        symbol = mark
        defaults.set(svg, forKey: Self.symbolKey)
    }
}
