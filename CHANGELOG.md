# Change Log

All notable changes to the "Salesforce Tests" extension will be documented in this file.

## [Unreleased]

### Added

- Added typed, cancellable Salesforce CLI services for org discovery, Apex classes, test results, and coverage.
- Added unit tests, opt-in Developer Org integration fixtures, continuous integration, and package-content verification.
- Added explicit trusted-workspace and remote workspace execution behavior.
- Added discovery and execution of individual Apex test methods and Apex test suites.
- Added multi-selection, rerun-last, rerun-failed, and run-all-local test actions.
- Added method-level outcomes and durations to the Apex Tests view.
- Added navigation from code coverage entries to matching local Apex classes.
- Added a five-entry test history persisted locally and separated by Salesforce org.
- Added a configurable minimum coverage threshold and a quick under-covered class filter.
- Added failure details on test items and navigation from Apex stack traces to local source.
- Added creation and deletion of Apex test suites from the sidebar.
- Added an editor action that runs the discovered test methods covering the current Apex class.
- Added affected-test discovery for tracked and untracked local Apex changes in Git workspaces.
- Added local export of current method results as JUnit XML or JSON.
- Added uncovered line details and navigation to the first coverage gap in local Apex source.
- Added an explicit action to run every Apex test in the org, including managed-package tests.
- Added a configurable slow-test warning for completed Apex tests.

### Changed

- All Apex operations now use the username resolved for the current default-org refresh cycle.
- Builds now clean compiled output before packaging, and the VSIX uses a reviewed file list.
- Documentation now covers standalone setup, the default-org model, privacy, remote environments, and troubleshooting.
- Classes with known low coverage are shown first, while unavailable coverage remains clearly separated.
- Apex test command timeouts can be configured from one to sixty minutes.

### Fixed

- Corrected the Salesforce CLI command to `sf apex run test` and removed shell-based execution.
- Test cancellation now terminates the Salesforce CLI process and restores the prior UI state.
- Providers and watchers remain stable across org refreshes and are disposed with the extension lifecycle.
- Missing coverage is displayed as unavailable rather than failed.
- Test timestamps, zero-duration results, blocked executions, structured CLI errors, and incomplete JSON responses are handled safely.
- Long-running suite and test-level executions continue from their asynchronous test-run ID.
- Failed inventory and coverage refreshes now leave every view in a recoverable non-loading state.
- Removed the unused `@salesforce/core` production dependency and its vulnerable transitive packages.

## [0.2.1] - 2025-06-15

### Added

- Added test run info to the output channel.
- Added a button in the notification to view test results in the output channel.

### Changed

- Test run duration is now displayed in a more readable format.
- A mark is now displayed in the tests view when a test fails to run due to an org being blocked.

### Fixed

- The last test run node no longer shows up when no org is connected.
- Changing org now drops the test runs in progress.

---

## [0.2.0] - 2025-06-02

### Added

- Display total lines and covered lines in code coverage view
- Show org-wide code coverage and last test runs in the status view
- Enhanced tooltips and descriptions in the status view
- Show start time and duration for Apex test runs in the tests view
- Enhanced tooltips and descriptions in the tests view

### Changed

- Retrieve code coverage asynchronously for better performance
- Added a button to run test commands directly

### Fixed

- Improved test/class detection and overall performance
- Fixed the find action when panels are still loading
- Various minor bug fixes

---

## [0.1.0] - 2025-05-25

### Added

- Initial release of the Salesforce Tests extension
- Integration with Salesforce CLI using command-line interface
- File system watcher for `.sf/config.json` to detect org changes
- Org Status view displaying connected org
- Apex Tests view displaying all test classes from the connected org
- Code Coverage view displaying Apex classes coverage
- Command to run a specific Apex test class (`salesforce-tests.runTestClass`)
- Visual indicators for test status (running, passed, failed)
- Auto-refresh when switching between Salesforce orgs
- Refresh and find actions

### Changed

_No changes yet_

### Fixed

_No fixes yet_

---

For feedback, issues, or feature requests, please visit the [GitHub repository](https://github.com/femartinezg/salesforce-tests/issues).
