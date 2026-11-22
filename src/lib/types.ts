import type { Bar } from './indicators';
import type { SwingAnalysis } from './swing';
import type { Timeframes } from './multiTimeframe';
import type { CompanyData, SymbolMatch } from './yahoo';
import type { PositionEvidence } from './positionEvidence';

export interface AnalyzeResponse {
  match: SymbolMatch & { switchedFrom?: string };
  company: CompanyData;
  /** The short-term swing analysis in full — chart levels & snapshot come from here. */
  analysis: SwingAnalysis;
  /** The same stock read across short / mid / long horizons. */
  timeframes: Timeframes;
  /**
   * Descriptive weeks-to-months evidence for the mid-term horizon. Not a score
   * input. Null when it could not be computed; absent in older cached payloads.
   */
  position?: PositionEvidence | null;
  narrative: { text: string; source: 'template' | 'ollama' };
  bars: Bar[];
  generatedAt: string;
}

export interface ApiError {
  error: string;
}
