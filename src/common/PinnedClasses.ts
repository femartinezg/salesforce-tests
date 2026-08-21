import * as vscode from 'vscode';

export type PinnedClassesPanel = 'apexTests' | 'codeCoverage';

interface PersistedPinnedClasses {
  apexTests: string[];
  codeCoverage: string[];
}

const STORAGE_KEY = 'salesforceTests.pinnedClasses';

export class PinnedClasses {
  private values: PersistedPinnedClasses = emptyPinnedClasses();
  private workspaceState?: vscode.Memento;
  private pendingPersistence: Promise<void> = Promise.resolve();

  constructor(workspaceState?: vscode.Memento) {
    if (workspaceState) this.useWorkspaceState(workspaceState);
  }

  useWorkspaceState(workspaceState: vscode.Memento): void {
    this.workspaceState = workspaceState;
    this.values = parsePinnedClasses(workspaceState.get<unknown>(STORAGE_KEY));
    this.pendingPersistence = Promise.resolve();
  }

  isPinned(panel: PinnedClassesPanel, className: string): boolean {
    return this.values[panel].includes(className);
  }

  order<T extends { name: string }>(panel: PinnedClassesPanel, classes: readonly T[]): T[] {
    const classesByName = new Map(classes.map((apexClass) => [apexClass.name, apexClass]));
    const pinnedNames = new Set(this.values[panel]);
    const pinnedClasses = this.values[panel].flatMap((className) => {
      const apexClass = classesByName.get(className);
      return apexClass ? [apexClass] : [];
    });
    const unpinnedClasses = classes.filter((apexClass) => !pinnedNames.has(apexClass.name));
    return [...pinnedClasses, ...unpinnedClasses];
  }

  pin(panel: PinnedClassesPanel, className: string): Promise<void> {
    this.values[panel] = [
      className,
      ...this.values[panel].filter((pinnedClassName) => pinnedClassName !== className),
    ];
    return this.persist();
  }

  unpin(panel: PinnedClassesPanel, className: string): Promise<void> {
    const pinnedClasses = this.values[panel];
    const remainingClasses = pinnedClasses.filter(
      (pinnedClassName) => pinnedClassName !== className
    );
    if (remainingClasses.length === pinnedClasses.length) return Promise.resolve();

    this.values[panel] = remainingClasses;
    return this.persist();
  }

  private persist(): Promise<void> {
    const workspaceState = this.workspaceState;
    if (!workspaceState) return Promise.resolve();

    const snapshot: PersistedPinnedClasses = {
      apexTests: [...this.values.apexTests],
      codeCoverage: [...this.values.codeCoverage],
    };
    const persistence = this.pendingPersistence
      .catch(() => undefined)
      .then(() => workspaceState.update(STORAGE_KEY, snapshot));
    this.pendingPersistence = persistence;
    return persistence;
  }
}

function parsePinnedClasses(value: unknown): PersistedPinnedClasses {
  if (!isRecord(value)) return emptyPinnedClasses();
  return {
    apexTests: parseClassNames(value.apexTests),
    codeCoverage: parseClassNames(value.codeCoverage),
  };
}

function parseClassNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((className): className is string => typeof className === 'string')),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyPinnedClasses(): PersistedPinnedClasses {
  return { apexTests: [], codeCoverage: [] };
}
