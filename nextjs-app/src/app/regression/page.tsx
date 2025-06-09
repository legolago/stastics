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

// 回帰分析固有の型定義
interface RegressionParams {
  method: 'linear' | 'multiple' | 'polynomial';
  target_variable: string;
  explanatory_variables: string[];
  polynomial_degree: number;
  test_size: number;
  random_state: number;
  include_intercept: boolean;
  standardize: boolean;
}

interface RegressionPrediction {
  sample_name: string;
  actual_value: number;
  predicted_value: number;
  residual: number;
  data_type: string;
}

interface RegressionCoefficient {
  coefficient: number;
  std_error?: number;
  t_value?: number;
  p_value?: number;
}

interface RegressionEvaluationMetrics {
  r2_score: number;
  adjusted_r2: number;
  mse: number;
  mae: number;
  rmse: number;
  train_r2: number;
  test_r2: number;
  train_rmse: number;
  test_rmse: number;
  f_statistic?: number;
  p_value?: number;
}

interface RegressionAnalysisResult {
  success: boolean;
  session_id: number;
  session_name: string;
  analysis_type: 'regression';
  plot_base64: string;
  data: {
    method: string;
    target_variable: string;
    explanatory_variables: string[];
    polynomial_degree?: number;
    predictions: RegressionPrediction[];
    coefficients: { [key: string]: RegressionCoefficient };
    evaluation_metrics: RegressionEvaluationMetrics;
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    column_names: string[];
  };
  session_info: {
    session_id: number;
    session_name: string;
    description: string;
    tags: string[];
    analysis_timestamp: string;
    filename: string;
    analysis_type: 'regression';
    row_count: number;
    column_count: number;
  };
}

