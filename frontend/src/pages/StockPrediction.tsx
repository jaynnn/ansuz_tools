import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { StockPrediction, StockAnalysis } from '../types/stock';
import { stockPredictionsAPI } from '../api';
import '../styles/StockPrediction.css';

const StockPredictionPage: React.FC = () => {
  const [predictions, setPredictions] = useState<StockPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load predictions from server
  useEffect(() => {
    const loadPredictions = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Try to load from server first
        const response = await stockPredictionsAPI.getAll();
        setPredictions(response.predictions || []);
        
        // Check if there's data in localStorage that needs to be migrated
        const localData = localStorage.getItem('stockPredictions');
        if (localData) {
          try {
            const localPredictions = JSON.parse(localData);
            if (Array.isArray(localPredictions) && localPredictions.length > 0) {
              // Migrate data to server
              await stockPredictionsAPI.batchCreate(localPredictions);
              // Reload from server
              const newResponse = await stockPredictionsAPI.getAll();
              setPredictions(newResponse.predictions || []);
              // Clear localStorage after successful migration
              localStorage.removeItem('stockPredictions');
              console.log('Successfully migrated stock predictions to server');
            }
          } catch (migrationError) {
            console.error('Failed to migrate localStorage data:', migrationError);
          }
        }
      } catch (err: any) {
        console.error('Failed to load predictions:', err);
        setError(err.response?.data?.error || 'Failed to load predictions');
      } finally {
        setLoading(false);
      }
    };
    
    loadPredictions();
  }, []);

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

  const addNewRow = async () => {
    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      const newPrediction = {
        stockInfo: '',
        predictionDate: today,
        predictedChange: 'up' as const,
        predictedPercent: 0,
        actualChange: 'up' as const,
        actualPercent: 0,
        isComplete: false,
      };
      
      const response = await stockPredictionsAPI.create(newPrediction);
      setPredictions([...predictions, response.prediction]);
    } catch (err: any) {
      console.error('Failed to create prediction:', err);
      alert('Failed to create prediction: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const updatePrediction = async (id: string, field: keyof StockPrediction, value: string | number) => {
    const prediction = predictions.find(p => p.id === id);
    if (!prediction) return;
    
    const updated = { ...prediction, [field]: value };
    updated.isComplete = 
      updated.stockInfo.trim() !== '' &&
      updated.predictedPercent !== 0 &&
      updated.actualPercent !== 0;

    // Update locally first for immediate feedback
    setPredictions(predictions.map(p => p.id === id ? updated : p));

    // Then update on server
    try {
      await stockPredictionsAPI.update(id, {
        stockInfo: updated.stockInfo,
        predictionDate: updated.predictionDate,
        predictedChange: updated.predictedChange,
        predictedPercent: updated.predictedPercent,
        actualChange: updated.actualChange,
        actualPercent: updated.actualPercent,
        isComplete: updated.isComplete,
      });
    } catch (err: any) {
      console.error('Failed to update prediction:', err);
      // Revert local state on error
      setPredictions(predictions.map(p => p.id === id ? prediction : p));
      alert('Failed to save changes: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const deleteRow = async (id: string) => {
    if (window.confirm('确定要删除这条记录吗？')) {
      try {
        await stockPredictionsAPI.delete(id);
        setPredictions(predictions.filter(p => p.id !== id));
      } catch (err: any) {
        console.error('Failed to delete prediction:', err);
        alert('Failed to delete prediction: ' + (err.response?.data?.error || 'Unknown error'));
      }
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
    .map((p, index) => {
      // Format date for display, fallback to stock info or numbered prediction
      let dateDisplay: string;
      if (p.predictionDate) {
        dateDisplay = new Date(p.predictionDate).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      } else {
        dateDisplay = p.stockInfo.substring(0, 10) || `预测${index + 1}`;
      }
      
      return {
        name: dateDisplay,
        预测变化: p.predictedChange === 'up' ? p.predictedPercent : -p.predictedPercent,
        实际变化: p.actualChange === 'up' ? p.actualPercent : -p.actualPercent,
      };
    });

  return (
    <div className="stock-prediction-page">
      <header className="stock-header">
        <h1>📈 我的股票预测记录</h1>
        <button onClick={() => window.history.back()} className="btn-back">
          返回主页
        </button>
      </header>

      {loading ? (
        <div className="loading-message">加载中...</div>
      ) : error ? (
        <div className="error-message">错误: {error}</div>
      ) : (
        <>
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
                <th>日期</th>
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
                  <td colSpan={7} className="empty-message">
                    暂无数据，点击"添加新记录"开始预测吧！
                  </td>
                </tr>
              ) : (
                predictions.map(prediction => (
                  <tr key={prediction.id} className={getRowClass(prediction)}>
                    <td>
                      <input
                        type="date"
                        value={prediction.predictionDate || ''}
                        onChange={(e) => updatePrediction(prediction.id, 'predictionDate', e.target.value)}
                        className="input-field date-field"
                      />
                    </td>
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
        </>
      )}
    </div>
  );
};

export default StockPredictionPage;
