import * as vscode from 'vscode';
import { getContextManager } from ".";
import { ApexClass, ApexTestClass } from "../classes/Apex";
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';

export async function retrieveOrgInfo(): Promise<{ status: boolean, alias?: string, username?: string }> {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
        exec('sf org display --json', (error: any, stdout: string) => {
            if (error) {
                resolve({ status: false });
                return;
            }
            try {
                const result = JSON.parse(stdout);
                const alias = result.result.alias || undefined;
                const username = result.result.username || undefined;
                resolve({ status: true, alias: alias, username: username });
            } catch (e) {
                resolve({ status: false });
            }
        });
    });
}

export async function retrieveApexClasses(): Promise<{ testClasses: ApexTestClass[], apexClasses: ApexClass[]}> {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
        const query = `SELECT Id, Name, Body FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC`;
        const command = `sf data query --query "${query}" --use-tooling-api --json`;

        exec(command, {"maxBuffer": 100*1024*1024}, (error: any, stdout: string) => {
            if (error) {
                reject(new Error(error));
                return;
            }

            try {
                const result = JSON.parse(stdout);
                const records = result.result.records || [];
                const testClasses = [];
                const apexClasses = [];

                for(let apex of records) {
                    const isTest = parseBody(apex.Body);
                    if(isTest) {
                        testClasses.push(new ApexTestClass(apex.Id, apex.Name));
                    } else if(isTest === false) {
                        apexClasses.push(new ApexClass(apex.Id, apex.Name));
                    }
                }

                const response = {
                    testClasses: testClasses,
                    apexClasses: apexClasses
                }
                resolve(response);
            } catch (e: unknown) {
                if(e instanceof Error) {
                    reject(e)
                } else {
                    reject(new Error("Unexpected error"));
                }
            }
        });
    });
}

function parseBody(body: string): boolean | undefined {
    const length = body.length;
    let i = 0;
    let inSingleLineComment = false;
    let inMultiLineComment = false;
    let tokenChars: string[] = [];

    const isWordChar = (ch: string) => {
        const code = ch.charCodeAt(0);
        return (
            (code >= 65 && code <= 90) ||    // A-Z
            (code >= 97 && code <= 122) ||   // a-z
            (code >= 48 && code <= 57) ||    // 0-9
            ch === '@' ||
            ch === '_'
        );
    }

    while (i < length) {
        const ch = body[i];
        const next = body[i + 1];

        // --- Handle comment entry ---
        if (!inMultiLineComment && !inSingleLineComment && ch === '/' && next === '/') {
            inSingleLineComment = true;
            i += 2;
            continue;
        }
        if (!inMultiLineComment && !inSingleLineComment && ch === '/' && next === '*') {
            inMultiLineComment = true;
            i += 2;
            continue;
        }

        // --- Handle comment exit ---
        if (inSingleLineComment && (ch === '\n' || ch === '\r')) {
            inSingleLineComment = false;
            i++;
            continue;
        }
        if (inMultiLineComment && ch === '*' && next === '/') {
            inMultiLineComment = false;
            i += 2;
            continue;
        }

        // --- Tokenization ---
        if (!inSingleLineComment && !inMultiLineComment) {
            if (isWordChar(ch)) {
                tokenChars.push(ch);
            } else if (tokenChars.length > 0) {
                const lower = tokenChars.join('').toLowerCase();
                if (lower === '@istest') return true;
                if (lower === 'class') return false;
                if (lower === 'interface') return undefined;
                tokenChars = [];
            }
        }

        i++;
    }

    if (tokenChars.length > 0) {
        const lower = tokenChars.join('').toLowerCase();
        if (lower === '@istest') return true;
        if (lower === 'class') return false;
        if (lower === 'interface') return undefined;
    }

    return false;
}

export async function retrieveCodeCoverage() {
    const contextManager = getContextManager();
    const { exec } = require('child_process');

    return new Promise<void>((resolve, reject) => {
        const query = `SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate`;
        const command = `sf data query --query "${query}" --use-tooling-api --json`;

        exec(command, {"maxBuffer": 100*1024*1024}, (error: any, stdout: string) => {
            if (error) {
                reject(new Error(error));
                return;
            }

            try {
                const result = JSON.parse(stdout);
                const records = result.result.records || [];

                for(let coverage of records) {
                    const apexClass = contextManager.codeCoverageData.apexClasses?.find((apexClass: ApexClass) => coverage.ApexClassOrTriggerId === apexClass.id);
                    const numLinesCovered = coverage.NumLinesCovered || 0;
                    const numLinesUncovered = coverage.NumLinesUncovered || 0;
                    const totalLines = numLinesCovered + numLinesUncovered;

                    if (apexClass) {
                        apexClass.totalLines = totalLines;
                        apexClass.coveredLines = numLinesCovered;
                        if(totalLines === 0) {
                            apexClass.codeCoverage = 100;
                        } else {
                            apexClass.codeCoverage = (numLinesCovered / totalLines) * 100;
                        }
                    }
                }

                contextManager.codeCoverageData.apexClasses?.forEach((apexClass: ApexClass) => {
                    if (apexClass.codeCoverage === undefined) {
                        apexClass.codeCoverage = -1;
                        apexClass.totalLines = -1;
                        apexClass.coveredLines = -1;
                    }
                });
                
                resolve();
            } catch (e: unknown) {
                if(e instanceof Error) {
                    reject(e)
                } else {
                    reject(new Error("Unexpected error"));
                }
            }
        });
    });
}

