import type { AnkiCard } from "./anki";

/**
 * Splits text into meaningful chunks for card generation.
 */
function splitIntoChunks(text: string): string[] {
  // Split by double newlines, or by numbered/bulleted lists
  const chunks: string[] = [];

  // First try splitting by double newlines (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20);

  for (const para of paragraphs) {
    // If paragraph is short enough, treat as one chunk
    if (para.length < 300) {
      chunks.push(para.trim());
    } else {
      // Split long paragraphs by sentences
      const sentences = para
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim().length > 15);
      let buffer = "";
      for (const sentence of sentences) {
        if (buffer.length + sentence.length > 280) {
          if (buffer.trim()) chunks.push(buffer.trim());
          buffer = sentence;
        } else {
          buffer += (buffer ? " " : "") + sentence;
        }
      }
      if (buffer.trim()) chunks.push(buffer.trim());
    }
  }

  return chunks.filter((c) => c.length > 15);
}

/**
 * Extract definition-style cards: "X is Y" patterns.
 */
function extractDefinitionCards(text: string): AnkiCard[] {
  const cards: AnkiCard[] = [];
  // Match patterns like "X is/are/was/means/refers to Y"
  const patterns = [
    /([A-Z][^.!?\n]{3,50})\s+(?:is|are|was|were|means?|refers?\s+to|defined?\s+as|known?\s+as)\s+([^.!?\n]{10,250})[.!?]/gi,
    /([A-Z][^.!?\n]{3,50}):\s*([^.!?\n]{10,250})[.!?]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const term = match[1].trim();
      const definition = match[2].trim();
      if (
        term.length > 3 &&
        definition.length > 10 &&
        !cards.some((c) => c.front === term)
      ) {
        cards.push({ front: term, back: definition });
      }
    }
  }

  return cards;
}

/**
 * Extract list-based cards from bullet points or numbered items.
 */
function extractListCards(text: string): AnkiCard[] {
  const cards: AnkiCard[] = [];
  // Match numbered lists: "1. Item - description" or "1) Item: description"
  const numberedPattern =
    /(?:^|\n)\s*\d+[.)]\s*(.+?)(?:\s*[-–—:]\s*(.+?))?(?=\n\s*\d+[.)]|\n\n|$)/gs;
  let match;

  while ((match = numberedPattern.exec(text)) !== null) {
    const item = match[1]?.trim();
    const desc = match[2]?.trim();
    if (item && desc && item.length > 3 && desc.length > 5) {
      cards.push({ front: item, back: desc });
    }
  }

  // Match bullet points: "- Item: description" or "• Item - description"
  const bulletPattern =
    /(?:^|\n)\s*[•\-\*]\s*(.+?)(?:\s*[-–—:]\s*(.+?))?(?=\n\s*[•\-\*]|\n\n|$)/gs;

  while ((match = bulletPattern.exec(text)) !== null) {
    const item = match[1]?.trim();
    const desc = match[2]?.trim();
    if (item && desc && item.length > 3 && desc.length > 5) {
      cards.push({ front: item, back: desc });
    }
  }

  return cards;
}

/**
 * Extract Q&A style cards from text with question marks.
 */
function extractQACards(text: string): AnkiCard[] {
  const cards: AnkiCard[] = [];
  // Match "What/How/Why/When/Where/Who...? Answer."
  const qaPattern =
    /((?:What|How|Why|When|Where|Who|Which|Is|Are|Can|Do|Does)[^.!?\n]{5,120}\?)\s*([^.!?\n]{10,300})[.!?]/gi;

  let match;
  while ((match = qaPattern.exec(text)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question.length > 10 && answer.length > 10) {
      cards.push({ front: question, back: answer });
    }
  }

  return cards;
}

/**
 * Extract heading-based cards: heading as question, following content as answer.
 */
function extractHeadingCards(text: string): AnkiCard[] {
  const cards: AnkiCard[] = [];
  // Match markdown-style headings or ALL CAPS lines followed by content
  const headingPattern =
    /(?:^|\n)(?:#{1,3}\s*(.+)|([A-Z][A-Z\s]{5,60}))\n([^\n#]{10,300})/g;

  let match;
  while ((match = headingPattern.exec(text)) !== null) {
    const heading = (match[1] || match[2])?.trim();
    const content = match[3]?.trim();
    if (heading && content && heading.length > 3 && content.length > 10) {
      cards.push({
        front: heading,
        back: content,
      });
    }
  }

  return cards;
}

/**
 * Generate flashcards from text content using multiple extraction strategies.
 * Returns deduplicated cards.
 */
export function generateCardsFromText(text: string): AnkiCard[] {
  if (!text || text.trim().length < 30) {
    return [];
  }

  const allCards: AnkiCard[] = [];

  // Strategy 1: Definition patterns
  allCards.push(...extractDefinitionCards(text));

  // Strategy 2: Q&A patterns
  allCards.push(...extractQACards(text));

  // Strategy 3: Heading-based cards
  allCards.push(...extractHeadingCards(text));

  // Strategy 4: List-based cards
  allCards.push(...extractListCards(text));

  // Strategy 5: Chunk-based cards (paragraph → question)
  const chunks = splitIntoChunks(text);
  for (const chunk of chunks) {
    // Generate a question from the first sentence
    const firstSentence = chunk.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
    if (firstSentence && firstSentence.length > 15 && firstSentence.length < 200) {
      // Convert statement to question
      let question = firstSentence
        .replace(/\.$/, "?")
        .replace(/^(What is|What are)/, "Define");

      // If it doesn't start with a question word, wrap it
      if (!/^(What|How|Why|When|Where|Who|Which|Is|Are|Can|Do|Does)/i.test(question)) {
        question = `Explain: ${firstSentence.replace(/\.$/, "")}`;
      }

      // Use remaining text as answer
      const remaining = chunk.slice(firstSentence.length).trim();
      const answer = remaining || chunk;

      if (!allCards.some((c) => c.front === question)) {
        allCards.push({ front: question, back: answer });
      }
    }
  }

  // Deduplicate by front
  const seen = new Set<string>();
  const unique: AnkiCard[] = [];
  for (const card of allCards) {
    const key = card.front.toLowerCase().trim();
    if (!seen.has(key) && card.front.length > 3 && card.back.length > 5) {
      seen.add(key);
      unique.push(card);
    }
  }

  return unique;
}
