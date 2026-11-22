import Foundation

/// What is fixed when the app is built: which instance it belongs to. Written by `./livepeer mobile`
/// into Config/Instance.xcconfig. Everything else about the instance is read from it at run time.
nonisolated enum BuildConfig {
    static let instanceURL: URL = {
        guard let text = Bundle.main.object(forInfoDictionaryKey: "InstanceURL") as? String, let url = URL(string: text), url.host() != nil else {
            fatalError("Config/Instance.xcconfig must set INSTANCE_URL to the instance's address.")
        }
        return url
    }()

    /// Which of Apple's push services this build's push token belongs to: `development` for a build run from
    /// Xcode, `production` for one from TestFlight or the App Store. The same value as the entitlement.
    static let alertsEnvironment = (Bundle.main.object(forInfoDictionaryKey: "AlertsEnvironment") as? String) == "development" ? "development" : "production"

    /// This build's version, which the instance can ask to be at least a given one.
    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
}
