import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { StockPrediction, StockAnalysis } from '../types/stock';
import '../styles/StockPrediction.css';

const StockPredictionPage: React.FC = () => {
  const [predictions, setPredictions] = useState<StockPrediction[]>(() => {
    // Load from localStorage on initial render
    const saved = localStorage.getItem('stockPredictions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Failed to load predictions:', error);
        return [];
      }
    }
    return [];
  });

  // Save to localStorage whenever predictions change
  useEffect(() => {
    localStorage.setItem('stockPredictions', JSON.stringify(predictions));
  }, [predictions]);

  // Calculate analysis from predictions using useMemo
  const analysis = useMemo<StockAnalysis>(() => {
    const completePredictions = predictions.filter(p => p.isComplete);
    const correct = completePredictions.filter(
      p => p.predictedChange === p.actualChange
    ).length;
    const wrong = completePredictions.length - correct;
    
    const totalPredictedPercent = completePredictions.reduce(
      (sum, p) => sum + Math.abs(p.predictedPercent), 0
    );
    const totalActualPercent = completePredictions.reduce(
      (sum, p) => sum + Math.abs(p.actualPercent), 0
    );

    return {
      totalPredictions: completePredictions.length,
      correctPredictions: correct,
      wrongPredictions: wrong,
      accuracyRate: completePredictions.length > 0 ? (correct / completePredictions.length) * 100 : 0,
      averagePredictedPercent: completePredictions.length > 0 ? totalPredictedPercent / completePredictions.length : 0,
      averageActualPercent: completePredictions.length > 0 ? totalActualPercent / completePredictions.length : 0,
    };
  }, [predictions]);

  const addNewRow = () => {
    const newPrediction: StockPrediction = {
      id: Date.now().toString(),
      stockInfo: '',
      predictedChange: 'up',
      predictedPercent: 0,
      actualChange: 'up',
      actualPercent: 0,
      isComplete: false,
    };
    setPredictions([...predictions, newPrediction]);
  };

  const updatePrediction = (id: string, field: keyof StockPrediction, value: string | number) => {
    setPredictions(predictions.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        // Check if all fields are filled
        updated.isComplete = 
          updated.stockInfo.trim() !== '' &&
          updated.predictedPercent !== 0 &&
          updated.actualPercent !== 0;
        return updated;
      }
      return p;
    }));
  };

  const deleteRow = (id: string) => {
    if (window.confirm('确定要删除这条记录吗？')) {
      setPredictions(predictions.filter(p => p.id !== id));
    }
  };

  const getRowClass = (prediction: StockPrediction) => {
    if (!prediction.isComplete) return '';
    return prediction.predictedChange === prediction.actualChange ? 'correct' : 'wrong';
  };

  // Prepare chart data
  const pieData = [
    { name: '正确', value: analysis.correctPredictions, color: '#ff4d4f' },
    { name: '错误', value: analysis.wrongPredictions, color: '#52c41a' },
  ];

  const barData = predictions
    .filter(p => p.isComplete)
    .slice(-10) // Show last 10 predictions
    .map((p, index) => ({
      name: p.stockInfo.substring(0, 10) || `预测${index + 1}`,
      预测变化: p.predictedChange === 'up' ? p.predictedPercent : -p.predictedPercent,
      实际变化: p.actualChange === 'up' ? p.actualPercent : -p.actualPercent,
    }));

  return (
    <div className="stock-prediction-page">
      <header className="stock-header">
        <h1>📈 我的股票预测记录</h1>
        <button onClick={() => window.history.back()} className="btn-back">
          返回主页
        </button>
      </header>

      {/* Data Source Section - 2/3 of screen */}
      <div className="data-section">
        <div className="section-header">
          <h2>数据录入</h2>
          <button onClick={addNewRow} className="btn-add">
            ➕ 添加新记录
          </button>
        </div>
        
        <div className="table-container">
          <table className="predictions-table">
            <thead>
              <tr>
                <th>股票信息</th>
                <th>预测变化</th>
                <th>预测百分比(%)</th>
                <th>实际变化</th>
                <th>实际百分比(%)</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-message">
                    暂无数据，点击"添加新记录"开始预测吧！
                  </td>
                </tr>
              ) : (
                predictions.map(prediction => (
                  <tr key={prediction.id} className={getRowClass(prediction)}>
                    <td>
                      <input
                        type="text"
                        value={prediction.stockInfo}
                        onChange={(e) => updatePrediction(prediction.id, 'stockInfo', e.target.value)}
                        placeholder="输入股票代码或名称"
                        className="input-field"
                      />
                    </td>
                    <td>
                      <select
                        value={prediction.predictedChange}
                        onChange={(e) => updatePrediction(prediction.id, 'predictedChange', e.target.value)}
                        className="select-field"
                      >
                        <option value="up">涨</option>
                        <option value="down">跌</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={prediction.predictedPercent}
                        onChange={(e) => updatePrediction(prediction.id, 'predictedPercent', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="input-field number-field"
                      />
                    </td>
                    <td>
                      <select
                        value={prediction.actualChange}
                        onChange={(e) => updatePrediction(prediction.id, 'actualChange', e.target.value)}
                        className="select-field"
                      >
                        <option value="up">涨</option>
                        <option value="down">跌</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={prediction.actualPercent}
                        onChange={(e) => updatePrediction(prediction.id, 'actualPercent', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="input-field number-field"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => deleteRow(prediction.id)}
                        className="btn-delete"
                        title="删除"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data Analysis Section - 1/3 of screen */}
      <div className="analysis-section">
        <h2>数据分析</h2>
        
        {analysis.totalPredictions === 0 ? (
          <div className="empty-analysis">
            <p>暂无完整的预测数据，请填写完整的预测记录后查看分析结果</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">总预测数</div>
                <div className="stat-value">{analysis.totalPredictions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">正确预测</div>
                <div className="stat-value correct">{analysis.correctPredictions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">错误预测</div>
                <div className="stat-value wrong">{analysis.wrongPredictions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">准确率</div>
                <div className="stat-value">{analysis.accuracyRate.toFixed(2)}%</div>
              </div>
            </div>

            {/* Charts */}
            <div className="charts-container">
              {/* Pie Chart - Accuracy Distribution */}
              <div className="chart-card">
                <h3>预测准确性分布</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart - Predicted vs Actual */}
              {barData.length > 0 && (
                <div className="chart-card full-width">
                  <h3>预测与实际对比（最近10条）</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={barData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis label={{ value: '变化百分比(%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="预测变化" fill="#8884d8" />
                      <Bar dataKey="实际变化" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Average Comparison */}
              <div className="chart-card">
                <h3>平均变化对比</h3>
                <div className="avg-comparison">
                  <div className="avg-item">
                    <span className="avg-label">平均预测变化:</span>
                    <span className="avg-value">{analysis.averagePredictedPercent.toFixed(2)}%</span>
                  </div>
                  <div className="avg-item">
                    <span className="avg-label">平均实际变化:</span>
                    <span className="avg-value">{analysis.averageActualPercent.toFixed(2)}%</span>
                  </div>
                  <div className="avg-item">
                    <span className="avg-label">预测偏差:</span>
                    <span className="avg-value">
                      {Math.abs(analysis.averagePredictedPercent - analysis.averageActualPercent).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StockPredictionPage;
