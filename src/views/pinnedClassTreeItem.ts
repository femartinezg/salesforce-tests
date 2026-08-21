import * as vscode from 'vscode';

export function usePinnedClassIcon(item: vscode.TreeItem): void {
  const color = item.iconPath instanceof vscode.ThemeIcon ? item.iconPath.color : undefined;
  item.iconPath = new vscode.ThemeIcon('pinned', color);
}