// レスポンス型の統合
type RegressionApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function RegressionPage() {
  // 状態管理
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<RegressionParams>({
    method: 'linear',
    target_variable: '',
    explanatory_variables: [],
    polynomial_degree: 2,
    test_size: 0.2,
    random_state: 42,
    include_intercept: true,
    standardize: false
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegressionAnalysisResult | null>(null);
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
        offset: '0',
        analysis_type: 'regression' // 明示的に回帰分析を指定
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      console.log('🔍 Regression sessions request:', `/api/sessions?${params.toString()}`);
      
      const response = await fetch(`/api/sessions?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const data = await response.json();
      console.log('📊 API Response:', {
        totalSessions: data.data?.length || 0,
        types: data.data?.map((s: any) => s.analysis_type)
      });

      if (data.success) {
        const allSessions = Array.isArray(data.data) ? data.data : [];
        
        // analysis_typeの大文字小文字を考慮したフィルタリング
        const regressionSessionsOnly = allSessions.filter(session => {
          const sessionType = session.analysis_type?.toLowerCase();
          const isRegression = sessionType === 'regression';
          
          if (!isRegression) {
            console.warn(`⚠️ 回帰分析以外のセッションを除外: ID=${session.session_id}, タイプ=${sessionType}`);
          }
          
          return isRegression;
        });
        
        console.log(`✅ Filtered sessions: ${allSessions.length} → ${regressionSessionsOnly.length} Regression only)`);
        
        // デバッグ: 分析タイプ別カウント
        const typeCounts = allSessions.reduce((acc: Record<string, number>, session) => {
          const type = session.analysis_type || 'undefined';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});

        console.log('📈 Session types found:', typeCounts);
        console.log(`✅ フィルタリング結果: ${allSessions.length}件 → ${regressionSessionsOnly.length}件（回帰分析のみ）`);
        
        setSessions(regressionSessionsOnly);

        // セッションが0件の場合の処理
        if (regressionSessionsOnly.length === 0) {
          console.log('⚠️ 回帰分析のセッションが見つかりませんでした');
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

  // セッション詳細を取得（因子分析を参考に修正）
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      console.log('🔍 回帰分析セッション詳細取得開始:', sessionId);
      setError(null);
      
      const response = await fetch(`http://localhost:8000/api/regression/sessions/${sessionId}`, {
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
      console.log('📥 Regression session detail response:', pythonResponse);

      // レスポンス構造の詳細ログ
      console.log('🔍 Python response structure:', {
        keys: Object.keys(pythonResponse),
        sessionInfo: pythonResponse.session_info ? Object.keys(pythonResponse.session_info) : null,
        analysisResults: pythonResponse.analysis_results ? Object.keys(pythonResponse.analysis_results) : null,
        visualization: pythonResponse.visualization ? Object.keys(pythonResponse.visualization) : null,
      });

      // 予測データの取得
      let predictions: RegressionPrediction[] = [];
      if (pythonResponse.visualization?.predictions) {
        predictions = pythonResponse.visualization.predictions;
      } else if (pythonResponse.analysis_results?.predictions) {
        predictions = pythonResponse.analysis_results.predictions;
      } else if (pythonResponse.predictions) {
        predictions = pythonResponse.predictions;
      }

      // 係数データの取得
      let coefficients: { [key: string]: RegressionCoefficient } = {};
      if (pythonResponse.visualization?.coefficients) {
        coefficients = pythonResponse.visualization.coefficients;
      } else if (pythonResponse.analysis_results?.coefficients) {
        coefficients = pythonResponse.analysis_results.coefficients;
      } else if (pythonResponse.coefficients) {
        coefficients = pythonResponse.coefficients;
      }

      // 評価指標の取得
      let evaluationMetrics: RegressionEvaluationMetrics = {
        r2_score: 0,
        adjusted_r2: 0,
        mse: 0,
        mae: 0,
        rmse: 0,
        train_r2: 0,
        test_r2: 0,
        train_rmse: 0,
        test_rmse: 0,
      };
      if (pythonResponse.visualization?.evaluation_metrics) {
        evaluationMetrics = pythonResponse.visualization.evaluation_metrics;
      } else if (pythonResponse.analysis_results?.evaluation_metrics) {
        evaluationMetrics = pythonResponse.analysis_results.evaluation_metrics;
      } else if (pythonResponse.evaluation_metrics) {
        evaluationMetrics = pythonResponse.evaluation_metrics;
      }

      // プロット画像の取得
      let plotImage = '';
      if (pythonResponse.visualization?.plot_image) {
        plotImage = pythonResponse.visualization.plot_image;
      } else if (pythonResponse.plot_image) {
        plotImage = pythonResponse.plot_image;
      }

      // 回帰分析結果への型安全な変換処理
      const analysisResult: RegressionAnalysisResult = {
        success: true,
        session_id: pythonResponse.session_info?.session_id || sessionId,
        session_name: pythonResponse.session_info?.session_name || '',
        analysis_type: 'regression',
        plot_base64: plotImage,
        data: {
          method: pythonResponse.session_info?.method || 
                  pythonResponse.analysis_results?.method || 'linear',
          target_variable: pythonResponse.session_info?.target_variable || 
                          pythonResponse.analysis_results?.target_variable || '',
          explanatory_variables: pythonResponse.session_info?.explanatory_variables || 
                                pythonResponse.analysis_results?.explanatory_variables || [],
          polynomial_degree: pythonResponse.analysis_results?.polynomial_degree,
          predictions: predictions,
          coefficients: coefficients,
          evaluation_metrics: evaluationMetrics,
        },
        metadata: {
          session_name: pythonResponse.session_info?.session_name || '',
          filename: pythonResponse.session_info?.filename || pythonResponse.metadata?.filename || '',
          rows: pythonResponse.metadata?.rows || pythonResponse.session_info?.row_count || 0,
          columns: pythonResponse.metadata?.columns || pythonResponse.session_info?.column_count || 0,
          column_names: pythonResponse.metadata?.column_names || [],
        },
        session_info: {
          session_id: pythonResponse.session_info?.session_id || sessionId,
          session_name: pythonResponse.session_info?.session_name || '',
          description: pythonResponse.session_info?.description || '',
          tags: pythonResponse.session_info?.tags || [],
          analysis_timestamp: pythonResponse.session_info?.analysis_timestamp || '',
          filename: pythonResponse.session_info?.filename || pythonResponse.metadata?.filename || '',
          analysis_type: 'regression',
          row_count: pythonResponse.metadata?.rows || pythonResponse.session_info?.row_count || 0,
          column_count: pythonResponse.metadata?.columns || pythonResponse.session_info?.column_count || 0,
        }
      };

      console.log('📊 Building Regression analysis result:', analysisResult);
      setResult(analysisResult);
      console.log('✅ Regression session details loaded successfully');

    } catch (error) {
      console.error('❌ 回帰分析セッション詳細取得エラー:', error);
      setError(error instanceof Error ? error.message : 'セッション詳細の取得中にエラーが発生しました');
    }
  };

  // セッションを削除
  const deleteSession = async (sessionId: number) => {
    if (!confirm('このセッションを削除しますか？')) return;

    try {
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `regression_analysis_${sessionId}_plot.png`;
      
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
      
      const response = await fetch(`/api/regression/download/${sessionId}/predictions`);
      if (!response.ok) {
        throw new Error('予測結果CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `regression_predictions_${sessionId}.csv`;
      
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

  // 詳細結果CSVをダウンロード
  const downloadDetailsCSV = async (sessionId: number) => {
    try {
      console.log('Downloading details CSV for session:', sessionId);
      
      const response = await fetch(`/api/regression/download/${sessionId}/details`);
      if (!response.ok) {
        throw new Error('詳細結果CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `regression_details_${sessionId}.csv`;
      
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
      setSessionName(`${nameWithoutExt}_回帰分析`);
    }

    // CSVファイルの列名を取得
    try {
      const fileContent = await selectedFile.text();
      const lines = fileContent.split('\n').map(line => line.trim()).filter(Boolean);
      
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim());
        if (headers.length > 1) {
          // 最初の列（行ラベル）を除く
          const dataColumns = headers.slice(1);
          setAvailableColumns(dataColumns);
          
          // デフォルト設定
          if (dataColumns.length >= 2) {
            setParameters(prev => ({
              ...prev,
              target_variable: dataColumns[0], // 最初の列を目的変数に
              explanatory_variables: [dataColumns[1]] // 2番目の列を説明変数に
            }));
          }
        }
      }
    } catch (err) {
      console.error('CSVファイルの解析エラー:', err);
    }
  };

  // 説明変数の追加・削除
  const addExplanatoryVariable = (variable: string) => {
    if (!parameters.explanatory_variables.includes(variable)) {
      setParameters(prev => ({
        ...prev,
        explanatory_variables: [...prev.explanatory_variables, variable]
      }));
    }
  };

  const removeExplanatoryVariable = (variable: string) => {
    setParameters(prev => ({
      ...prev,
      explanatory_variables: prev.explanatory_variables.filter(v => v !== variable)
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

    if (!parameters.target_variable) {
      setError('目的変数を選択してください');
      return;
    }

    if (parameters.explanatory_variables.length === 0) {
      setError('説明変数を選択してください');
      return;
    }

    // 手法に応じたバリデーション
    if (parameters.method === 'linear' && parameters.explanatory_variables.length > 1) {
      setError('単回帰分析では説明変数は1つのみ選択してください');
      return;
    }

    if (parameters.method === 'multiple' && parameters.explanatory_variables.length < 2) {
      setError('重回帰分析では説明変数を2つ以上選択してください');
      return;
    }

    if (parameters.method === 'polynomial' && parameters.explanatory_variables.length > 1) {
      setError('多項式回帰では説明変数は1つのみ選択してください');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // CSVファイルの基本検証（因子分析と同様）
      const fileContent = await file.text();
      const lines = fileContent.split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      
      if (lines.length < 3) {
        throw new Error('データが不足しています。ヘッダー行と最低2行のデータが必要です。');
      }

      // ヘッダーとデータの検証
      const headers = lines[0].split(',').map(h => h.trim());
      if (headers.length < 3) {
        throw new Error('列が不足しています。ラベル列と最低2列のデータが必要です。');
      }

      console.log('ファイル検証完了:', {
        fileName: file.name,
        rows: lines.length - 1,
        columns: headers.length - 1,
        headers: headers.slice(0, 3)
      });

      // FormDataの準備
      const formData = new FormData();
      formData.append('file', file);

      // クエリパラメータの設定
      const params = new URLSearchParams({
        session_name: sessionName.trim(),
        description: description.trim(),
        tags: tags.trim(),
        user_id: 'default',
        method: parameters.method,
        target_variable: parameters.target_variable,
        explanatory_variables: parameters.explanatory_variables.join(','),
        polynomial_degree: parameters.polynomial_degree.toString(),
        test_size: parameters.test_size.toString(),
        random_state: parameters.random_state.toString(),
        include_intercept: parameters.include_intercept.toString(),
        standardize: parameters.standardize.toString()
      });

      console.log('=== Starting Regression Analysis ===');
      console.log('Params:', params.toString());
      
      const response = await fetch(`/api/regression/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      console.log('=== Raw API Response ===');
      console.log('Status:', response.status);
      console.log('Response Text:', responseText.substring(0, 1000), '...');

      let data: RegressionApiResponse;
      try {
        data = JSON.parse(responseText) as RegressionApiResponse;
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
        console.error('Regression API Error:', data);
        
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || '回帰分析中にエラーが発生しました';
          
          if (errorData.hints && Array.isArray(errorData.hints)) {
            errorMessage += '\n\n推奨事項:\n' + errorData.hints.map((hint: string) => `• ${hint}`).join('\n');
          }
          
          throw new Error(errorMessage);
        }
      }

      if (!data.success) {
        throw new Error('error' in data ? data.error : '回帰分析に失敗しました');
      }

      console.log('=== Processing Successful Response ===');
      const successData = data as ApiSuccessResponse;

      // バックエンドから直接画像データを取得（因子分析と同様の処理）
      const plotImage = successData.data?.plot_image || 
                       successData.plot_base64 || 
                       successData.visualization?.plot_image || "";
      
      console.log('画像データの取得状況:');
      console.log('- plot_image length:', plotImage ? `${plotImage.length} chars` : 'undefined');
      
      if (plotImage) {
        console.log('バックエンドから直接画像データを取得しました');
        
        const analysisResult: RegressionAnalysisResult = {
          success: true,
          session_id: successData.session_id,
          session_name: sessionName,
          analysis_type: 'regression',
          plot_base64: plotImage,
          data: {
            method: successData.analysis_results?.method || parameters.method,
            target_variable: successData.analysis_results?.target_variable || parameters.target_variable,
            explanatory_variables: successData.analysis_results?.explanatory_variables || parameters.explanatory_variables,
            polynomial_degree: successData.analysis_results?.polynomial_degree || parameters.polynomial_degree,
            predictions: successData.visualization?.predictions || successData.analysis_results?.predictions || [],
            coefficients: successData.visualization?.coefficients || successData.analysis_results?.coefficients || {},
            evaluation_metrics: successData.visualization?.evaluation_metrics || successData.analysis_results?.evaluation_metrics || {
              r2_score: 0, adjusted_r2: 0, mse: 0, mae: 0, rmse: 0, train_r2: 0, test_r2: 0, train_rmse: 0, test_rmse: 0
            },
          },
          metadata: {
            session_name: sessionName,
            filename: file.name,
            rows: successData.metadata?.rows || 0,
            columns: successData.metadata?.columns || 0,
            column_names: successData.metadata?.column_names || availableColumns,
          },
          session_info: {
            session_id: successData.session_id,
            session_name: sessionName,
            description: description,
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
            analysis_timestamp: new Date().toISOString(),
            filename: file.name,
            analysis_type: 'regression',
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
            const analysisResult: RegressionAnalysisResult = {
              success: true,
              session_id: successData.session_id,
              session_name: sessionName,
              analysis_type: 'regression',
              plot_base64: "", // 画像なし
              data: {
                method: successData.analysis_results?.method || parameters.method,
                target_variable: successData.analysis_results?.target_variable || parameters.target_variable,
                explanatory_variables: successData.analysis_results?.explanatory_variables || parameters.explanatory_variables,
                polynomial_degree: successData.analysis_results?.polynomial_degree || parameters.polynomial_degree,
                predictions: successData.visualization?.predictions || successData.analysis_results?.predictions || [],
                coefficients: successData.visualization?.coefficients || successData.analysis_results?.coefficients || {},
                evaluation_metrics: successData.visualization?.evaluation_metrics || successData.analysis_results?.evaluation_metrics || {
                  r2_score: 0, adjusted_r2: 0, mse: 0, mae: 0, rmse: 0, train_r2: 0, test_r2: 0, train_rmse: 0, test_rmse: 0
                },
              },
              metadata: {
                session_name: sessionName,
                filename: file.name,
                rows: successData.metadata?.rows || 0,
                columns: successData.metadata?.columns || 0,
                column_names: successData.metadata?.column_names || availableColumns,
              },
              session_info: {
                session_id: successData.session_id,
                session_name: sessionName,
                description: description,
                tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
                analysis_timestamp: new Date().toISOString(),
                filename: file.name,
                analysis_type: 'regression',
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
      title="回帰分析"
      description="変数間の関係性をモデル化し、予測や説明を行う分析手法です"
      analysisType="regression"
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
              <h2 className="text-xl font-semibold mb-4">新しい回帰分析を実行</h2>
              
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
                        placeholder="例: 売上予測回帰分析2024"
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
                        placeholder="例: 売上予測, 回帰分析, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        回帰手法
                      </label>
                      <select
                        value={parameters.method}
                        onChange={(e) => setParameters({...parameters, method: e.target.value as 'linear' | 'multiple' | 'polynomial'})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="linear">単回帰分析</option>
                        <option value="multiple">重回帰分析</option>
                        <option value="polynomial">多項式回帰分析</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        {parameters.method === 'linear' && '1つの説明変数による線形回帰'}
                        {parameters.method === 'multiple' && '複数の説明変数による線形回帰'}
                        {parameters.method === 'polynomial' && '1つの説明変数による多項式回帰'}
                      </p>
                    </div>

                    {parameters.method === 'polynomial' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          多項式の次数
                        </label>
                        <select
                          value={parameters.polynomial_degree}
                          onChange={(e) => setParameters({...parameters, polynomial_degree: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          {[1, 2, 3, 4, 5, 6].map(n => (
                            <option key={n} value={n}>{n}次</option>
                          ))}
                        </select>
                      </div>
                    )}

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
                        <option value={0.2}>20%</option>
                        <option value={0.3}>30%</option>
                        <option value={0.4}>40%</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={parameters.include_intercept}
                          onChange={(e) => setParameters({...parameters, include_intercept: e.target.checked})}
                          className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-sm text-gray-700">切片を含む</span>
                      </label>
                      
                      {parameters.method === 'multiple' && (
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={parameters.standardize}
                            onChange={(e) => setParameters({...parameters, standardize: e.target.checked})}
                            className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-sm text-gray-700">説明変数を標準化する</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* 変数選択 */}
                  {availableColumns.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                      <h3 className="font-medium text-gray-900">変数選択</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          目的変数（従属変数） *
                        </label>
                        <select
                          value={parameters.target_variable}
                          onChange={(e) => setParameters({...parameters, target_variable: e.target.value})}
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
                          説明変数（独立変数） *
                        </label>
                        <div className="space-y-2">
                          {availableColumns
                            .filter(col => col !== parameters.target_variable)
                            .map(col => (
                            <label key={col} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={parameters.explanatory_variables.includes(col)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    addExplanatoryVariable(col);
                                  } else {
                                    removeExplanatoryVariable(col);
                                  }
                                }}
                                disabled={
                                  (parameters.method === 'linear' || parameters.method === 'polynomial') && 
                                  parameters.explanatory_variables.length >= 1 && 
                                  !parameters.explanatory_variables.includes(col)
                                }
                                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-sm text-gray-700">{col}</span>
                            </label>
                          ))}
                        </div>
                        
                        {parameters.explanatory_variables.length > 0 && (
                          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-sm text-blue-700">
                              選択済み: {parameters.explanatory_variables.join(', ')}
                            </p>
                          </div>
                        )}
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
                    disabled={!file || !sessionName.trim() || !parameters.target_variable || parameters.explanatory_variables.length === 0 || loading}
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
                      '回帰分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">回帰分析履歴</h2>
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-lg font-medium">回帰分析のセッションがありません</p>
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
                            className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>分析日時: {formatDate(session.analysis_timestamp)}</p>
                        <p>データサイズ: {session.row_count} × {session.column_count}</p>
                        {session.chi2_value && (
                          <p>R²値: {session.chi2_value.toFixed(3)}</p>
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
            <h2 className="text-2xl font-semibold">回帰分析結果</h2>
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
                    onClick={() => downloadDetailsCSV(result.session_id)}
                    className="bg-orange-600 text-white px-3 py-1 rounded-md hover:bg-orange-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    詳細結果CSV
                  </button>
                  <button
                    onClick={() => downloadPlotImage(result.session_id)}
                    className="bg-purple-600 text-white px-3 py-1 rounded-md hover:bg-purple-700 text-sm flex items-center"
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
                  <dt className="text-gray-600">回帰手法:</dt>
                  <dd className="font-medium">
                    {result.data?.method === 'linear' && '単回帰分析'}
                    {result.data?.method === 'multiple' && '重回帰分析'}
                    {result.data?.method === 'polynomial' && 
                      `多項式回帰分析(${result.data?.polynomial_degree || ''}次)`}
                    {!result.data?.method && '未設定'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">目的変数:</dt>
                  <dd className="font-medium">{result.data?.target_variable || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">説明変数:</dt>
                  <dd className="font-medium">
                    {result.data?.explanatory_variables?.join(', ') || '-'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 評価指標 */}
          {result.data?.evaluation_metrics && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">評価指標</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatNumber(result.data.evaluation_metrics.r2_score, 3)}
                  </div>
                  <div className="text-sm text-blue-700">決定係数 (R²)</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatNumber(result.data.evaluation_metrics.adjusted_r2, 3)}
                  </div>
                  <div className="text-sm text-green-700">調整済みR²</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatNumber(result.data.evaluation_metrics.rmse, 3)}
                  </div>
                  <div className="text-sm text-orange-700">RMSE</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatNumber(result.data.evaluation_metrics.mae, 3)}
                  </div>
                  <div className="text-sm text-purple-700">MAE</div>
                </div>
              </div>
              
              {/* 統計的有意性 */}
              {result.data.evaluation_metrics.f_statistic && (
                <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                  <h4 className="font-medium text-yellow-800 mb-2">統計的有意性</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-yellow-700">F統計量: </span>
                      <span className="font-medium">{formatNumber(result.data.evaluation_metrics.f_statistic, 4)}</span>
                    </div>
                    <div>
                      <span className="text-yellow-700">p値: </span>
                      <span className="font-medium">
                        {result.data.evaluation_metrics.p_value && result.data.evaluation_metrics.p_value < 0.001 
                          ? '< 0.001' 
                          : formatNumber(result.data.evaluation_metrics.p_value, 6)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 回帰係数 */}
          {result.data?.coefficients && Object.keys(result.data.coefficients).length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">回帰係数</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">変数</th>
                      <th className="px-4 py-2 text-right">係数</th>
                      <th className="px-4 py-2 text-right">標準誤差</th>
                      <th className="px-4 py-2 text-right">t値</th>
                      <th className="px-4 py-2 text-right">p値</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(result.data.coefficients).map(([variable, coeff]: [string, any]) => (
                      <tr key={variable} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{variable}</td>
                        <td className="px-4 py-2 text-right">{formatNumber(coeff?.coefficient, 6)}</td>
                        <td className="px-4 py-2 text-right">
                          {coeff?.std_error ? formatNumber(coeff.std_error, 6) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {coeff?.t_value ? formatNumber(coeff.t_value, 4) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {coeff?.p_value !== undefined ? (
                            coeff.p_value < 0.001 ? '< 0.001' : formatNumber(coeff.p_value, 6)
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* プロット画像 */}
          {result.plot_base64 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">回帰分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.plot_base64}`}
                  alt="回帰分析プロット"
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
                {/* 訓練データ */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 flex items-center">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                    訓練データ
                    <span className="ml-2 text-sm text-gray-500">
                      ({result.data.predictions.filter((p: any) => p.data_type === 'train').length}件)
                    </span>
                  </h4>
                  
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">サンプル名</th>
                          <th className="text-right p-2">実測値</th>
                          <th className="text-right p-2">予測値</th>
                          <th className="text-right p-2">残差</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {result.data.predictions
                          .filter((p: any) => p.data_type === 'train')
                          .map((prediction: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-100">
                            <td className="p-2 font-medium">{prediction.sample_name}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.actual_value, 3)}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.predicted_value, 3)}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.residual, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* テストデータ */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 flex items-center">
                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                    テストデータ
                    <span className="ml-2 text-sm text-gray-500">
                      ({result.data.predictions.filter((p: any) => p.data_type === 'test').length}件)
                    </span>
                  </h4>
                  
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">サンプル名</th>
                          <th className="text-right p-2">実測値</th>
                          <th className="text-right p-2">予測値</th>
                          <th className="text-right p-2">残差</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {result.data.predictions
                          .filter((p: any) => p.data_type === 'test')
                          .map((prediction: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-100">
                            <td className="p-2 font-medium">{prediction.sample_name}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.actual_value, 3)}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.predicted_value, 3)}</td>
                            <td className="p-2 text-right">{formatNumber(prediction.residual, 3)}</td>
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
          {result.data?.evaluation_metrics && (
            <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">分析結果の解釈について</h3>
                  <div className="mt-2 text-sm text-yellow-700 space-y-2">
                    <p>
                      <strong>決定係数 R² ({formatNumber(result.data.evaluation_metrics.r2_score, 3)})</strong>: 
                      モデルが目的変数の分散をどの程度説明できているかを示します。1に近いほど良好です。
                    </p>
                    <p>
                      <strong>RMSE ({formatNumber(result.data.evaluation_metrics.rmse, 3)})</strong>: 
                      予測誤差の標準偏差です。目的変数の単位で解釈でき、小さいほど良好です。
                    </p>
                    {result.data.evaluation_metrics.f_statistic && (
                      <p>
                        <strong>F統計量 ({formatNumber(result.data.evaluation_metrics.f_statistic, 4)})</strong>: 
                        回帰モデルの統計的有意性を示します。p値が0.05未満であれば統計的に有意です。
                      </p>
                    )}
                    {result.data.evaluation_metrics.r2_score && result.data.evaluation_metrics.r2_score < 0.7 && (
                      <p className="text-orange-700 font-medium">
                        ⚠️ R²値が0.7未満のため、他の説明変数の追加や非線形モデルの検討をお勧めします。
                      </p>
                    )}
                    {result.data.evaluation_metrics.train_r2 && result.data.evaluation_metrics.test_r2 && 
                     Math.abs(result.data.evaluation_metrics.train_r2 - result.data.evaluation_metrics.test_r2) > 0.1 && (
                      <p className="text-orange-700 font-medium">
                        ⚠️ 訓練・テストデータ間でR²値の差が大きいため、過学習の可能性があります。
                      </p>
                    )}
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
          <span className="text-2xl mr-3">📚</span>
          回帰分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              回帰分析は、変数間の関係性をモデル化する統計手法です。
              目的変数（従属変数）を説明変数（独立変数）で予測・説明し、
              定量的な関係性を明らかにします。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🔍 手法の種類</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• <strong>単回帰:</strong> 1つの説明変数</li>
              <li>• <strong>重回帰:</strong> 複数の説明変数</li>
              <li>• <strong>多項式回帰:</strong> 非線形関係</li>
              <li>• 線形関係の仮定</li>
              <li>• 残差の正規性・等分散性</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 適用場面</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• 売上・需要予測</li>
              <li>• 価格設定・要因分析</li>
              <li>• 品質管理・最適化</li>
              <li>• リスク評価・意思決定</li>
              <li>• 効果測定・因果推論</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">📊 評価指標の解釈</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>R²（決定係数）:</strong> 
                0～1の値で、1に近いほど説明力が高い
              </p>
              <p>
                <strong>RMSE:</strong> 
                予測誤差の大きさ。目的変数と同じ単位で解釈
              </p>
              <p>
                <strong>p値:</strong> 
                0.05未満で統計的に有意（偶然ではない関係）
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">⚠️ 注意点</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>多重共線性:</strong> 
                説明変数間の強い相関は係数の解釈を困難にします
              </p>
              <p>
                <strong>外れ値:</strong> 
                極端な値は回帰直線に大きな影響を与えます
              </p>
              <p>
                <strong>過学習:</strong> 
                複雑すぎるモデルは汎化性能が低下します
              </p>
            </div>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}