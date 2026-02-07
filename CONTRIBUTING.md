# Contributing to OpenThrone Modernization

First off, thank you for considering contributing to the OpenThrone Project. Your help is essential for making this project a success.

## Code of Conduct

This project and everyone participating in it is governed by the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project leaders.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please ensure the bug was not already reported by searching on GitHub under [Issues](https://github.com/your-repo/OpenThrone/issues). If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/your-repo/OpenThrone/issues/new). Be sure to include a **title and clear description**, as much relevant information as possible, and a **code sample** or an **executable test case** demonstrating the expected behavior that is not occurring.

### Suggesting Enhancements

If you have an idea for an enhancement, please open an issue with the "enhancement" label. This allows for a discussion with the community and project maintainers.

### Pull Requests

We welcome pull requests. Please follow these steps to have your contribution considered by the maintainers:

1.  Follow the branch naming conventions.
2.  Make your changes in a new git branch.
3.  Create a pull request.
4.  Ensure the PR description clearly describes the problem and solution. Include the relevant issue number if applicable.
5.  Link the PR to the issue if it resolves one.

## Branch Naming Conventions

To maintain a clean and organized git history, please follow these branch naming conventions.

-   **Features**: `feature/xx-short-description` (e.g., `feature/123-add-queue-system`)
-   **Bugfixes**: `fix/xx-short-description` (e.g., `fix/456-fix-battle-calculation`)
-   **Chores**: `chore/xx-short-description` (e.g., `chore/789-update-dependencies`)
-   **Documentation**: `docs/xx-short-description` (e.g., `docs/101-update-contributing-guide`)

Replace `xx` with the corresponding issue number.

## Development Setup

To get started, clone the repository and install the dependencies.

```bash
git clone https://github.com/your-repo/OpenThrone.git
cd OpenThrone
bun install
```

### Running Tests

To run the test suite, use the following command:

```bash
bun test
```

Please ensure all tests pass before submitting a pull request. If you are adding a new feature or fixing a bug, please add a new test to cover it.

## Coding Style

Please follow the coding style of the project. We use ESLint and Prettier to enforce a consistent style. You can run the linter with `bun lint` and the formatter with `bun format`.

Thank you for your contribution!