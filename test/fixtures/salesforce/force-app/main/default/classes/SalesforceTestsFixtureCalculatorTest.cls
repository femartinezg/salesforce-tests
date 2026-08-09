@IsTest
private class SalesforceTestsFixtureCalculatorTest {
    @IsTest
    static void addsNumbers() {
        System.assertEquals(7, SalesforceTestsFixtureCalculator.add(3, 4));
    }

    @IsTest
    static void subtractsNumbers() {
        System.assertEquals(2, SalesforceTestsFixtureCalculator.subtract(6, 4));
    }
}
