import * as vscode from 'vscode';
import { contextManager } from ".";
import { ApexClass, ApexTestClass } from "../classes/Apex";

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

export async function retrieveApexClasses(): Promise<{ testClasses?: ApexTestClass[], apexClasses?: ApexClass[]}> {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
        const query = `SELECT Id, Name, SymbolTable FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC`;
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
                    const modifiers = apex.SymbolTable?.tableDeclaration?.modifiers || [];
                    if(!modifiers) {
                        continue;
                    }
                    if(modifiers.includes('testMethod')) {
                        testClasses.push(new ApexTestClass(apex.Id, apex.Name));
                    } else {
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

export async function retrieveCodeCoverage() {
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
                        if(totalLines === 0) {
                            apexClass.codeCoverage = 100;
                        } else {
                            apexClass.codeCoverage = (numLinesCovered / totalLines) * 100;
                        }
                    }
                }
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

export async function runTestClass(testClass: ApexTestClass): Promise<void> {
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

        if (result.status != 0 && result.status != 100) {
            if(result.name && result.message) {
                vscode.window.showErrorMessage(`Error running ${testClass.name}: ${result.name} - ${result.message}`);
            } else {
                vscode.window.showErrorMessage(`Error running ${testClass.name}: Unexpected error`);
            }

            testClass.status = undefined;
            contextManager.apexTestsData.refresh();
            return;
        }

        const success = result.result.summary.outcome === 'Passed';
        const coverageResult = result.result.coverage;
        if(success) {
            vscode.window.showInformationMessage(`${testClass.name} passed.`);
            testClass.status = 'Passed';
            contextManager.apexTestsData.refresh();
        } else {
            vscode.window.showErrorMessage(`${testClass.name} failed.`);
            testClass.status = 'Failed';
            contextManager.apexTestsData.refresh();
        }

        if(!coverageResult.coverage) {
            return;
        }

        for(let coverage of coverageResult.coverage) {
            let apexClass = contextManager.codeCoverageData.apexClasses?.find((apexClass: ApexClass) => coverage.name === apexClass.name);
            if (apexClass) {
                if(coverage.totalLines === 0) {
                    apexClass.codeCoverage = 100;
                } else {
                    apexClass.codeCoverage = (coverage.totalCovered / coverage.totalLines) * 100;
                }
            }
        }
        contextManager.codeCoverageData.refresh();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error running ${testClass.name}: ${error.message || error}`);
        testClass.status = undefined;
        contextManager.apexTestsData.refresh();
    }
}