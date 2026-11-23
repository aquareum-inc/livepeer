import XCTest

/// The main flows, against a mock-only instance: what a guest can do, and what a signed-in person does most.
@MainActor
final class MainFlowsTests: XCTestCase {
    private let app = XCUIApplication()

    private func launch(signedIn: Bool) throws {
        continueAfterFailure = false
        app.launchEnvironment["LIVEPEER_UI_TEST_SESSION"] = signedIn ? try Instance.signIn() : "signed-out"
        app.launch()
    }

    /// How long a screen may take to appear. A busy CI machine can take most of a minute to answer one request,
    /// and a wait ends as soon as the element is there, so this costs nothing when things are quick.
    private let patience: TimeInterval = 60

    private func tab(_ name: String) -> XCUIElement { app.buttons[name].firstMatch }

    /// Generate reads its price with it, as in "Generate, 55 credits".
    private var generate: XCUIElement { app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Generate")).firstMatch }

    func testAGuestBrowsesAndIsAskedToSignInAtGenerate() throws {
        try launch(signedIn: false)
        XCTAssertTrue(app.staticTexts["Direct anything."].waitForExistence(timeout: patience))

        tab("Studio").tap()
        XCTAssertTrue(app.buttons["Video"].waitForExistence(timeout: patience))
        let prompt = app.textFields["Prompt"]
        XCTAssertTrue(prompt.waitForExistence(timeout: patience))
        prompt.tap()
        prompt.typeText("A paper boat drifting down a rain-soaked street")
        generate.tap()
        XCTAssertTrue(app.staticTexts["Sign in to generate. Your draft stays here."].waitForExistence(timeout: patience))
    }

    func testGeneratingInTheStudioRendersAShot() throws {
        try launch(signedIn: true)
        tab("Studio").tap()
        let prompt = app.textFields["Prompt"]
        XCTAssertTrue(prompt.waitForExistence(timeout: patience))
        prompt.tap()
        prompt.typeText("A lighthouse at dusk, slow push in")
        generate.tap()
        let shot = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Shot: A lighthouse at dusk, slow push in")).firstMatch
        XCTAssertTrue(shot.waitForExistence(timeout: patience))
    }

    func testTheLibraryAndACharacterOpen() throws {
        try launch(signedIn: true)
        tab("Library").tap()
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: patience))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", ", video")).firstMatch.waitForExistence(timeout: patience))

        tab("Characters").tap()
        XCTAssertTrue(app.navigationBars["Characters"].waitForExistence(timeout: patience))
        let character = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Mara")).firstMatch
        XCTAssertTrue(character.waitForExistence(timeout: patience))
        character.tap()
        XCTAssertTrue(app.buttons["More"].waitForExistence(timeout: patience))
    }

    func testSettingsShowThePlanAndCredits() throws {
        try launch(signedIn: true)
        let accountButton = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Account, ")).firstMatch
        XCTAssertTrue(accountButton.waitForExistence(timeout: patience))
        accountButton.tap()
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: patience))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "credits")).firstMatch.waitForExistence(timeout: patience))
    }

    func testSwitchingToAWorkspaceAndBack() throws {
        try launch(signedIn: true)
        let labelled = { (format: String, text: String) in self.app.buttons.matching(NSPredicate(format: format, text)).firstMatch }
        let accountButton = labelled("label BEGINSWITH %@", "Account, ")
        XCTAssertTrue(accountButton.waitForExistence(timeout: patience))
        accountButton.tap()

        // The development user is an admin of the seeded workspace.
        let workspace = labelled("label BEGINSWITH %@", "Northlight Studio, workspace")
        XCTAssertTrue(workspace.waitForExistence(timeout: patience))
        workspace.tap()

        // The tray closes, and the account button says where the app is working now.
        let inWorkspace = labelled("label CONTAINS %@", "working in Northlight Studio")
        XCTAssertTrue(inWorkspace.waitForExistence(timeout: patience))
        tab("Library").tap()
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: patience))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", ", video")).firstMatch.waitForExistence(timeout: patience))

        labelled("label CONTAINS %@", "working in Northlight Studio").tap()
        let personal = labelled("label CONTAINS %@", "personal account")
        XCTAssertTrue(personal.waitForExistence(timeout: patience))
        personal.tap()
        XCTAssertTrue(inWorkspace.waitForNonExistence(timeout: patience))
    }

    func testJoiningAWorkspaceFromAnInvitation() throws {
        try launch(signedIn: true)
        let labelled = { (format: String, text: String) in self.app.buttons.matching(NSPredicate(format: format, text)).firstMatch }
        let accountButton = labelled("label BEGINSWITH %@", "Account, ")
        XCTAssertTrue(accountButton.waitForExistence(timeout: patience))
        accountButton.tap()

        // The development user has one invitation waiting. Declining it would leave the next run without one,
        // and joining can't be undone from a phone, so this reads the invitation and closes it.
        let invitation = labelled("label BEGINSWITH %@", "Invitation to Harbour Films")
        XCTAssertTrue(invitation.waitForExistence(timeout: patience))
        invitation.tap()
        XCTAssertTrue(labelled("label BEGINSWITH %@", "Join Harbour Films").waitForExistence(timeout: patience))
        XCTAssertTrue(app.buttons["Decline"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "You'll be a member")).firstMatch.exists)
        app.buttons["Close"].firstMatch.tap()
    }
}
