export type TreeItemLabelValue = string | { label: string } | undefined;

export function getTreeItemLabel(label: TreeItemLabelValue): string | undefined {
  return typeof label === 'string' ? label : label?.label;
}
