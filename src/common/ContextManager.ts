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
import { TestInsightStore } from './TestInsightStore';
import { CoverageHistoryStore } from './CoverageHistoryStore';
import type { ApexTestCaseResult } from './ApexTestRunParser';

export class ContextManager {
  private static instance: ContextManager;

  public static outputChannel: vscode.OutputChannel =
    vscode.window.createOutputChannel('Salesforce Tests');

  public statusData: StatusTreeViewProvider;
  public apexTestsData: ApexTestsTreeViewProvider;
  public codeCoverageData: CodeCoverageTreeViewProvider;
  public runTestCancelTokens: vscode.CancellationTokenSource[] = [];
  private testHistoryStore?: TestHistoryStore;
  private testInsightStore?: TestInsightStore;
  private coverageHistoryStore?: CoverageHistoryStore;

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
    this.testInsightStore = new TestInsightStore(storage);
    this.coverageHistoryStore = new CoverageHistoryStore(storage);
  }

  public async init() {
    if (!this.statusData || !this.apexTestsData || !this.codeCoverageData) {
      return;
    }

    let orgInfo;
    try {
      orgInfo = await retrieveOrgInfo();
    } catch (error: unknown) {
      this.setUnavailableState();
      throw error;
    }
    const { status, alias, username, orgName } = orgInfo;
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
      this.setEmptyData();
      return;
    }

    this.printOutput(`Connected to org: ${orgName ?? username}`);

    const classesLoaded = await this.loadApexInventory(username, true);

    const coverageTasks: Promise<void>[] = [
      retrieveOrgCoverage(username)
        .then((orgWideCoverage) => this.updateOrgCoverage(username, orgWideCoverage))
        .catch((error: unknown) => {
          this.printOutput(`Unable to retrieve org coverage: ${getErrorMessage(error)}`);
        }),
    ];
    if (classesLoaded) {
      coverageTasks.push(
        retrieveCodeCoverage(username)
          .then(() => this.codeCoverageData.refresh())
          .catch((error: unknown) => {
            this.printOutput(`Unable to retrieve class coverage: ${getErrorMessage(error)}`);
          })
      );
    }
    await Promise.all(coverageTasks);
  }

  public async loadApexInventory(
    targetOrg: string,
    updateCoverageClasses: boolean
  ): Promise<boolean> {
    const [classesResult, suitesResult] = await Promise.allSettled([
      retrieveApexClasses(targetOrg),
      retrieveApexTestSuites(targetOrg),
    ]);

    if (classesResult.status === 'fulfilled') {
      this.apexTestsData.testClasses = classesResult.value.testClasses;
      this.applyTestInsights(targetOrg);
      if (updateCoverageClasses) {
        this.codeCoverageData.apexClasses = classesResult.value.apexClasses;
      }
    } else {
      this.apexTestsData.testClasses = [];
      if (updateCoverageClasses) {
        this.codeCoverageData.apexClasses = [];
      }
      this.printOutput(`Unable to retrieve Apex classes: ${getErrorMessage(classesResult.reason)}`);
    }

    if (suitesResult.status === 'fulfilled') {
      this.apexTestsData.testSuites = suitesResult.value;
    } else {
      this.apexTestsData.testSuites = [];
      this.printOutput(
        `Unable to retrieve Apex test suites: ${getErrorMessage(suitesResult.reason)}`
      );
    }

    this.apexTestsData.refresh();
    if (updateCoverageClasses) {
      this.codeCoverageData.refresh();
    }
    return classesResult.status === 'fulfilled';
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

  public async recordTestCaseResults(results: readonly ApexTestCaseResult[]): Promise<void> {
    const targetOrg = this.statusData.username;
    if (!targetOrg || !this.testInsightStore) {
      return;
    }
    try {
      await this.testInsightStore.record(
        targetOrg,
        results.flatMap((result) => {
          if (result.outcome !== 'Pass' && result.outcome !== 'Fail') {
            return [];
          }
          return [
            {
              selector: result.fullName,
              success: result.outcome === 'Pass',
              ...(result.runTimeMs === undefined ? {} : { durationMs: result.runTimeMs }),
            },
          ];
        })
      );
      this.applyTestInsights(targetOrg);
      this.apexTestsData.refresh();
    } catch (error: unknown) {
      this.printOutput(`Unable to persist test insights: ${getErrorMessage(error)}`);
    }
  }

  public async updateOrgCoverage(targetOrg: string, coverage: number): Promise<void> {
    const previousSnapshot = this.coverageHistoryStore?.load(targetOrg)[0];
    this.statusData.orgWideCoverage = coverage;
    this.statusData.coverageDelta =
      previousSnapshot ? coverage - previousSnapshot.coverage : undefined;

    if (this.coverageHistoryStore) {
      try {
        await this.coverageHistoryStore.record(targetOrg, coverage);
        this.statusData.coverageHistory = this.coverageHistoryStore.load(targetOrg);
      } catch (error: unknown) {
        this.printOutput(`Unable to persist coverage history: ${getErrorMessage(error)}`);
      }
    }
    this.statusData.refresh();
  }

  public displayOutput() {
    if (ContextManager.outputChannel) {
      ContextManager.outputChannel.show();
    } else {
      vscode.window.showErrorMessage('Output channel is not initialized.');
    }
  }

  private setUnavailableState(): void {
    this.statusData.isAuthenticated = false;
    this.statusData.alias = undefined;
    this.statusData.username = undefined;
    this.statusData.orgWideCoverage = undefined;
    this.statusData.coverageDelta = undefined;
    this.statusData.coverageHistory = [];
    this.statusData.testRuns = [];
    this.statusData.refresh();
    this.setEmptyData();
  }

  private setEmptyData(): void {
    this.apexTestsData.testClasses = [];
    this.apexTestsData.testSuites = [];
    this.codeCoverageData.apexClasses = [];
    this.apexTestsData.refresh();
    this.codeCoverageData.refresh();
  }

  private applyTestInsights(targetOrg: string): void {
    const insights = new Map(
      (this.testInsightStore?.load(targetOrg) ?? []).map((insight) => [insight.selector, insight])
    );
    for (const method of this.apexTestsData.testClasses?.flatMap((testClass) => testClass.methods)
      ?? []) {
      const insight = insights.get(method.selector);
      method.recentPassCount = insight?.passCount ?? 0;
      method.recentFailCount = insight?.failCount ?? 0;
      method.averageDurationMs = insight?.averageDurationMs;
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
