# Change Log

All notable changes to the "Salesforce Tests" extension will be documented in this file.

## [Unreleased]

---

## [0.3.0] - 2026-08-23

### Added

- Apex test and code coverage classes can now be pinned from their context menus; pinned rows use a status-colored pin icon and remain independently pinned per workspace when switching Salesforce orgs.
- Recent Apex test runs can now be cleared or rerun, including rerunning the latest test from the Apex Tests view.
- Code coverage data can now be cleared from the selected Salesforce org.

### Changed

- Salesforce CLI commands are now executed directly without a shell and with validated arguments.
- All Salesforce CLI operations are now pinned to the org displayed by the extension for the current lifecycle.
- The extension now requires a trusted workspace and remains disabled in VS Code Restricted Mode.
- Removed the unused `@salesforce/core` runtime dependency, eliminating known production dependency vulnerabilities.

### Fixed

- Salesforce CLI JSON responses are now validated before updating extension state.
- Malformed or incompatible Salesforce CLI responses now fail safely without partially updating views or test results.
- Partial Apex inventories now keep valid classes and show a single warning for discarded invalid records.
- If the displayed org becomes unavailable, operations now fail explicitly instead of silently falling back to another default org.

---

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
