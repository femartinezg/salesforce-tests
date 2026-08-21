<!-- TODO(public-docs): Add the final extension icon above the title. -->

# Salesforce Tests

A lightweight, standalone Visual Studio Code extension for running Apex tests and inspecting org-wide and class-level code coverage through Salesforce CLI. It does not require the Salesforce Extension Pack.

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/femartinezg.salesforce-tests)](https://marketplace.visualstudio.com/items?itemName=femartinezg.salesforce-tests)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/femartinezg.salesforce-tests)](https://marketplace.visualstudio.com/items?itemName=femartinezg.salesforce-tests)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Install Salesforce Tests from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=femartinezg.salesforce-tests)**

## Preview

<!-- TODO(public-docs): Replace this placeholder with a screenshot or short GIF showing the Status, Apex Tests, and Code Coverage views in a real Salesforce project. -->

> **Preview placeholder:** A screenshot or short GIF of the extension will be added here.

## Features

- **Run Apex tests:** Browse unmanaged Apex test classes and run them directly from the sidebar.
- **Track test results:** Follow execution states and timings, then rerun recent tests when needed.
- **Inspect code coverage:** Review org-wide and class-level coverage, including covered and total lines.
- **Stay lightweight:** Use your existing Salesforce CLI authentication and org configuration. The Salesforce Extension Pack is not required.

## Requirements

1. [Visual Studio Code](https://code.visualstudio.com/) 1.100.0 or later.
2. [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) available as `sf` in the environment's `PATH`.
3. An authenticated default Salesforce org.

## Installation

Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=femartinezg.salesforce-tests), or use the VS Code command-line interface:

```sh
code --install-extension femartinezg.salesforce-tests
```

## Usage

### Run and rerun Apex tests

- Select the run action beside a class in **Apex Tests**, or use **Salesforce Tests: Run Test Class** from the Command Palette.
- Use a run under **Last Test Runs** to execute that class again.
- Use **Rerun Last Test** from the Apex Tests toolbar or Command Palette to repeat the latest run.
- Clear the in-memory list of up to five recent runs from the **Last Test Runs** row when it is no longer useful.

### Inspect and clear code coverage

- Expand the org shown in **Status** to see org-wide coverage.
- Browse **Code Coverage** for class percentages, covered lines, and total lines.
- Refresh the view after tests or external org changes to retrieve current coverage.
- Use **Clear Code Coverage** when you intentionally need to remove existing coverage data from the selected org.

> **Caution:** Clearing code coverage changes Tooling API coverage records in the selected org. It does not delete Apex classes or tests, but it should only be used when resetting coverage is intentional.

### Pin, find, and refresh classes

- Open a class context menu to pin or unpin it at the top of the current view.
- Pins are stored in VS Code workspace state and are maintained separately for Apex Tests and Code Coverage.
- Use each view's find action to filter the visible list.
- Refresh the org or either class view independently from its toolbar.

## Command Reference

| Action                      | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| **Run Test Class**          | Runs one discovered Apex test class.                                |
| **Rerun Test**              | Runs a class again from an item in test history.                    |
| **Rerun Last Test**         | Repeats the most recent test class run.                             |
| **Clear Test Runs**         | Clears the current in-memory test history.                          |
| **Pin Class / Unpin Class** | Keeps or removes a class at the top of the current view.            |
| **Refresh Org**             | Resolves the default org again and reloads extension data.          |
| **Refresh Apex Tests**      | Reloads discovered unmanaged Apex test classes.                     |
| **Refresh Code Coverage**   | Reloads class-level coverage data.                                  |
| **Clear Code Coverage**     | Clears coverage records in the selected org and refreshes the view. |
| **Find**                    | Filters classes in the focused Apex Tests or Code Coverage view.    |

## Org and Privacy Model

- Salesforce CLI's default org is the source of truth; the extension does not maintain a separate org selector.
- After resolving the org, the extension pins subsequent queries, test runs, and coverage operations to the username shown in **Status** until the org is refreshed.
- Commands and data stay between VS Code, the local Salesforce CLI, and the authenticated Salesforce org. The extension does not add telemetry or send data to another service.
- Pinned class names are stored in local VS Code workspace state.
- The extension is disabled for untrusted workspaces because activation executes Salesforce CLI commands.

## Troubleshooting

- **`sf` is not found:** Run `sf --version` in VS Code's integrated terminal. Install the CLI in the same local or remote environment if it fails.
- **No default org appears:** Run `sf org list`, set one with `sf config set target-org <alias-or-username>`, then refresh the org in the extension.
- **Authentication has expired:** Authenticate the org again with `sf org login web`, then refresh the org.
- **Classes or coverage are missing:** Confirm that the authenticated user can access Apex classes, test results, and code coverage through the Tooling API. Managed-package classes are not listed.
- **The wrong or stale org is shown:** Use **Salesforce Tests: Refresh Org** after changing the Salesforce CLI default org.
- **A test or coverage operation fails:** Open **View → Output**, select **Salesforce Tests**, and inspect the Salesforce CLI error.

## Contributing

Bug reports, feature requests, and pull requests are welcome. Start with the [GitHub Issues](https://github.com/femartinezg/salesforce-tests/issues) page and keep changes focused and tested.

Run the maintained checks before opening a pull request:

```sh
npm ci
npm run compile
npm run lint
npm test
```

`npm test` launches a graphical VS Code Extension Host. In a headless environment, run it through Xvfb:

```sh
xvfb-run -a npm test
```

## Resources

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=femartinezg.salesforce-tests)
- [Change Log](CHANGELOG.md)
- [Issue Tracker](https://github.com/femartinezg/salesforce-tests/issues)

## Author

[Fernando Martinez](https://github.com/femartinezg)

## License

Salesforce Tests is available under the [MIT License](LICENSE).
