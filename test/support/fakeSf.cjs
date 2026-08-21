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
  if (
    invocationArgs[0] === 'api'
    && invocationArgs[1] === 'request'
    && invocationArgs[2] === 'rest'
    && invocationArgs[3]?.endsWith('/tooling/composite')
  ) {
    const requests = compositeRequests(invocationArgs);
    const firstUrl = requests?.[0]?.url;
    if (typeof firstUrl !== 'string') return 'unknown';
    if (firstUrl.includes('/tooling/sobjects/ApexCodeCoverageAggregate/')) {
      return 'deleteCoveredAggregateBatch';
    }
    if (firstUrl.includes('/tooling/sobjects/ApexCodeCoverage/')) {
      return 'deleteCodeCoverageBatch';
    }
    return 'unknown';
  }
  if (invocationArgs[0] === 'data' && invocationArgs[1] === 'query') {
    const queryIndex = invocationArgs.indexOf('--query');
    const query = queryIndex >= 0 ? invocationArgs[queryIndex + 1] || '' : '';
    if (query.includes('FROM ApexClass')) return 'apexClasses';
    if (query === 'SELECT Id FROM ApexCodeCoverage') return 'codeCoverageRecordIds';
    if (query === 'SELECT Id FROM ApexCodeCoverageAggregate WHERE NumLinesCovered > 0') {
      return 'coveredAggregateRecordIds';
    }
    if (query === 'SELECT Id FROM ApexOrgWideCoverage') return 'orgCoverageRecordIds';
    if (query.includes('FROM ApexCodeCoverageAggregate')) return 'codeCoverage';
    if (query.includes('FROM ApexOrgWideCoverage')) return 'orgCoverage';
  }
  if (
    invocationArgs[0] === 'data'
    && invocationArgs[1] === 'delete'
    && invocationArgs[2] === 'record'
  ) {
    const sobjectIndex = invocationArgs.indexOf('--sobject');
    const sobject = sobjectIndex >= 0 ? invocationArgs[sobjectIndex + 1] : undefined;
    if (sobject === 'ApexCodeCoverage') return 'deleteCodeCoverage';
    if (sobject === 'ApexCodeCoverageAggregate') return 'deleteCoveredAggregate';
  }
  if (
    invocationArgs[0] === 'data'
    && invocationArgs[1] === 'update'
    && invocationArgs[2] === 'record'
  ) {
    const sobjectIndex = invocationArgs.indexOf('--sobject');
    const sobject = sobjectIndex >= 0 ? invocationArgs[sobjectIndex + 1] : undefined;
    if (sobject === 'ApexOrgWideCoverage') return 'updateOrgCoverage';
  }
  return 'unknown';
}

function selectResponse(currentPlan, currentOperation, invocationArgs) {
  if (currentOperation === 'runTest') {
    const testsIndex = invocationArgs.indexOf('--tests');
    const testClassName = testsIndex >= 0 ? invocationArgs[testsIndex + 1] : undefined;
    return testClassName ? currentPlan.testRuns?.[testClassName] : undefined;
  }
  if (
    currentOperation === 'deleteCodeCoverageBatch'
    || currentOperation === 'deleteCoveredAggregateBatch'
  ) {
    return selectCompositeDeleteResponse(currentPlan, currentOperation, invocationArgs);
  }
  if (
    currentOperation === 'deleteCodeCoverage'
    || currentOperation === 'deleteCoveredAggregate'
    || currentOperation === 'updateOrgCoverage'
  ) {
    const idIndex = invocationArgs.indexOf('--record-id');
    const recordId = idIndex >= 0 ? invocationArgs[idIndex + 1] : undefined;
    const responses =
      currentOperation === 'deleteCodeCoverage' ? currentPlan.codeCoverageDeletes
      : currentOperation === 'deleteCoveredAggregate' ? currentPlan.coveredAggregateDeletes
      : currentPlan.orgCoverageUpdates;
    return recordId ? responses?.[recordId] : undefined;
  }
  return currentPlan[currentOperation];
}

function selectCompositeDeleteResponse(currentPlan, currentOperation, invocationArgs) {
  const requests = compositeRequests(invocationArgs);
  if (!requests || requests.length === 0) return undefined;

  const recordResponses =
    currentOperation === 'deleteCodeCoverageBatch' ?
      currentPlan.codeCoverageDeletes
    : currentPlan.coveredAggregateDeletes;
  const batchResponses =
    currentOperation === 'deleteCodeCoverageBatch' ?
      currentPlan.codeCoverageDeleteBatches
    : currentPlan.coveredAggregateDeleteBatches;
  const records = requests.map((request) => ({
    request,
    id: compositeRecordId(request.url),
  }));
  if (records.some(({ id }) => id === undefined)) return undefined;

  const firstId = records[0].id;
  const batchResponse = firstId ? batchResponses?.[firstId] : undefined;
  if (batchResponse) return batchResponse;

  const configured = records.map(({ id }) => (id ? recordResponses?.[id] : undefined));
  if (configured.some((response) => response === undefined)) return undefined;

  const gate = configured.find((response) => response?.gate)?.gate;
  const delayMs = Math.max(0, ...configured.map((response) => response?.delayMs ?? 0));
  return {
    json: {
      compositeResponse: records.map(({ request }, index) => {
        const response = configured[index];
        const failed = response?.exitCode !== undefined && response.exitCode !== 0;
        return {
          body:
            failed ?
              [
                {
                  errorCode: 'SYNTHETIC_FAILURE',
                  message: 'Synthetic composite subrequest failure',
                },
              ]
            : null,
          httpHeaders: {},
          httpStatusCode: failed ? 400 : 204,
          referenceId: request.referenceId,
        };
      }),
    },
    ...(gate ? { gate } : {}),
    ...(delayMs > 0 ? { delayMs } : {}),
  };
}

function compositeRequests(invocationArgs) {
  const bodyIndex = invocationArgs.indexOf('--body');
  if (bodyIndex < 0) return undefined;
  try {
    const body = JSON.parse(invocationArgs[bodyIndex + 1]);
    return Array.isArray(body?.compositeRequest) ? body.compositeRequest : undefined;
  } catch {
    return undefined;
  }
}

function compositeRecordId(value) {
  if (typeof value !== 'string') return undefined;
  const match =
    /\/tooling\/sobjects\/(?:ApexCodeCoverage|ApexCodeCoverageAggregate)\/([A-Za-z0-9]+)$/.exec(
      value
    );
  return match?.[1];
}

function waitForGate(gate, onRelease) {
  if (!/^[A-Za-z0-9_-]+$/.test(gate)) {
    throw new Error('Synthetic gate names may contain only letters, digits, underscore, or dash');
  }
  const gatePath = path.join(runtimeRoot, 'gates', gate);
  fs.writeFileSync(`${gatePath}.waiting`, 'waiting', 'utf8');
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
