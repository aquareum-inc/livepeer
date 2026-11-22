import UIKit
import UserNotifications

/// Alerts on iOS arrive through Apple's push service, with nothing added to the app: the system gives this
/// phone a push token when asked, shows what arrives, and says here what was tapped. A push token is asked for
/// only once the operator turns alerts on. An alert carries a kind and one of three places in the console,
/// and tapping one opens the console's cover and nothing else.
final class SystemPush: NSObject, PushDevice, UNUserNotificationCenterDelegate {
    static let shared = SystemPush()

    /// The console on this phone: asked whether it is open, and told where a tapped alert points.
    weak var console: ConsoleSession?
    /// Whether this build shows the console to whoever is using it: the instance serves nothing else, or they run it.
    var offered: () -> Bool = { false }

    let environment = BuildConfig.alertsEnvironment
    private var waiting: [UUID: CheckedContinuation<String, Error>] = [:]

    /// How long the system is given to answer with a push token before the page says it couldn't.
    private static let patience: Duration = .seconds(10)

    func allowed() async -> Bool? {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .notDetermined: nil
        case .denied: false
        default: true
        }
    }

    func permit() async -> Bool {
        if let allowed = await allowed() { return allowed }
        // Words and the default sound. No badge: the count of what is waiting lives in the console.
        return (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func token() async throws -> String {
        let id = UUID()
        return try await withCheckedThrowingContinuation { continuation in
            waiting[id] = continuation
            UIApplication.shared.registerForRemoteNotifications()
            Task {
                try? await Task.sleep(for: Self.patience)
                waiting.removeValue(forKey: id)?.resume(throwing: PushUnavailable())
            }
        }
    }

    func forget() {
        UIApplication.shared.unregisterForRemoteNotifications()
    }

    /// The system answered with this phone's push token: hex, as the instance sends it to Apple.
    func registered(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        for continuation in waiting.values { continuation.resume(returning: hex) }
        waiting.removeAll()
    }

    func failed() {
        for continuation in waiting.values { continuation.resume(throwing: PushUnavailable()) }
        waiting.removeAll()
    }

    // MARK: What arrives, and what is tapped

    /// An alert arrived with the app in front. With the console open there is no banner: the console reads its
    /// screens again and shows what the alert is about. Otherwise it is shown as it would have been.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        let ours = AlertPlace(payload: notification.request.content.userInfo) != nil
        return await quietly(ours) ? [] : [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let place = AlertPlace(payload: response.notification.request.content.userInfo) else { return }
        await opened(place)
    }

    private func quietly(_ ours: Bool) -> Bool {
        guard ours, let console, console.watching else { return false }
        console.hear()
        return true
    }

    /// A tapped alert brings up the console's cover, which asks for the match, and names where to go after it.
    /// Nothing happens on a phone the console has never been offered to.
    private func opened(_ place: AlertPlace) {
        guard let console, console.enrolled || offered() else { return }
        console.arrive(at: place)
    }
}

/// The two things the system tells an app only through its delegate: this phone's push token, and that
/// notifications have someone to hand taps to before the first screen is drawn.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = SystemPush.shared
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        SystemPush.shared.registered(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        SystemPush.shared.failed()
    }
}
