export type ExtractedVocabRow = {
  rowId: string;
  serial: number;
  word: string;
  simpleMeaning: string;
  pronunciation: string;
  categoryHint: string;
  imageUrl: string;
  audioUrl: string;
  status: "valid" | "invalid" | "duplicate";
  issues: string[];
  selected: boolean;
};

export type ParseResult = {
  rows: ExtractedVocabRow[];
  parseNotes: string[];
  detectedColumns: string[];
};
