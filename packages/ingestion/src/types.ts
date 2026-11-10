export interface TextChunk {
  index: number;
  text: string;
}

export type SupportedExtension = '.txt' | '.md' | '.pdf' | '.docx';

export interface ExtractResult {
  text: string;
  empty: boolean;
}
