import * as vscode from 'vscode';
import { StatusTreeViewProvider } from '../views/StatusTreeViewProvider';
import { ApexTestsTreeViewProvider } from '../views/ApexTestsTreeViewProvider';
import { CodeCoverageTreeViewProvider } from '../views/CodeCoverageTreeViewProvider';
import { TestRun } from '../classes/TestRun';
import {
  retrieveApexClasses,
  retrieveApexTestSuites,
  retrieveCodeCoverage,
  retrieveOrgCoverage,
  retrieveOrgInfo,
} from './sfActions';
import { TestHistoryStore, type TestHistoryStorage } from './TestHistoryStore';

export class ContextManager {
  private static instance: ContextManager;

  public static outputChannel: vscode.OutputChannel =
    vscode.window.createOutputChannel('Salesforce Tests');

  public statusData: StatusTreeViewProvider;
  public apexTestsData: ApexTestsTreeViewProvider;
  public codeCoverageData: CodeCoverageTreeViewProvider;
  public runTestCancelTokens: vscode.CancellationTokenSource[] = [];
  private testHistoryStore?: TestHistoryStore;

  public static getInstance(): ContextManager {
    if (!this.instance) {
      this.instance = new ContextManager();
    }
    return this.instance;
  }

  private constructor() {
    this.statusData = new StatusTreeViewProvider();
    this.apexTestsData = new ApexTestsTreeViewProvider();
    this.codeCoverageData = new CodeCoverageTreeViewProvider();
  }

  public configureStorage(storage: TestHistoryStorage): void {
    this.testHistoryStore = new TestHistoryStore(storage);
  }

  public async init() {
    if (!this.statusData || !this.apexTestsData || !this.codeCoverageData) {
      return;
    }

    const { status, alias, username, orgName } = await retrieveOrgInfo();
    this.statusData.isAuthenticated = status;
    this.statusData.alias = alias;
    this.statusData.username = username;
    this.statusData.testRuns =
      username ?
        (this.testHistoryStore?.load(username) ?? []).map(
          (run) => new TestRun(run.name, run.type, run.success, run.startTime, run.duration)
        )
      : [];
    this.statusData.refresh();

    if (!this.statusData.isAuthenticated || !username) {
      this.printOutput('No default Salesforce org is configured.');
      this.apexTestsData.testClasses = [];
      this.apexTestsData.testSuites = [];
      this.codeCoverageData.apexClasses = [];
      this.apexTestsData.refresh();
      this.codeCoverageData.refresh();
      return;
    }

    this.printOutput(`Connected to org: ${orgName ?? username}`);

    const [{ testClasses, apexClasses }, testSuites] = await Promise.all([
      retrieveApexClasses(username),
      retrieveApexTestSuites(username),
    ]);
    this.apexTestsData.testClasses = testClasses;
    this.apexTestsData.testSuites = testSuites;
    this.codeCoverageData.apexClasses = apexClasses;

    this.apexTestsData.refresh();
    this.codeCoverageData.refresh();

    await Promise.all([
      retrieveOrgCoverage(username)
        .then((orgWideCoverage) => {
          this.statusData.orgWideCoverage = orgWideCoverage;
          this.statusData.refresh();
        })
        .catch((error: unknown) => {
          this.printOutput(`Unable to retrieve org coverage: ${getErrorMessage(error)}`);
        }),
      retrieveCodeCoverage(username)
        .then(() => this.codeCoverageData.refresh())
        .catch((error: unknown) => {
          this.printOutput(`Unable to retrieve class coverage: ${getErrorMessage(error)}`);
        }),
    ]);
  }

  public async reset() {
    this.statusData?.reset();
    this.apexTestsData?.reset();
    this.codeCoverageData?.reset();

    this.statusData?.refresh();
    this.apexTestsData?.refresh();
    this.codeCoverageData?.refresh();

    await this.init();
  }

  public printOutput(message: string | string[]): void {
    let messageList = [];

    if (!message) return;
    if (typeof message === 'string') {
      messageList.push(message);
    } else {
      messageList = message;
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    ContextManager.outputChannel.append(`[${timeString}] `);
    let isFirst = true;
    for (const line of messageList) {
      if (isFirst) {
        ContextManager.outputChannel.append(`${line}\n`);
        isFirst = false;
      } else {
        ContextManager.outputChannel.append(`           ${line}\n`);
      }
    }
  }

  public recordTestRun(testRun: TestRun): void {
    this.statusData.pushTestRun(testRun);
    const targetOrg = this.statusData.username;
    if (!targetOrg || !this.testHistoryStore) {
      return;
    }
    void this.testHistoryStore.save(targetOrg, this.statusData.testRuns).catch((error: unknown) => {
      this.printOutput(`Unable to persist test history: ${getErrorMessage(error)}`);
    });
  }

  public displayOutput() {
    if (ContextManager.outputChannel) {
      ContextManager.outputChannel.show();
    } else {
      vscode.window.showErrorMessage('Output channel is not initialized.');
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
