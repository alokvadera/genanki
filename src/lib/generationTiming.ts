export function estimatePromptEtaSeconds(
  cardCount: number,
  modelCount: number,
  providerCount: number,
): number {
  return Math.max(
    18,
    Math.round(8 + cardCount * 1.2 + Math.max(0, modelCount - 1) * 1.25 + Math.max(0, providerCount - 1) * 3),
  );
}

export function estimateDocumentEtaSeconds(
  cardCount: number,
  sectionCount: number,
  modelCount: number,
  providerCount: number,
): number {
  return Math.max(
    24,
    Math.round(12 + cardCount * 1.4 + sectionCount * 5 + Math.max(0, modelCount - 1) * 1.25 + Math.max(0, providerCount - 1) * 3),
  );
}

export function estimatePromptTimeoutSeconds(cardCount: number): number {
  return Math.max(240, Math.min(900, Math.round(120 + cardCount * 5)));
}

export function estimateDocumentTimeoutSeconds(cardCount: number, sectionCount: number): number {
  return Math.max(
    300,
    Math.min(1200, Math.round(150 + cardCount * 5 + Math.max(0, sectionCount - 1) * 45)),
  );
}
