import type { NormalizedOperation, OverlayDocument } from "./schemas";

export function overlayKeyForOperation(operation: NormalizedOperation): string {
  return `${operation.method.toUpperCase()} ${operation.path}`;
}

export function applyOperationOverlay(
  operation: NormalizedOperation,
  overlay: OverlayDocument | undefined
): NormalizedOperation {
  if (!overlay) {
    return operation;
  }

  const exact = overlay.operations[overlayKeyForOperation(operation)];
  const byOperationId = overlay.operations[operation.operationId];
  const entry = exact ?? byOperationId;

  if (!entry) {
    return operation;
  }

  return {
    ...operation,
    operationId: entry.operationId ?? operation.operationId,
    sdkName: entry.sdkName ?? operation.sdkName,
    resource: entry.resource ?? operation.resource,
    modelName: entry.modelName ?? operation.modelName,
    pagination: entry.pagination ?? operation.pagination,
    authScopes: entry.authScopes ?? operation.authScopes,
    sdkVisibility: entry.sdkVisibility ?? operation.sdkVisibility,
    mcpVisibility: entry.mcpVisibility ?? operation.mcpVisibility,
    notes: entry.notes ?? operation.notes
  };
}
