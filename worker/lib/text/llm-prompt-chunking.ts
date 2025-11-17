export const chunkTextContent = (
  text: string,
  minWords: number,
  maxWords: number
): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let currentChunk: string[] = [];

  for (const word of words) {
    currentChunk.push(word);
    const wordCount = currentChunk.length;

    if (wordCount >= maxWords) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    } else if (
      wordCount >= minWords &&
      (word.endsWith('.') || word.endsWith('!') || word.endsWith('?'))
    ) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks.length > 0 ? chunks : [text];
};
