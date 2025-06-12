'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';
import { 
  AnalysisSession, 
  SessionDetailResponse,
  ApiErrorResponse,
  ApiSuccessResponse
} from '../../types/analysis';

// 時系列分析固有の型定義
interface TimeSeriesParams {
  target_column: string;
  date_column?: string;
  feature_columns: string[];
  forecast_periods: number;
  test_size: number;
}

interface TimeSeriesPrediction {
  timestamp: string;
  predicted_value: number;
  actual_value?: number;
  residual?: number;
  order_index: number;
}

interface TimeSeriesActualValue {
  timestamp: string;
  value: number;
  order_index: number;
}

interface TimeSeriesForecast {
  timestamp: string;
  predicted_value: number;
  order_index: number;
}

interface TimeSeriesModelMetrics {
  train: {
    rmse: number;
    mae: number;
    r2: number;
    mape: number;
  };
  test: {
    rmse: number;
    mae: number;
    r2: number;
    mape: number;
  };
  r2_score: number;
  rmse: number;
  mae: number;
}

interface TimeSeriesInfo {
  start_date: string;
  end_date: string;
  frequency: string;
  trend: string;
}

interface TimeSeriesDataInfo {
  total_samples: number;
  train_samples: number;
  test_samples: number;
  feature_count: number;
  target_column: string;
  feature_columns: string[];
}

interface TimeSeriesAnalysisResult {
  success: boolean;
  session_id: number;
  session_name: string;
  analysis_type: 'timeseries';
  plot_base64: string;
  data: {
    model_type: string;
    target_column: string;
    feature_columns: string[];
    forecast_periods: number;
    model_metrics: TimeSeriesModelMetrics;
    feature_importance: [string, number][];
    predictions: TimeSeriesPrediction[];
    actual_values: TimeSeriesActualValue[];
    future_predictions: TimeSeriesForecast[];
    timeseries_info: TimeSeriesInfo;
    data_info: TimeSeriesDataInfo;
    coordinates: {
      actual: Array<{ timestamp: string; value: number; }>;
      predictions: Array<{ timestamp: string; predicted: number; actual: number; residual: number; }>;
      forecast: Array<{ timestamp: string; predicted: number; }>;
    };
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    target_column: string;
    feature_columns: string[];
  };
  session_info: {
    session_id: number;
    session_name: string;
    description: string;
    tags: string[];
    analysis_timestamp: string;
    filename: string;
    analysis_type: 'timeseries';
    row_count: number;
    column_count: number;
  };
}

