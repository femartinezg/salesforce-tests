# Salesforce Tests

A lightweight, standalone Visual Studio Code extension for running Apex tests and inspecting org-wide and class-level code coverage through Salesforce CLI. It does not require the Salesforce Extension Pack.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Commands](#commands)
- [Settings](#settings)
- [Org and Privacy Model](#org-and-privacy-model)
- [Troubleshooting](#troubleshooting)
- [Recent Changes](#recent-changes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Author](#author)
- [License](#license)

## Features

This extension adds a dedicated Salesforce Tests view to VS Code's Activity Bar, allowing you to:

- **Discover Apex tests**: Browse unmanaged test classes, their individual test methods, and Apex test suites from the connected org.
- **Choose the right scope**: Run a class, a method, a suite, a multi-selection, failed tests, all local tests, or every test in the org.
- **Rerun quickly**: Rerun the most recent class, method, or suite directly from the status panel.
- **Inspect results**: See running, passed, failed, blocked, slow, and recently flaky states together with individual method outcomes and durations.
- **Act on code coverage**: Review org-wide and class-level coverage, with low-coverage classes shown first and navigation to matching local Apex source.
- **Stay lightweight**: Use Salesforce CLI directly without installing the Salesforce Extension Pack.

## Requirements

To use this extension, you need:

1. **Visual Studio Code**: Version 1.100.0 or higher
2. **Salesforce CLI (`sf`)**: Must be installed and available in the environment's `PATH`
3. **Authenticated Salesforce org**: The CLI must have an authenticated default org

The extension runs where the VS Code workspace runs. For SSH, Dev Containers, and Codespaces, install and authenticate Salesforce CLI in that remote environment.

## Installation

1. Install the extension from the VS Code Marketplace.
2. Install [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) if it is not already available.

## Quick Start

Authenticate an org and set it as the default for your Salesforce project:

```sh
sf org login web --alias my-org
sf config set target-org my-org
```

Open that project in VS Code and select the Salesforce Tests icon in the Activity Bar. The Status view shows which org the extension resolved.

## Usage

1. Open the Salesforce Tests view by clicking the test tube icon in the Activity Bar.
2. View your authenticated org information in the Status section, including org-wide code coverage and last test runs.
3. Browse available classes, methods, and suites in the Apex Tests section.
4. Use the inline run button for one test, or the view actions to select several tests, rerun failures, or run all local tests.
5. View test results with visual indicators:
   - ⏳ Running: Test is currently executing
   - ✅ Passed: Test completed successfully
   - ❌ Failed: Test failed
6. See code coverage details, including total and covered lines, in the Code Coverage section. Classes with known low coverage appear first; use the inline action to open matching source in the workspace.
7. Hover over items for enhanced tooltips and additional information.

## Commands

The extension contributes the following commands:

- `Salesforce Tests: Run Test Class`: Execute a specific Apex test class
- `Salesforce Tests: Run Test Method`: Execute one method from an Apex test class
- `Salesforce Tests: Run Test Suite`: Execute an Apex test suite
- `Salesforce Tests: Create Test Suite`: Create an org test suite from selected Apex test classes
- `Salesforce Tests: Delete Test Suite`: Delete a test suite without deleting its test classes
- `Salesforce Tests: Run Selected Tests`: Choose and execute multiple classes or methods
- `Salesforce Tests: Rerun Last Test`: Repeat the most recent class, method, or suite
- `Salesforce Tests: Rerun Failed Tests`: Execute the failed methods from the current results again
- `Salesforce Tests: Run All Local Tests`: Execute all local Apex tests in the org
- `Salesforce Tests: Run All Tests in Org`: Execute every Apex test, including managed-package tests
- `Salesforce Tests: Run Tests Covering Current Class`: Use org coverage data to run methods that cover the open Apex class
- `Salesforce Tests: Run Tests Affected by My Changes`: Combine Git changes with org coverage to run relevant methods, including changed test classes
- `Salesforce Tests: Open Apex Class`: Open the matching local class at its first uncovered line when coverage details are available
- `Salesforce Tests: Open Test Failure`: Open the first local Apex stack location for a failed test
- `Salesforce Tests: Export Test Results`: Save the currently visible method results as JUnit XML or JSON
- `Salesforce Tests: Refresh Org`: Refresh the current Salesforce org connection and reload org data
- `Salesforce Tests: Refresh Apex Tests`: Reload available unmanaged Apex test classes
- `Salesforce Tests: Refresh Code Coverage`: Reload class and org-wide coverage
- `Salesforce Tests: Show Classes Below Coverage Threshold`: Filter the coverage view to actionable classes
- `Salesforce Tests: Show All Coverage`: Clear the coverage filter

Suite names must begin with a letter and contain only letters, numbers, spaces, underscores, or hyphens. Creating and deleting suites changes `ApexTestSuite` and `TestSuiteMembership` records in the selected Developer Org, sandbox, or scratch org.

The covering-tests and affected-tests commands use the org's latest `ApexCodeCoverage` records. The affected-tests command examines tracked and untracked `.cls` and `.trigger` files reported by Git. Run the relevant tests or refresh coverage when that data is stale; the extension cannot infer coverage for local code that has not been deployed.

## Settings

- `salesforceTests.coverage.minimum` (default `75`): Minimum acceptable class coverage. It controls the failed color and the under-covered class filter.
- `salesforceTests.test.timeoutMinutes` (default `10`): Maximum time allowed for each cancellable Salesforce CLI test command.
- `salesforceTests.test.slowThresholdMilliseconds` (default `5000`): Duration at which a completed test is marked as slow. Set it to `0` to disable the warning.

## Org and Privacy Model

- Salesforce CLI's default org is the sole source of truth; the extension does not maintain a separate org selector.
- At activation or refresh, the extension resolves the default org's username and pins every query and test command in that cycle to it.
- Changing the default org configuration triggers a refresh.
- Commands and data stay local between VS Code, Salesforce CLI, and the authenticated org. The extension does not add telemetry or send data to another service.
- The five most recent test selectors and the ten most recent pass/fail and duration samples per discovered method are stored in VS Code extension storage, separated by org username.
- The extension is disabled for untrusted workspaces because activation executes the local Salesforce CLI.

## Troubleshooting

- **`sf` is not found:** run `sf --version` from VS Code's integrated terminal. Install the CLI in the same local or remote environment if the command fails.
- **No default org:** run `sf org list`, then `sf config set target-org <alias-or-username>` from the Salesforce project.
- **Authentication expired:** authenticate the org again with `sf org login web` and refresh the Status view.
- **Classes or coverage are missing:** verify the authenticated user can use the Tooling API and access Apex classes, test results, and code coverage. Managed-package classes are not currently listed.
- **A test cannot run:** open the Salesforce Tests output channel for the structured CLI error, then verify org permissions and deployment/test activity in Salesforce.

## Recent Changes

**v0.2.1** – Added test run info to the output channel, improved test run duration readability, and fixed issues related to org connection and test runs.

**v0.2.0** – Enhanced performance, added total and covered lines in code coverage, improved test run information, and various UI/UX enhancements.

**v0.1.0** – Initial release with test discovery, execution functionality, and code coverage visualization.

For a complete history of changes, see the [CHANGELOG](CHANGELOG.md).

## Roadmap

Planned direction:

### Core Features

- ✅ Add functionality to run Apex tests
- ✅ Add code coverage visualization
- ✅ Add support to run individual Apex test methods
- ✅ Add test suite functionality (group test runs)
- ✅ Add rerun, failed-test, selection, and local-test actions
- ✅ Add persistent test history per org
- ⏳ Add slow/flaky-test insights (slow warnings and recent flaky-method detection are available; trends are planned)
- ✅ Add tests affected by local source changes

_Legend: ✅ Completed | ⏳ In Progress | ⬜ Planned_

## Contributing

Contributions are welcome and appreciated! Here's how you can contribute:

1. **Report Issues**: Found a bug or have a feature request? Open an issue on the [GitHub repository](https://github.com/femartinezg/salesforce-tests/issues).
2. **Submit Pull Requests**: Have a fix or new feature to contribute? Submit a pull request with your changes.
3. **Provide Feedback**: Use the extension and let us know how it works for you and what could be improved.

Please follow the existing code style and include appropriate tests for your changes.

---

## Author

[Fernando Martinez](https://github.com/femartinezg)

## License

This extension is licensed under the [MIT License](LICENSE).

**Enjoy testing your Salesforce code!**
