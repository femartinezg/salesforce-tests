# Salesforce Tests

A Visual Studio Code extension that provides an integrated environment for running and managing Salesforce Apex test classes directly from your editor.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [Recent Changes](#recent-changes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Author](#author)
- [License](#license)

## Features

This extension adds a dedicated Salesforce Tests view to VS Code's Activity Bar, allowing you to:

- **View all Apex test classes**: Browse and discover all test classes available in your connected Salesforce org.
- **Run tests with a single click**: Execute Apex test classes directly from the sidebar with real-time feedback on test status.
- **Visual test results**: Tests display with clear visual indicators showing their status (running, passed, or failed).
- **View Code Coverage**: Instantly see code coverage metrics for your Apex classes, including total and covered lines, directly in the sidebar.
- **Display info about test runs**: Check org-wide code coverage, last test runs, start time, duration, and more directly from the panel.

## Requirements

To use this extension, you need:

1. **Visual Studio Code**: Version 1.100.0 or higher
2. **Salesforce CLI**: Must be installed and available in your PATH
3. **Authenticated Salesforce org**: You must be authenticated to a Salesforce org using the Salesforce CLI

## Installation

1. Install the extension from the VS Code Marketplace.
2. Ensure you have the Salesforce CLI installed.

## Usage

1. Open the Salesforce Tests view by clicking the test tube icon in the Activity Bar.
2. View your authenticated org information in the Status section, including org-wide code coverage and last test runs.
3. Browse available test classes in the Apex Tests section.
4. Click on the run button for quick execution.
5. View test results with visual indicators:
   - ⏳ Running: Test is currently executing
   - ✅ Passed: Test completed successfully
   - ❌ Failed: Test failed
6. See code coverage details, including total and covered lines, in the Code Coverage section.
7. Hover over items for enhanced tooltips and additional information.

## Commands

The extension contributes the following commands:

- `Salesforce Tests: Run Test Class`: Execute a specific Apex test class
- `Salesforce Tests: Refresh Org`: Refresh the current Salesforce org connection and reload org data

## Recent Changes

**v0.2.1** – Added test run info to the output channel, improved test run duration readability, and fixed issues related to org connection and test runs.

**v0.2.0** – Enhanced performance, added total and covered lines in code coverage, improved test run information, and various UI/UX enhancements.

**v0.1.0** – Initial release with test discovery, execution functionality, and code coverage visualization.

For a complete history of changes, see the [CHANGELOG](CHANGELOG.md).

## Roadmap

This extension is actively being developed. Here's what we're planning:

### Core Features

- ✅ Add functionality to run Apex tests
- ✅ Add code coverage visualization
- ⏳ Add support to run individual Apex test methods
- ⬜ Add test suite functionality (group test runs)
- ⬜ Add rerun tests functionality

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
