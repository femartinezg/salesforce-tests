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

## Actions

Actions are available from view toolbars, row menus, and the Command Palette where applicable.

- **Run or rerun** Apex test classes.
- **Pin or unpin** classes in the Apex Tests and Code Coverage views.
- **Find classes**, **refresh extension data**, and **clear recent test runs**.
- **Clear code coverage data** from the selected org.

## Privacy

Salesforce Tests does not add telemetry. Commands and data stay between VS Code, the local Salesforce CLI, and the authenticated Salesforce org.

## Troubleshooting

- **The extension is unavailable in Restricted Mode:** Trust the workspace because Salesforce Tests runs local Salesforce CLI commands.
- **`sf` is not found:** Run `sf --version` in VS Code's integrated terminal. Install the CLI in the same local or remote environment if it fails.
- **No default org appears:** Run `sf org list`, set one with `sf config set target-org <alias-or-username>`, then refresh the org in the extension.
- **Authentication has expired:** Authenticate the org again with `sf org login web`, then refresh the org.
- **Classes or coverage are missing:** Confirm that the authenticated user can access Apex classes, test results, and code coverage through the Tooling API. Managed-package classes are not listed.
- **The wrong or stale org is shown:** Use **Salesforce Tests: Refresh Org** after changing the Salesforce CLI default org.
- **A test or coverage operation fails:** Open **View → Output**, select **Salesforce Tests**, and inspect the Salesforce CLI error.

## Resources

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=femartinezg.salesforce-tests)
- [Changelog](CHANGELOG.md)
- [Report an issue](https://github.com/femartinezg/salesforce-tests/issues)

## Author

[Fernando Martinez](https://github.com/femartinezg)

## License

Salesforce Tests is available under the [MIT License](LICENSE).
