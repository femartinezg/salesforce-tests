import { getContextManager } from '../common';
import { PinnedClassesPanel } from '../common/PinnedClasses';

interface ClassActionTarget {
  className: string;
  panel: PinnedClassesPanel;
}

interface TestMethodActionTarget {
  className: string;
  methodName: string;
}

export async function pinClass(input?: unknown): Promise<void> {
  await updatePinnedClass(input, true);
}

export async function unpinClass(input?: unknown): Promise<void> {
  await updatePinnedClass(input, false);
}

export async function pinTestMethod(input?: unknown): Promise<void> {
  await updatePinnedTestMethod(input, true);
}

export async function unpinTestMethod(input?: unknown): Promise<void> {
  await updatePinnedTestMethod(input, false);
}

async function updatePinnedClass(input: unknown, pinned: boolean): Promise<void> {
  const target = getClassActionTarget(input);
  if (!target) return;

  const contextManager = getContextManager();
  const persistence =
    pinned ?
      contextManager.pinnedClasses.pin(target.panel, target.className)
    : contextManager.pinnedClasses.unpin(target.panel, target.className);

  if (target.panel === 'apexTests') {
    contextManager.apexTestsData.refresh();
  } else {
    contextManager.codeCoverageData.refresh();
  }
  await persistence;
}

async function updatePinnedTestMethod(input: unknown, pinned: boolean): Promise<void> {
  const target = getTestMethodActionTarget(input);
  if (!target) return;

  const contextManager = getContextManager();
  const persistence =
    pinned ?
      contextManager.pinnedClasses.pinTestMethod(target.className, target.methodName)
    : contextManager.pinnedClasses.unpinTestMethod(target.className, target.methodName);

  contextManager.apexTestsData.refresh();
  await persistence;
}

function getClassActionTarget(input: unknown): ClassActionTarget | undefined {
  if (!isRecord(input)) return undefined;

  const className = getLabel(input.label);
  if (!className || typeof input.contextValue !== 'string') return undefined;

  const panel = panelForContextValue(input.contextValue);
  return panel ? { className, panel } : undefined;
}

function getTestMethodActionTarget(input: unknown): TestMethodActionTarget | undefined {
  if (!isRecord(input)) return undefined;
  if (input.contextValue !== 'apexTestMethod' && input.contextValue !== 'pinnedApexTestMethod') {
    return undefined;
  }
  if (typeof input.testClassName !== 'string' || typeof input.testMethodName !== 'string') {
    return undefined;
  }
  return { className: input.testClassName, methodName: input.testMethodName };
}

function getLabel(label: unknown): string | undefined {
  if (typeof label === 'string') return label;
  if (isRecord(label) && typeof label.label === 'string') return label.label;
  return undefined;
}

function panelForContextValue(contextValue: string): PinnedClassesPanel | undefined {
  if (contextValue === 'apexTestClass' || contextValue === 'pinnedApexTestClass') {
    return 'apexTests';
  }
  if (contextValue === 'apexCoverageClass' || contextValue === 'pinnedApexCoverageClass') {
    return 'codeCoverage';
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
