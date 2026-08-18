'use strict';

const fs = require('node:fs');
const path = require('node:path');

const runtimeRoot = requiredEnvironment('SALESFORCE_TESTS_FAKE_ROOT');
const planPath = requiredEnvironment('SALESFORCE_TESTS_FAKE_PLAN');
const logPath = requiredEnvironment('SALESFORCE_TESTS_FAKE_LOG');
const args = process.argv.slice(2);
const operation = identifyOperation(args);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const response = selectResponse(plan, operation, args);

fs.appendFileSync(logPath, `${JSON.stringify({ operation, args })}\n`, 'utf8');

if (!response) {
  process.stderr.write(`No synthetic Salesforce response configured for ${operation}`);
  process.exitCode = 64;
} else if (response.gate) {
  waitForGate(response.gate, () => finish(response));
} else if (response.delayMs) {
  setTimeout(() => finish(response), response.delayMs);
} else {
  finish(response);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function identifyOperation(invocationArgs) {
  if (invocationArgs[0] === 'org' && invocationArgs[1] === 'display') {
    return 'orgInfo';
  }
  if (invocationArgs[0] === 'apex' && invocationArgs[1] === 'test') {
    return 'runTest';
  }
  if (invocationArgs[0] === 'data' && invocationArgs[1] === 'query') {
    const queryIndex = invocationArgs.indexOf('--query');
    const query = queryIndex >= 0 ? invocationArgs[queryIndex + 1] || '' : '';
    if (query.includes('FROM ApexClass')) return 'apexClasses';
    if (query.includes('FROM ApexCodeCoverageAggregate')) return 'codeCoverage';
    if (query.includes('FROM ApexOrgWideCoverage')) return 'orgCoverage';
  }
  return 'unknown';
}

function selectResponse(currentPlan, currentOperation, invocationArgs) {
  if (currentOperation === 'runTest') {
    const testsIndex = invocationArgs.indexOf('--tests');
    const testClassName = testsIndex >= 0 ? invocationArgs[testsIndex + 1] : undefined;
    return testClassName ? currentPlan.testRuns?.[testClassName] : undefined;
  }
  return currentPlan[currentOperation];
}

function waitForGate(gate, onRelease) {
  if (!/^[A-Za-z0-9_-]+$/.test(gate)) {
    throw new Error('Synthetic gate names may contain only letters, digits, underscore, or dash');
  }
  const gatePath = path.join(runtimeRoot, 'gates', gate);
  const deadline = Date.now() + 10000;
  const interval = setInterval(() => {
    if (fs.existsSync(gatePath)) {
      clearInterval(interval);
      onRelease();
    } else if (Date.now() >= deadline) {
      clearInterval(interval);
      process.stderr.write(`Timed out waiting for synthetic gate ${gate}`);
      process.exitCode = 70;
    }
  }, 10);
}

function finish(currentResponse) {
  if (Object.prototype.hasOwnProperty.call(currentResponse, 'stdout')) {
    process.stdout.write(String(currentResponse.stdout));
  } else if (Object.prototype.hasOwnProperty.call(currentResponse, 'json')) {
    process.stdout.write(JSON.stringify(currentResponse.json));
  }
  if (currentResponse.stderr) {
    process.stderr.write(String(currentResponse.stderr));
  }
  process.exitCode = currentResponse.exitCode ?? 0;
}
