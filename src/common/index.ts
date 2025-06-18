import { ContextManager } from './ContextManager';

export function getContextManager() {
  return ContextManager.getInstance();
}

export function getNewContextManager() {
  return ContextManager.resetInstance();
}