// レスポンス型の統合
type TimeSeriesApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function TimeSeriesPage() {
  // 状態管理
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<TimeSeriesParams>({
    target_column: '',
    date_column: '',
    feature_columns: [],
    forecast_periods: 30,
    test_size: 0.2
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimeSeriesAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // デバッグ用のuseEffect
  useEffect(() => {
    console.log('=== Result State Changed ===', {
      hasResult: !!result,
      resultSuccess: result?.success,
      resultData: !!result?.data,
      resultKeys: result ? Object.keys(result) : [],
      dataKeys: result?.data ? Object.keys(result.data) : []
    });
  }, [result]);
  // セッション履歴を取得
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      const params = new URLSearchParams({
        userId: 'default',
        limit: '50',
        offset: '0'
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      // 時系列分析専用のAPIエンドポイントを使用
      console.log('🔍 TimeSeries sessions request:', `/api/timeseries/sessions?${params.toString()}`);
      
      const response = await fetch(`/api/timeseries/sessions?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const data = await response.json();
      
      console.log('📊 API Response:', {
        totalSessions: data.data?.length || 0,
        firstSession: data.data?.[0]
      });

      if (data.success) {
        const timeseriesSessions = Array.isArray(data.data) ? data.data : [];
        
        console.log(`✅ TimeSeries sessions loaded: ${timeseriesSessions.length}件`);
        setSessions(timeseriesSessions);

        if (timeseriesSessions.length === 0) {
          console.log('⚠️ 時系列分析のセッションが見つかりませんでした');
        }

      } else {
        console.error('❌ API Error:', data.error);
        setError(data.error || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('❌ Error in fetchSessions:', error);
      setError(error instanceof Error ? error.message : 'データ取得中にエラーが発生しました');
    } finally {
      setSessionsLoading(false);
    }
  };

// セッション詳細を取得
const fetchSessionDetail = async (sessionId: number) => {
  try {
    console.log('🔍 時系列分析セッション詳細取得開始:', sessionId);
    setError(null);
    
    // Next.js APIルート経由でFastAPIを呼び出し
    const response = await fetch(`/api/timeseries/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'セッション詳細の取得に失敗しました');
    }

    const pythonResponse = data.data || {};
    console.log('📥 Timeseries session detail response:', pythonResponse);

    // レスポンス構造の詳細ログ
    console.log('🔍 Python response structure:', {
      keys: Object.keys(pythonResponse),
      sessionInfo: pythonResponse.session_info ? Object.keys(pythonResponse.session_info) : null,
      analysisData: pythonResponse.analysis_data ? Object.keys(pythonResponse.analysis_data) : null,
      visualization: pythonResponse.visualization ? Object.keys(pythonResponse.visualization) : null,
    });

    // 予測データの取得
    let predictions: TimeSeriesPrediction[] = [];
    let actualValues: TimeSeriesActualValue[] = [];
    let futurePredictions: TimeSeriesForecast[] = [];

    if (pythonResponse.analysis_data) {
      predictions = pythonResponse.analysis_data.predictions || [];
      actualValues = pythonResponse.analysis_data.actual_values || [];
      futurePredictions = pythonResponse.analysis_data.future_predictions || [];
    }

    // モデル性能指標の取得
    let modelMetrics: TimeSeriesModelMetrics = {
      train: { rmse: 0, mae: 0, r2: 0, mape: 0 },
      test: { rmse: 0, mae: 0, r2: 0, mape: 0 },
      r2_score: 0,
      rmse: 0,
      mae: 0,
    };
    if (pythonResponse.analysis_data?.model_metrics) {
      modelMetrics = pythonResponse.analysis_data.model_metrics;
    }

    // 特徴量重要度の取得
    let featureImportance: [string, number][] = [];
    if (pythonResponse.analysis_data?.feature_importance) {
      featureImportance = pythonResponse.analysis_data.feature_importance;
    }

    // 時系列情報の取得
    let timeseriesInfo: TimeSeriesInfo = {
      start_date: '',
      end_date: '',
      frequency: 'Unknown',
      trend: '不明'
    };
    if (pythonResponse.analysis_data?.timeseries_info) {
      timeseriesInfo = pythonResponse.analysis_data.timeseries_info;
    }

    // データ情報の取得
    let dataInfo: TimeSeriesDataInfo = {
      total_samples: 0,
      train_samples: 0,
      test_samples: 0,
      feature_count: 0,
      target_column: '',
      feature_columns: []
    };
    if (pythonResponse.analysis_data?.data_info) {
      dataInfo = pythonResponse.analysis_data.data_info;
    }

    // プロット画像の取得
    let plotImage = '';
    if (pythonResponse.visualization?.plot_image) {
      plotImage = pythonResponse.visualization.plot_image;
    } else if (pythonResponse.plot_image) {
      plotImage = pythonResponse.plot_image;
    }

    // 時系列分析結果への型安全な変換処理
    const analysisResult: TimeSeriesAnalysisResult = {
      success: true,
      session_id: pythonResponse.session_info?.session_id || sessionId,
      session_name: pythonResponse.session_info?.session_name || '',
      analysis_type: 'timeseries',
      plot_base64: plotImage,
      data: {
        model_type: pythonResponse.analysis_data?.model_type || 'lightgbm',
        target_column: dataInfo.target_column,
        feature_columns: dataInfo.feature_columns,
        forecast_periods: pythonResponse.analysis_data?.forecast_periods || 30,
        model_metrics: modelMetrics,
        feature_importance: featureImportance,
        predictions: predictions,
        actual_values: actualValues,
        future_predictions: futurePredictions,
        timeseries_info: timeseriesInfo,
        data_info: dataInfo,
        coordinates: {
          actual: actualValues.map(av => ({ timestamp: av.timestamp, value: av.value })),
          predictions: predictions.map(p => ({ 
            timestamp: p.timestamp, 
            predicted: p.predicted_value, 
            actual: p.actual_value || 0, 
            residual: p.residual || 0 
          })),
          forecast: futurePredictions.map(fp => ({ timestamp: fp.timestamp, predicted: fp.predicted_value }))
        }
      },
      metadata: {
        session_name: pythonResponse.session_info?.session_name || '',
        filename: pythonResponse.session_info?.filename || pythonResponse.metadata?.filename || '',
        rows: pythonResponse.metadata?.rows || pythonResponse.session_info?.row_count || 0,
        columns: pythonResponse.metadata?.columns || pythonResponse.session_info?.column_count || 0,
        target_column: dataInfo.target_column,
        feature_columns: dataInfo.feature_columns,
      },
      session_info: {
        session_id: pythonResponse.session_info?.session_id || sessionId,
        session_name: pythonResponse.session_info?.session_name || '',
        description: pythonResponse.session_info?.description || '',
        tags: pythonResponse.session_info?.tags || [],
        analysis_timestamp: pythonResponse.session_info?.analysis_timestamp || '',
        filename: pythonResponse.session_info?.filename || pythonResponse.metadata?.filename || '',
        analysis_type: 'timeseries',
        row_count: pythonResponse.metadata?.rows || pythonResponse.session_info?.row_count || 0,
        column_count: pythonResponse.metadata?.columns || pythonResponse.session_info?.column_count || 0,
      }
    };

    console.log('📊 Building TimeSeries analysis result:', analysisResult);
    setResult(analysisResult);
    console.log('✅ TimeSeries session details loaded successfully');

  } catch (error) {
    console.error('❌ 時系列分析セッション詳細取得エラー:', error);
    setError(error instanceof Error ? error.message : 'セッション詳細の取得中にエラーが発生しました');
  }
};

  // セッションを削除
  const deleteSession = async (sessionId: number) => {
    if (!confirm('このセッションを削除しますか？')) return;

    try {
      // 既存の汎用削除APIを使用（[id]パラメータ）
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchSessions();
        if (result?.session_id === sessionId) {
          setResult(null);
        }
      } else {
        const errorData = await response.json();
        console.error('削除エラー:', errorData);
        alert('削除に失敗しました');
      }
    } catch (err) {
      console.error('セッション削除エラー:', err);
      alert('削除中にエラーが発生しました');
    }
  };

  // CSVファイルをダウンロード
  const downloadCSV = async (sessionId: number) => {
    try {
      console.log('Downloading original CSV for session:', sessionId);
      
      // 既存の汎用CSV APIを使用（[id]パラメータ）
      const response = await fetch(`/api/sessions/${sessionId}/csv`);
      if (!response.ok) {
        throw new Error('ダウンロードに失敗しました');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `session_${sessionId}_data.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Original CSV download completed');
      
    } catch (err) {
      console.error('CSVダウンロードエラー:', err);
      alert('CSVファイルのダウンロードに失敗しました');
    }
  };

  // プロット画像をダウンロード
  const downloadPlotImage = async (sessionId: number) => {
    try {
      console.log('Downloading plot image for session:', sessionId);
      
      // 既存の汎用画像APIを使用（[id]パラメータ）
      const response = await fetch(`/api/sessions/${sessionId}/image`);
      if (!response.ok) {
        throw new Error('ダウンロードに失敗しました');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `timeseries_analysis_${sessionId}_plot.png`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Plot image download completed');
      
    } catch (err) {
      console.error('画像ダウンロードエラー:', err);
      alert('プロット画像のダウンロードに失敗しました');
    }
  };

  // 予測結果CSVをダウンロード
  const downloadPredictionsCSV = async (sessionId: number) => {
    try {
      console.log('Downloading predictions CSV for session:', sessionId);
      
      const response = await fetch(`/api/timeseries/download/${sessionId}/predictions`);
      if (!response.ok) {
        throw new Error('予測結果CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `timeseries_predictions_${sessionId}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Predictions CSV download completed');
      
    } catch (err) {
      console.error('予測結果CSVダウンロードエラー:', err);
      alert('予測結果CSVのダウンロードに失敗しました');
    }
  };

  // 未来予測CSVをダウンロード
  const downloadForecastCSV = async (sessionId: number) => {
    try {
      console.log('Downloading forecast CSV for session:', sessionId);
      
      const response = await fetch(`/api/timeseries/download/${sessionId}/forecast`);
      if (!response.ok) {
        throw new Error('未来予測CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `timeseries_forecast_${sessionId}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Forecast CSV download completed');
      
    } catch (err) {
      console.error('未来予測CSVダウンロードエラー:', err);
      alert('未来予測CSVのダウンロードに失敗しました');
    }
  };

  // 特徴量重要度CSVをダウンロード
  const downloadFeatureImportanceCSV = async (sessionId: number) => {
    try {
      console.log('Downloading feature importance CSV for session:', sessionId);
      
      const response = await fetch(`/api/timeseries/download/${sessionId}/feature_importance`);
      if (!response.ok) {
        throw new Error('特徴量重要度CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `feature_importance_${sessionId}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Feature importance CSV download completed');
      
    } catch (err) {
      console.error('特徴量重要度CSVダウンロードエラー:', err);
      alert('特徴量重要度CSVのダウンロードに失敗しました');
    }
  };

  // 詳細結果CSVをダウンロード
  const downloadDetailsCSV = async (sessionId: number) => {
    try {
      console.log('Downloading details CSV for session:', sessionId);
      
      const response = await fetch(`/api/timeseries/download/${sessionId}/details`);
      if (!response.ok) {
        throw new Error('詳細結果CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `timeseries_details_${sessionId}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Details CSV download completed');
      
    } catch (err) {
      console.error('詳細結果CSVダウンロードエラー:', err);
      alert('詳細結果CSVのダウンロードに失敗しました');
    }
  };

  // 初回ロード時にセッション履歴を取得
  useEffect(() => {
    console.log('🔄 Initial sessions fetch');
    fetchSessions();
  }, []);

  // 検索クエリが変わったときにセッション履歴を再取得
  useEffect(() => {
    console.log('🔍 Search query changed:', searchQuery);
    const timeoutId = setTimeout(() => {
      fetchSessions();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // ファイル選択時の処理
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    
    // ファイル名から自動的にセッション名を生成
    if (!sessionName && selectedFile.name) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setSessionName(`${nameWithoutExt}_時系列分析`);
    }

    // CSVファイルの列名を取得
    try {
      const fileContent = await selectedFile.text();
      const lines = fileContent.split('\n').map(line => line.trim()).filter(Boolean);
      
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim());
        if (headers.length > 1) {
          setAvailableColumns(headers);
          
          // デフォルト設定
          if (headers.length >= 2) {
            setParameters(prev => ({
              ...prev,
              target_column: headers[1], // 最初の列を目的変数に
              date_column: headers[0], // 最初の列を日付列に
              feature_columns: headers.length > 2 ? [headers[2]] : [] // 3番目の列を特徴量に
            }));
          }
        }
      }
    } catch (err) {
      console.error('CSVファイルの解析エラー:', err);
    }
  };

  // 特徴量の追加・削除
  const addFeatureVariable = (variable: string) => {
    if (!parameters.feature_columns.includes(variable)) {
      setParameters(prev => ({
        ...prev,
        feature_columns: [...prev.feature_columns, variable]
      }));
    }
  };

  const removeFeatureVariable = (variable: string) => {
    setParameters(prev => ({
      ...prev,
      feature_columns: prev.feature_columns.filter(v => v !== variable)
    }));
  };

  const handleUpload = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    if (!sessionName.trim()) {
      setError('セッション名を入力してください');
      return;
    }

    if (!parameters.target_column) {
      setError('目的変数を選択してください');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // CSVファイルの基本検証
      const fileContent = await file.text();
      const lines = fileContent.split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      
      if (lines.length < 3) {
        throw new Error('データが不足しています。ヘッダー行と最低2行のデータが必要です。');
      }

      // ヘッダーとデータの検証
      const headers = lines[0].split(',').map(h => h.trim());
      if (headers.length < 2) {
        throw new Error('列が不足しています。最低2列のデータが必要です。');
      }

      console.log('ファイル検証完了:', {
        fileName: file.name,
        rows: lines.length - 1,
        columns: headers.length,
        headers: headers.slice(0, 3)
      });

      // FormDataの準備
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_name', sessionName.trim());
      formData.append('description', description.trim());
      formData.append('tags', tags.trim());
      formData.append('user_id', 'default');
      formData.append('target_column', parameters.target_column);
      formData.append('forecast_periods', parameters.forecast_periods.toString());
      formData.append('test_size', parameters.test_size.toString());
      
      // オプションパラメータの追加
      if (parameters.date_column) {
        formData.append('date_column', parameters.date_column);
      }
      if (parameters.feature_columns.length > 0) {
        formData.append('feature_columns', parameters.feature_columns.join(','));
      }

      console.log('=== Starting TimeSeries Analysis ===');
      console.log('Parameters:', {
        session_name: sessionName,
        target_column: parameters.target_column,
        date_column: parameters.date_column,
        feature_columns: parameters.feature_columns,
        forecast_periods: parameters.forecast_periods,
        test_size: parameters.test_size
      });
      
      const response = await fetch('/api/timeseries/analyze', {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      console.log('=== Raw API Response ===');
      console.log('Status:', response.status);
      console.log('Response Text:', responseText.substring(0, 1000), '...');

      let data: TimeSeriesApiResponse;
      try {
        data = JSON.parse(responseText) as TimeSeriesApiResponse;
        console.log('=== Parsed API Response ===');
        console.log('Full Data:', data);
        console.log('Data Structure:', {
          success: data.success,
          hasData: 'data' in data,
          dataKeys: 'data' in data ? Object.keys((data as any).data || {}) : [],
        });
      } catch (parseError) {
        console.error('Response parsing error:', parseError);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      if (!response.ok) {
        console.error('TimeSeries API Error:', data);
        
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || '時系列分析中にエラーが発生しました';
          
          if (errorData.hints && Array.isArray(errorData.hints)) {
            errorMessage += '\n\n推奨事項:\n' + errorData.hints.map((hint: string) => `• ${hint}`).join('\n');
          }
          
          throw new Error(errorMessage);
        }
      }

      if (!data.success) {
        throw new Error('error' in data ? data.error : '時系列分析に失敗しました');
      }

      console.log('=== Processing Successful Response ===');
      const successData = data as ApiSuccessResponse;

      // バックエンドから直接画像データを取得
      const plotImage = successData.data?.plot_image || 
                       successData.plot_base64 || 
                       successData.visualization?.plot_image || "";
      
      console.log('画像データの取得状況:');
      console.log('- plot_image length:', plotImage ? `${plotImage.length} chars` : 'undefined');
      
      if (plotImage) {
        console.log('バックエンドから直接画像データを取得しました');
        
        const analysisResult: TimeSeriesAnalysisResult = {
          success: true,
          session_id: successData.session_id,
          session_name: sessionName,
          analysis_type: 'timeseries',
          plot_base64: plotImage,
          data: {
            model_type: successData.data?.model_type || 'lightgbm',
            target_column: successData.data?.target_column || parameters.target_column,
            feature_columns: successData.data?.feature_columns || parameters.feature_columns,
            forecast_periods: successData.data?.forecast_periods || parameters.forecast_periods,
            model_metrics: successData.data?.model_metrics || {
              train: { rmse: 0, mae: 0, r2: 0, mape: 0 },
              test: { rmse: 0, mae: 0, r2: 0, mape: 0 },
              r2_score: 0, rmse: 0, mae: 0
            },
            feature_importance: successData.data?.feature_importance || [],
            predictions: successData.data?.predictions || [],
            actual_values: successData.data?.actual_values || [],
            future_predictions: successData.data?.future_predictions || [],
            timeseries_info: successData.data?.timeseries_info || {
              start_date: '', end_date: '', frequency: 'Unknown', trend: '不明'
            },
            data_info: successData.data?.data_info || {
              total_samples: 0, train_samples: 0, test_samples: 0, feature_count: 0,
              target_column: parameters.target_column, feature_columns: parameters.feature_columns
            },
            coordinates: successData.data?.coordinates || { actual: [], predictions: [], forecast: [] }
          },
          metadata: {
            session_name: sessionName,
            filename: file.name,
            rows: successData.metadata?.rows || 0,
            columns: successData.metadata?.columns || 0,
            target_column: parameters.target_column,
            feature_columns: parameters.feature_columns,
          },
          session_info: {
            session_id: successData.session_id,
            session_name: sessionName,
            description: description,
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
            analysis_timestamp: new Date().toISOString(),
            filename: file.name,
            analysis_type: 'timeseries',
            row_count: successData.metadata?.rows || 0,
            column_count: successData.metadata?.columns || 0,
          }
        };

        setResult(analysisResult);
        fetchSessions();
        
        console.log('新規分析完了: 画像データ付きで結果を設定しました');
        
      } else {
        // 画像データが取得できない場合はセッション詳細から取得を試行
        console.log('画像データが取得できないため、セッション詳細から取得を試行します');
        
        if (successData.session_id) {
          try {
            // セッション詳細を取得（画像データ含む）
            await fetchSessionDetail(Number(successData.session_id));
            
            // 履歴も更新
            fetchSessions();
            
            console.log('新規分析完了: セッション詳細から画像を取得しました');
            
          } catch (detailError) {
            console.error('セッション詳細取得エラー:', detailError);
            
            // セッション詳細の取得に失敗した場合は、画像なしで結果を表示
            const analysisResult: TimeSeriesAnalysisResult = {
              success: true,
              session_id: successData.session_id,
              session_name: sessionName,
              analysis_type: 'timeseries',
              plot_base64: "", // 画像なし
              data: {
                model_type: successData.data?.model_type || 'lightgbm',
                target_column: successData.data?.target_column || parameters.target_column,
                feature_columns: successData.data?.feature_columns || parameters.feature_columns,
                forecast_periods: successData.data?.forecast_periods || parameters.forecast_periods,
                model_metrics: successData.data?.model_metrics || {
                  train: { rmse: 0, mae: 0, r2: 0, mape: 0 },
                  test: { rmse: 0, mae: 0, r2: 0, mape: 0 },
                  r2_score: 0, rmse: 0, mae: 0
                },
                feature_importance: successData.data?.feature_importance || [],
                predictions: successData.data?.predictions || [],
                actual_values: successData.data?.actual_values || [],
                future_predictions: successData.data?.future_predictions || [],
                timeseries_info: successData.data?.timeseries_info || {
                  start_date: '', end_date: '', frequency: 'Unknown', trend: '不明'
                },
                data_info: successData.data?.data_info || {
                  total_samples: 0, train_samples: 0, test_samples: 0, feature_count: 0,
                  target_column: parameters.target_column, feature_columns: parameters.feature_columns
                },
                coordinates: successData.data?.coordinates || { actual: [], predictions: [], forecast: [] }
              },
              metadata: {
                session_name: sessionName,
                filename: file.name,
                rows: successData.metadata?.rows || 0,
                columns: successData.metadata?.columns || 0,
                target_column: parameters.target_column,
                feature_columns: parameters.feature_columns,
              },
              session_info: {
                session_id: successData.session_id,
                session_name: sessionName,
                description: description,
                tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
                analysis_timestamp: new Date().toISOString(),
                filename: file.name,
                analysis_type: 'timeseries',
                row_count: successData.metadata?.rows || 0,
                column_count: successData.metadata?.columns || 0,
              }
            };

            setResult(analysisResult);
            fetchSessions();
            
            console.warn('画像なしで結果を表示しました');
          }
        } else {
          throw new Error('セッションIDが取得できませんでした');
        }
      }
      
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP');
  };

  const formatNumber = (num: number | string | null | undefined, decimals: number = 3) => {
    if (num === null || num === undefined || num === '') return '0.000';
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(numValue) ? '0.000' : numValue.toFixed(decimals);
  };

  return (
    <AnalysisLayout
      title="時系列分析"
      description="時間軸に沿ったデータの傾向を分析し、未来の値を予測する分析手法です"
      analysisType="timeseries"
    >
      {/* タブナビゲーション */}
      <div className="bg-white rounded-lg shadow-lg mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'upload'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                新規分析
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'history'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                分析履歴
              </span>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'upload' ? (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4">新しい時系列分析を実行</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">セッション情報</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        セッション名 *
                      </label>
                      <input
                        type="text"
                        value={sessionName}
                        onChange={(e) => setSessionName(e.target.value)}
                        placeholder="例: 売上予測時系列分析2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        説明
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="分析の詳細や目的を記述してください"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        タグ
                      </label>
                      <input
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="例: 売上予測, 時系列分析, LightGBM"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        予測期間
                      </label>
                      <select
                        value={parameters.forecast_periods}
                        onChange={(e) => setParameters({...parameters, forecast_periods: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value={7}>7期間</option>
                        <option value={14}>14期間</option>
                        <option value={30}>30期間</option>
                        <option value={60}>60期間</option>
                        <option value={90}>90期間</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        未来の何期間先まで予測するかを指定します
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        テストデータの割合
                      </label>
                      <select
                        value={parameters.test_size}
                        onChange={(e) => setParameters({...parameters, test_size: parseFloat(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value={0.1}>10%</option>
                        <option value={0.15}>15%</option>
                        <option value={0.2}>20%</option>
                        <option value={0.25}>25%</option>
                        <option value={0.3}>30%</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        モデル評価に使用するデータの割合
                      </p>
                    </div>
                  </div>

                  {/* 変数選択 */}
                  {availableColumns.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                      <h3 className="font-medium text-gray-900">変数選択</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          目的変数（予測対象） *
                        </label>
                        <select
                          value={parameters.target_column}
                          onChange={(e) => setParameters({...parameters, target_column: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">選択してください</option>
                          {availableColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          日付列（オプション）
                        </label>
                        <select
                          value={parameters.date_column}
                          onChange={(e) => setParameters({...parameters, date_column: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">自動インデックス使用</option>
                          {availableColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <p className="text-sm text-gray-500 mt-1">
                          指定しない場合は行番号が時系列インデックスとして使用されます
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          説明変数（特徴量）
                        </label>
                        <div className="space-y-2">
                          {availableColumns
                            .filter(col => col !== parameters.target_column && col !== parameters.date_column)
                            .map(col => (
                            <label key={col} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={parameters.feature_columns.includes(col)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    addFeatureVariable(col);
                                  } else {
                                    removeFeatureVariable(col);
                                  }
                                }}
                                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-sm text-gray-700">{col}</span>
                            </label>
                          ))}
                        </div>
                        
                        {parameters.feature_columns.length > 0 && (
                          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-sm text-blue-700">
                              選択済み: {parameters.feature_columns.join(', ')}
                            </p>
                          </div>
                        )}
                        
                        <p className="text-sm text-gray-500 mt-1">
                          特徴量を指定しない場合、ラグ特徴量や移動平均などが自動生成されます
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">データファイル</h3>
                    <FileUpload
                      onFileSelect={handleFileSelect}
                      accept=".csv"
                      disabled={loading}
                    />
                    
                    {file && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-700">
                          選択されたファイル: <span className="font-medium">{file.name}</span>
                        </p>
                        {availableColumns.length > 0 && (
                          <p className="text-sm text-blue-600 mt-1">
                            利用可能な列: {availableColumns.length}個
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={!file || !sessionName.trim() || !parameters.target_column || loading}
                    className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 
                               disabled:opacity-50 disabled:cursor-not-allowed font-medium
                               flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        分析中...
                      </>
                    ) : (
                      '時系列分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">時系列分析履歴</h2>
                <div className="flex items-center space-x-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="セッション名、ファイル名で検索..."
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={fetchSessions}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                  >
                    更新
                  </button>
                </div>
              </div>

              {sessionsLoading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">読み込み中...</p>
                </div>
                ) : sessions.length === 0 ? (
                <div className="text-center py-8">
                    <div className="text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-lg font-medium">時系列分析のセッションがありません</p>
                    <p className="mt-2 text-sm">新しい分析を実行してデータを追加してください</p>
                    </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {sessions.map((session) => (
                    <div
                      key={session.session_id}
                      className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors cursor-pointer border"
                      onClick={() => fetchSessionDetail(session.session_id)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900 truncate">{session.session_name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.session_id);
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">{session.filename}</p>
                      
                      {session.description && (
                        <p className="text-sm text-gray-500 mb-2 line-clamp-2">{session.description}</p>
                      )}
                      
                      <div className="flex flex-wrap gap-1 mb-2">
                        {session.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>分析日時: {formatDate(session.analysis_timestamp)}</p>
                        <p>データサイズ: {session.row_count} × {session.column_count}</p>
                        {session.dimension_1_contribution && (
                          <p>R²値: {session.dimension_1_contribution.toFixed(3)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="ml-3">
              <h3 className="font-medium text-red-800">エラーが発生しました</h3>
              <p className="mt-1 text-sm text-red-700 whitespace-pre-line">{error}</p>
            </div>
          </div>
        </div>
      )}
      {/* 結果表示 */}
      {result && result.success && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">時系列分析結果</h2>
            <div className="flex items-center space-x-2">
              {result.session_id && (
                <>
                  <span className="text-sm text-gray-500 mr-4">
                    セッションID: {result.session_id}
                  </span>
                  <button
                    onClick={() => downloadCSV(Number(result.session_id))}
                    className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    元CSV
                  </button>
                  <button
                    onClick={() => downloadPredictionsCSV(result.session_id)}
                    className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    予測結果CSV
                  </button>
                  <button
                    onClick={() => downloadForecastCSV(result.session_id)}
                    className="bg-purple-600 text-white px-3 py-1 rounded-md hover:bg-purple-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    未来予測CSV
                  </button>
                  <button
                    onClick={() => downloadFeatureImportanceCSV(result.session_id)}
                    className="bg-orange-600 text-white px-3 py-1 rounded-md hover:bg-orange-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    特徴量重要度CSV
                  </button>
                  <button
                    onClick={() => downloadDetailsCSV(result.session_id)}
                    className="bg-gray-600 text-white px-3 py-1 rounded-md hover:bg-gray-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    詳細結果CSV
                  </button>
                  <button
                    onClick={() => downloadPlotImage(result.session_id)}
                    className="bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    プロット画像
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* メタデータ表示 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">ファイル情報</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">セッション名:</dt>
                  <dd className="font-medium">{result.metadata?.session_name || result.session_name || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">ファイル名:</dt>
                  <dd className="font-medium">{result.metadata?.filename || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">サンプル数:</dt>
                  <dd className="font-medium">{result.metadata?.rows || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">変数数:</dt>
                  <dd className="font-medium">{result.metadata?.columns || '-'}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">分析設定</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">モデル:</dt>
                  <dd className="font-medium">{result.data?.model_type?.toUpperCase() || 'LightGBM'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">目的変数:</dt>
                  <dd className="font-medium">{result.data?.target_column || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">予測期間:</dt>
                  <dd className="font-medium">{result.data?.forecast_periods || 0}期間</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">特徴量数:</dt>
                  <dd className="font-medium">{result.data?.feature_columns?.length || 0}個</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 時系列情報 */}
          {result.data?.timeseries_info && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">時系列データ情報</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-blue-600">
                    {result.data.timeseries_info.start_date?.split(' ')[0] || '不明'}
                  </div>
                  <div className="text-sm text-blue-700">開始日</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-green-600">
                    {result.data.timeseries_info.end_date?.split(' ')[0] || '不明'}
                  </div>
                  <div className="text-sm text-green-700">終了日</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-orange-600">
                    {result.data.timeseries_info.frequency || 'Unknown'}
                  </div>
                  <div className="text-sm text-orange-700">頻度</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-purple-600">
                    {result.data.timeseries_info.trend || '不明'}
                  </div>
                  <div className="text-sm text-purple-700">トレンド</div>
                </div>
              </div>
            </div>
          )}

          {/* モデル性能指標 */}
          {result.data?.model_metrics && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">モデル性能指標</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatNumber(result.data.model_metrics.r2_score, 3)}
                  </div>
                  <div className="text-sm text-blue-700">決定係数 (R²)</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatNumber(result.data.model_metrics.rmse, 3)}
                  </div>
                  <div className="text-sm text-green-700">RMSE</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatNumber(result.data.model_metrics.mae, 3)}
                  </div>
                  <div className="text-sm text-orange-700">MAE</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatNumber(result.data.model_metrics.test.mape, 2)}%
                  </div>
                  <div className="text-sm text-purple-700">MAPE</div>
                </div>
              </div>

              {/* 訓練・テストデータ比較 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-2 text-center">訓練データ</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>RMSE:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.train.rmse, 4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MAE:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.train.mae, 4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>R²:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.train.r2, 4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MAPE:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.train.mape, 2)}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-2 text-center">テストデータ</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>RMSE:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.test.rmse, 4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MAE:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.test.mae, 4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>R²:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.test.r2, 4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MAPE:</span>
                      <span className="font-medium">{formatNumber(result.data.model_metrics.test.mape, 2)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 特徴量重要度 */}
          {result.data?.feature_importance && result.data.feature_importance.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">特徴量重要度</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">特徴量</th>
                      <th className="px-4 py-2 text-right">重要度</th>
                      <th className="px-4 py-2 text-center">相対重要度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.feature_importance.slice(0, 10).map(([feature, importance], index) => {
                      const maxImportance = Math.max(...result.data!.feature_importance.map(([, imp]) => imp));
                      const relativeImportance = maxImportance > 0 ? (importance / maxImportance) * 100 : 0;
                      return (
                        <tr key={feature} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{feature}</td>
                          <td className="px-4 py-2 text-right">{formatNumber(importance, 6)}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center">
                              <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{width: `${relativeImportance}%`}}
                                ></div>
                              </div>
                              <span className="text-xs">{relativeImportance.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* プロット画像 */}
          {result.plot_base64 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">時系列分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.plot_base64}`}
                  alt="時系列分析プロット"
                  width={1600}
                  height={1200}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>
          )}

          {/* 予測結果の詳細 */}
          {result.data?.predictions && result.data.predictions.length > 0 && (
            <div className="mt-8">
              <h3 className="font-semibold mb-4">予測結果の詳細</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* テストデータ予測 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 flex items-center">
                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                    テストデータ予測
                    <span className="ml-2 text-sm text-gray-500">
                      ({result.data.predictions.length}件)
                    </span>
                  </h4>
                  
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">タイムスタンプ</th>
                          <th className="text-right p-2">予測値</th>
                          <th className="text-right p-2">実測値</th>
                          <th className="text-right p-2">残差</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {result.data.predictions.map((prediction, index) => (
                          <tr key={index} className="hover:bg-gray-100">
                            <td className="p-2 font-medium">
                              {prediction.timestamp.split(' ')[0]}
                            </td>
                            <td className="p-2 text-right">{formatNumber(prediction.predicted_value, 3)}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.actual_value, 3)}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.residual, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 未来予測 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 flex items-center">
                    <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                    未来予測
                    <span className="ml-2 text-sm text-gray-500">
                      ({result.data.future_predictions?.length || 0}件)
                    </span>
                  </h4>
                  
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">タイムスタンプ</th>
                          <th className="text-right p-2">予測値</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {result.data.future_predictions?.map((forecast, index) => (
                          <tr key={index} className="hover:bg-gray-100">
                            <td className="p-2 font-medium">
                              {forecast.timestamp.split(' ')[0]}
                            </td>
                            <td className="p-2 text-right">{formatNumber(forecast.predicted_value, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 分析結果の解釈とアドバイス */}
          {result.data?.model_metrics && (
            <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">時系列分析結果の解釈について</h3>
                  <div className="mt-2 text-sm text-yellow-700 space-y-2">
                    <p>
                      <strong>決定係数 R² ({formatNumber(result.data.model_metrics.r2_score, 3)})</strong>: 
                      モデルが目的変数の分散をどの程度説明できているかを示します。1に近いほど良好です。
                    </p>
                    <p>
                      <strong>RMSE ({formatNumber(result.data.model_metrics.rmse, 3)})</strong>: 
                      予測誤差の標準偏差です。目的変数の単位で解釈でき、小さいほど良好です。
                    </p>
                    <p>
                      <strong>MAPE ({formatNumber(result.data.model_metrics.test.mape, 2)}%)</strong>: 
                      平均絶対パーセント誤差。5%未満なら非常に良好、10%未満なら良好とされます。
                    </p>
                    {result.data.model_metrics.r2_score && result.data.model_metrics.r2_score < 0.5 && (
                      <p className="text-orange-700 font-medium">
                        ⚠️ R²値が0.5未満のため、モデルの予測精度が低い可能性があります。より多くの特徴量やデータの追加を検討してください。
                      </p>
                    )}
                    {result.data.model_metrics.train && result.data.model_metrics.test && 
                     Math.abs(result.data.model_metrics.train.r2 - result.data.model_metrics.test.r2) > 0.2 && (
                      <p className="text-orange-700 font-medium">
                        ⚠️ 訓練・テストデータ間でR²値の差が大きいため、過学習の可能性があります。
                      </p>
                    )}
                    <p>
                      <strong>トレンド分析</strong>: {result.data.timeseries_info?.trend || '不明'} - 
                      時系列データの全体的な傾向を示しています。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => window.print()}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              レポートを印刷
            </button>
            
            <button
              onClick={() => setActiveTab('upload')}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新しい分析を実行
            </button>
          </div>
        </div>
      )}

      {/* 分析手法の説明 */}
      <div className="mt-12 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="text-2xl mr-3">📈</span>
          時系列分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              時系列分析は、時間軸に沿ったデータの傾向を分析し、
              未来の値を予測する統計手法です。LightGBMを使用して
              高精度な機械学習ベースの予測を行います。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🔍 特徴</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• <strong>自動特徴量生成:</strong> ラグ・移動平均</li>
              <li>• <strong>LightGBM:</strong> 高性能機械学習</li>
              <li>• <strong>時間特徴量:</strong> 季節性・周期性</li>
              <li>• <strong>多変量対応:</strong> 外部変数の活用</li>
              <li>• <strong>性能評価:</strong> 多角的指標</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 適用場面</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• 売上・需要予測</li>
              <li>• 株価・金融予測</li>
              <li>• 気象・環境予測</li>
              <li>• 設備稼働率予測</li>
              <li>• Web トラフィック予測</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">📊 評価指標の解釈</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>R²（決定係数）:</strong> 
                0～1の値で、1に近いほど予測精度が高い
              </p>
              <p>
                <strong>RMSE:</strong> 
                予測誤差の大きさ。目的変数と同じ単位で解釈
              </p>
              <p>
                <strong>MAPE:</strong> 
                パーセント誤差。5%未満で非常に良好、10%未満で良好
              </p>
              <p>
                <strong>特徴量重要度:</strong> 
                各特徴量が予測にどの程度寄与しているかを示す
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">⚠️ 注意点</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>データ量:</strong> 
                十分なデータ量（最低30サンプル）が予測精度に重要
              </p>
              <p>
                <strong>外れ値:</strong> 
                極端な値は予測モデルに大きな影響を与える可能性
              </p>
              <p>
                <strong>未来予測:</strong> 
                予測期間が長いほど不確実性が増加
              </p>
              <p>
                <strong>構造変化:</strong> 
                過去のパターンが将来も続くとは限らない
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold mb-2 text-yellow-800">💡 より良い予測のためのヒント</h3>
          <div className="text-sm text-yellow-700 space-y-2">
            <p>
              <strong>1. データ品質:</strong> 
              欠損値や異常値を事前にチェックし、適切に処理する
            </p>
            <p>
              <strong>2. 特徴量選択:</strong> 
              目的変数と関連性の高い外部変数（天気、イベント、経済指標など）を追加
            </p>
            <p>
              <strong>3. 予測期間調整:</strong> 
              長期予測よりも短期予測の方が一般的に精度が高い
            </p>
            <p>
              <strong>4. 定期的な再学習:</strong> 
              新しいデータでモデルを定期的に更新することで予測精度を維持
            </p>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}