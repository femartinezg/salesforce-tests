import * as vscode from 'vscode';
import { StatusTreeViewProvider } from '../views/StatusTreeViewProvider';
import { ApexTestsTreeViewProvider } from '../views/ApexTestsTreeViewProvider';
import { CodeCoverageTreeViewProvider } from '../views/CodeCoverageTreeViewProvider';
import {
  retrieveApexClasses,
  retrieveCodeCoverage,
  retrieveOrgCoverage,
  retrieveOrgInfo,
} from './sfActions';
import { PinnedClasses } from './PinnedClasses';

const ORG_RESOLUTION_ERROR_MESSAGE =
  'Unable to resolve the Salesforce org. Check authentication or run Refresh Org.';

export class ContextManager {
  private static instance: ContextManager;
  private static workspaceState?: vscode.Memento;

  public static outputChannel: vscode.OutputChannel =
    vscode.window.createOutputChannel('Salesforce Tests');

  public statusData: StatusTreeViewProvider;
  public apexTestsData: ApexTestsTreeViewProvider;
  public codeCoverageData: CodeCoverageTreeViewProvider;
  public pinnedClasses: PinnedClasses;
  public runTestCancelTokens: vscode.CancellationTokenSource[] = [];
  public targetOrg?: string;
  public targetOrgApiVersion?: string;

  public static getInstance(): ContextManager {
    if (!this.instance) {
      this.instance = new ContextManager();
    }
    return this.instance;
  }

  public static resetInstance() {
    this.instance = new ContextManager();
    return this.instance;
  }

  public static useWorkspaceState(workspaceState: vscode.Memento | undefined): void {
    if (!workspaceState) return;
    this.workspaceState = workspaceState;
    this.instance?.pinnedClasses.useWorkspaceState(workspaceState);
  }

  private constructor() {
    this.pinnedClasses = new PinnedClasses(ContextManager.workspaceState);
    this.statusData = new StatusTreeViewProvider();
    vscode.window.registerTreeDataProvider('statusTreeView', this.statusData);
    this.apexTestsData = new ApexTestsTreeViewProvider(this.pinnedClasses);
    vscode.window.registerTreeDataProvider('apexTestsTreeView', this.apexTestsData);
    this.codeCoverageData = new CodeCoverageTreeViewProvider(this.pinnedClasses);
    vscode.window.registerTreeDataProvider('codeCoverageTreeView', this.codeCoverageData);
  }

  public async init() {
    if (!this.statusData || !this.apexTestsData || !this.codeCoverageData) {
      return;
    }

    this.targetOrg = undefined;
    this.targetOrgApiVersion = undefined;
    const { status, alias, username, apiVersion, orgName } = await retrieveOrgInfo();
    this.statusData.isAuthenticated = status && username !== undefined;
    this.statusData.alias = alias;
    this.statusData.username = username;
    this.statusData.refresh();

    if (!this.statusData.isAuthenticated || username === undefined) {
      this.apexTestsData.testClasses = [];
      this.codeCoverageData.apexClasses = [];
      this.apexTestsData.refresh();
      this.codeCoverageData.refresh();
      void vscode.window.showErrorMessage(ORG_RESOLUTION_ERROR_MESSAGE);
      return;
    }

    this.targetOrg = username;
    this.targetOrgApiVersion = apiVersion;
    this.printOutput(`Connected to org: ${orgName}`);

    try {
      const { testClasses, apexClasses } = await retrieveApexClasses(username);
      this.apexTestsData.testClasses = testClasses;
      this.codeCoverageData.apexClasses = apexClasses;
    } catch {
      this.apexTestsData.testClasses = [];
      this.codeCoverageData.apexClasses = [];
      this.apexTestsData.refresh();
      this.codeCoverageData.refresh();
      return;
    }

    this.apexTestsData.refresh();
    this.codeCoverageData.refresh();

    void retrieveOrgCoverage(username)
      .then((orgWideCoverage) => {
        this.statusData.orgWideCoverage = orgWideCoverage;
        this.statusData.refresh();
      })
      .catch(() => undefined);
    void retrieveCodeCoverage(this, username)
      .then(() => this.codeCoverageData.refresh())
      .catch(() => undefined);
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

  public displayOutput() {
    if (ContextManager.outputChannel) {
      ContextManager.outputChannel.show();
    } else {
      vscode.window.showErrorMessage('Output channel is not initialized.');
    }
  }
}
