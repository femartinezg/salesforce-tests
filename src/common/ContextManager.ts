import * as vscode from 'vscode';
import { StatusTreeViewProvider } from '../views/StatusTreeViewProvider';
import { ApexTestsTreeViewProvider } from '../views/ApexTestsTreeViewProvider';
import { CodeCoverageTreeViewProvider } from '../views/CodeCoverageTreeViewProvider';
import { retrieveApexClasses, retrieveCodeCoverage, retrieveOrgCoverage, retrieveOrgInfo } from './sfActions';

export class ContextManager {
    private static instance: ContextManager;

    public statusData: StatusTreeViewProvider;
    public apexTestsData: ApexTestsTreeViewProvider;
    public codeCoverageData: CodeCoverageTreeViewProvider;
    public runTestCancelTokens: vscode.CancellationTokenSource[] = [];

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

    private constructor() {
        this.statusData = new StatusTreeViewProvider();
        vscode.window.registerTreeDataProvider('statusTreeView', this.statusData);
        this.apexTestsData = new ApexTestsTreeViewProvider();
        vscode.window.registerTreeDataProvider('apexTestsTreeView', this.apexTestsData);
        this.codeCoverageData = new CodeCoverageTreeViewProvider();
        vscode.window.registerTreeDataProvider('codeCoverageTreeView', this.codeCoverageData);
    }

    public async init() {
        if(!this.statusData || !this.apexTestsData || !this.codeCoverageData) {
            return;
        }

        const { status, alias, username } = await retrieveOrgInfo();
        this.statusData.isAuthenticated = status;
        this.statusData.alias = alias;
        this.statusData.username = username;
        this.statusData.refresh();
        
        if(!this.statusData.isAuthenticated) {
            this.apexTestsData.testClasses = [];
            this.codeCoverageData.apexClasses = [];
        } else {
            const { testClasses, apexClasses } = await retrieveApexClasses();
            this.apexTestsData.testClasses = testClasses;
            this.codeCoverageData.apexClasses = apexClasses;
        }
        
        this.apexTestsData.refresh();
        this.codeCoverageData.refresh();

        retrieveOrgCoverage().then((orgWideCoverage) => {
            this.statusData.orgWideCoverage = orgWideCoverage;
            this.statusData.refresh();
        });
        retrieveCodeCoverage().then(() => this.codeCoverageData.refresh());
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
}