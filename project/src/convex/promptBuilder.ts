export function buildSystemPrompt(cardCount: number, difficulty: string, deckName: string, cardType = "basic") {
  const isCloze = cardType === "cloze";
  return [
    "You generate high-quality Anki flashcards.",
    isCloze
      ? "Every card must be a Cloze deletion card. The 'front' must be a statement with exactly one cloze deletion using the syntax {{c1::answer}} or {{c1::answer::hint}}. The 'back' must be left blank or contain a brief explanation/context."
      : "Fronts can be long, detailed prompts or questions — include enough context for a single, specific answer. Backs must be concise (ideally a single term or a short phrase under 5 words). Avoid sentences or long explanations on the back.",
    "Return only valid JSON that matches this schema:",
    '{ "deckName": string, "summary": string, "cards": [{ "front": string, "back": string }] }',
    "Keep the deck title concise and informative.",
    isCloze
      ? "Keep cards atomic, factual, and non-overlapping. Ensure the cloze deletion target {{c1::...}} is a key term, formula, name, or concept."
      : "Keep cards atomic, factual, and non-overlapping.",
    `Generate exactly ${cardCount} cards if the topic supports it.`,
    `Difficulty target: ${difficulty}.`,
    deckName ? `User preference for the deck name: ${deckName}.` : "Choose the best deck name yourself.",
    "Do not include markdown fences, commentary, or additional keys.",
  ].join(" ");
}

export function buildDocumentSystemPrompt(
  cardCount: number,
  difficulty: string,
  deckName: string,
  instructions: string,
  cardType = "basic",
) {
  const isCloze = cardType === "cloze";
  return [
    "You create Anki flashcards from a document's content.",
    "Extract the most important facts, definitions, concepts, and relationships from the provided text.",
    "Base every card strictly on the content — do not invent information not present in the text.",
    isCloze
      ? "Every card must be a Cloze deletion card. The 'front' must be a statement with exactly one cloze deletion using the syntax {{c1::answer}} or {{c1::answer::hint}}. The 'back' must be left blank or contain a brief explanation/context."
      : "Fronts can be long, detailed prompts or questions — include enough context for a single, specific answer. Backs must be concise (ideally a single term or a short phrase under 5 words). Avoid sentences or long explanations on the back.",
    "Return only valid JSON that matches this schema:",
    '{ "deckName": string, "summary": string, "cards": [{ "front": string, "back": string }] }',
    isCloze
      ? "Keep cards atomic, factual, and non-overlapping. Ensure the cloze deletion target {{c1::...}} is a key term, formula, name, or concept."
      : "Keep cards atomic, factual, and non-overlapping.",
    `Generate at most ${cardCount} cards from this section of the document.`,
    `Difficulty target: ${difficulty}.`,
    deckName ? `Use this deck name: ${deckName}.` : "Choose the best deck name based on the content.",
    instructions
      ? `Follow these user instructions exactly when selecting coverage and writing cards: ${instructions}`
      : "Use the full document as the coverage guide.",
    "Do not include markdown fences, commentary, or additional keys.",
  ].join(" ");
}

