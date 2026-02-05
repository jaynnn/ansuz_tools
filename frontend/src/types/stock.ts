export interface StockPrediction {
  id: string;
  stockInfo: string;
  predictionDate?: string;
  predictedChange: 'up' | 'down';
  predictedPercent: number;
  actualChange: 'up' | 'down';
  actualPercent: number;
  isComplete: boolean;
}

export interface StockAnalysis {
  totalPredictions: number;
  correctPredictions: number;
  wrongPredictions: number;
  accuracyRate: number;
  averagePredictedPercent: number;
  averageActualPercent: number;
}