export async function runTestClass(testClass: ApexTestClass, contextManager: ContextManager, cancellationToken: vscode.CancellationToken): Promise<void> {
    let oldStatus = testClass.status;
    testClass.status = 'Running';
    contextManager.apexTestsData.refresh();

    const { exec } = require('child_process');
    const command = `sf apex test run --tests ${testClass.name} --synchronous --code-coverage --json`;

    try {
        const stdout: string = await new Promise((resolve, reject) => {
            exec(command, {"maxBuffer": 100*1024*1024}, (error: any, stdout: string) => {
                if (stdout) {
                    resolve(stdout);
                } else {
                    reject(error);
                }
            });
        });

        const result = JSON.parse(stdout);

        if(cancellationToken.isCancellationRequested) {
            return;
        }

        if (result.status != 0 && result.status != 100) {
            if(result.name && result.message) {
                vscode.window.showErrorMessage(`Error running ${testClass.name}: ${result.name} - ${result.message}`);
            } else {
                vscode.window.showErrorMessage(`Error running ${testClass.name}: Unexpected error`);
            }

            testClass.status = oldStatus;
            testClass.executionBlocked = true;
            contextManager.apexTestsData.refresh();
            return;
        }

        testClass.executionBlocked = false;
        const success = result.result.summary.outcome === 'Passed';
        const coverageResult = result.result.coverage;
        const summary = result.result.summary;

        if(success) {
            vscode.window.showInformationMessage(`${testClass.name} passed.`);
            testClass.status = 'Passed';
        } else {
            vscode.window.showErrorMessage(`${testClass.name} failed.`);
            testClass.status = 'Failed';
        }

        if(summary) {
            testClass.startTime = new Date(summary.testStartTime);
            testClass.duration = parseInt(summary.testExecutionTime);

            const testRun = new TestRun(
                testClass.name,
                'Test Class',
                success,
                new Date(summary.testStartTime),
                parseInt(summary.testExecutionTime)
            );

            contextManager.statusData.pushTestRun(testRun);
        }

        if(coverageResult.coverage) {
            getCodeCoverage(coverageResult.coverage);
        }

        if(coverageResult.summary) {
            contextManager.statusData.orgWideCoverage = parseInt(coverageResult.summary.orgWideCoverage.split('%')[0]);
        }

        contextManager.statusData.refresh();
        contextManager.apexTestsData.refresh();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error running ${testClass.name}: ${error.message || error}`);
        testClass.status = undefined;
        contextManager.apexTestsData.refresh();
        contextManager.statusData.refresh();
    }
}

async function getCodeCoverage(coverage: any[]) {
    const contextManager = getContextManager();
    for(let coverageItem of coverage) {
        let apexClass = contextManager.codeCoverageData.apexClasses?.find((apexClass: ApexClass) => coverageItem.name === apexClass.name);
        if (apexClass) {
            apexClass.totalLines = coverageItem.totalLines;
            apexClass.coveredLines = coverageItem.totalCovered;
            if(coverageItem.totalLines === 0) {
                apexClass.codeCoverage = 100;
            } else {
                apexClass.codeCoverage = (coverageItem.totalCovered / coverageItem.totalLines) * 100;
            }
        }

        contextManager.codeCoverageData.apexClasses?.forEach((apexClass: ApexClass) => {
            if (apexClass.codeCoverage === undefined) {
                apexClass.codeCoverage = -1;
                apexClass.totalLines = -1;
                apexClass.coveredLines = -1;
            }
        });
    }
    contextManager.codeCoverageData.refresh();
}

export async function retrieveOrgCoverage() {
    const { exec } = require('child_process');

    return new Promise<number>((resolve, reject) => {
        const query = 'SELECT Id, PercentCovered FROM ApexOrgWideCoverage';
        const command = `sf data query --query "${query}" --use-tooling-api --json`;

        exec(command, (error: any, stdout: string) => {
            if (error) {
                reject(new Error(error));
                return;
            }

            try {
                const result = JSON.parse(stdout);
                const records = result.result.records || [];
                if (records.length > 0) {
                    resolve(records[0].PercentCovered);
                } else {
                    reject(new Error("No coverage data found"));
                }
            } catch (e: unknown) {
                if(e instanceof Error) {
                    reject(e);
                } else {
                    reject(new Error("Unexpected error"));
                }
            }
        })
    });
}