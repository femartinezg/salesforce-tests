# Salesforce integration fixtures

These deliberately namespaced Apex fixtures exercise class discovery, test execution, and coverage against an authenticated non-production org.

Run the opt-in integration test from the repository root:

```sh
SALESFORCE_TEST_ORG=my-dev-org npm run test:org
```

The command deploys the fixtures to the explicit target org before testing. It is not part of the default unit or CI suite and must never target production.
