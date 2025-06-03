//src/app/regression/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';
import { 
  RegressionAnalysisResult, 
  AnalysisSession, 
  RegressionParams, 
  SessionDetailResponse, 
  ApiErrorResponse,
  ApiSuccessResponse
} from '../../types/analysis';

// レスポンス型の統合
type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function RegressionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<RegressionParams>({
    target_column: '',
    regression_type: 'linear',
    polynomial_degree: 2,
    test_size: 0.3,
    include_intercept: true
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegressionAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // ファイル解析状態
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [fileAnalyzed, setFileAnalyzed] = useState(false);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // セッション履歴を取得
  const fetchSessions = async (): Promise<void> => {
    try {
      setSessionsLoading(true);
      const params = new URLSearchParams({
        userId: 'default',
        limit: '50',
        offset: '0',
        analysis_type: 'regression'
      });

      console.log('🔍 Regression sessions request:', `/api/sessions?${params.toString()}`);
      
      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();
      
      console.log('📊 API Response:', data);

      if (data.success) {
        // フィルタリング処理
        const allSessions = data.data || [];
        const regressionOnly = allSessions.filter((session: any) => 
          session.analysis_type === 'regression'
        );
        
        console.log(`✅ Filtered: ${allSessions.length} → ${regressionOnly.length}`);
        setSessions(regressionOnly);
      } else {
        setError(data.error || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('❌ Fetch Error:', error);
      setError(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setSessionsLoading(false);
    }
  };

  // ファイルの列名を解析
  const analyzeFileColumns = async (file: File) => {
    try {
      const content = await file.text();
      const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
      
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        // 最初の列は通常ラベル列なので除外
        const dataColumns = headers.slice(1);
        setAvailableColumns(dataColumns);
        setFileAnalyzed(true);
        
        // 最初の数値列を自動選択
        if (dataColumns.length > 0 && !parameters.target_column) {
          setParameters(prev => ({ ...prev, target_column: dataColumns[0] }));
        }
      }
    } catch (error) {
      console.error('File analysis error:', error);
      setAvailableColumns([]);
      setFileAnalyzed(false);
    }
  };

  // 特定のセッションの詳細を取得
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      console.log('Fetching regression session details for:', sessionId);
      
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        console.error(`HTTP ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        alert('セッション詳細の取得に失敗しました');
        return;
      }

      const data: SessionDetailResponse = await response.json();
      console.log('Received regression session data:', data);

      if (data.success && data.data) {
        const pythonResponse = data.data;
        
        // 回帰分析結果の型安全な変換処理（コレスポンデンス分析と同じパターン）
        const analysisResult: RegressionAnalysisResult = {
          success: true,
          session_id: pythonResponse.session_info?.session_id || sessionId,
          session_name: pythonResponse.session_info?.session_name || '',
          analysis_type: 'regression',
          plot_base64: pythonResponse.visualization?.plot_image || "",
          data: {
            n_components: 2, // 回帰分析では基本的に2次元（予測値 vs 実測値）
            regression_type: pythonResponse.analysis_data?.regression_type || 'linear',
            target_column: pythonResponse.analysis_data?.target_column || '',
            feature_names: pythonResponse.analysis_data?.feature_names || [],
            coefficients: pythonResponse.analysis_data?.coefficients || [],
            intercept: pythonResponse.analysis_data?.intercept || 0,
            best_feature: pythonResponse.analysis_data?.best_feature,
            polynomial_degree: pythonResponse.analysis_data?.polynomial_degree,
            train_r2: pythonResponse.analysis_data?.train_r2 || 0,
            test_r2: pythonResponse.analysis_data?.test_r2 || 0,
            train_rmse: pythonResponse.analysis_data?.train_rmse || 0,
            test_rmse: pythonResponse.analysis_data?.test_rmse || 0,
            train_mae: pythonResponse.analysis_data?.train_mae || 0,
            test_mae: pythonResponse.analysis_data?.test_mae || 0,
            plot_image: pythonResponse.visualization?.plot_image || "",
            eigenvalues: [], // 回帰分析では使用しないが型互換性のため
            // 以下のフィールドは回帰分析では使用しないが、型互換性のために設定
            coordinates: [],
            total_inertia: pythonResponse.analysis_data?.test_r2 || 0, // R²値として使用
            explained_inertia: [],
            cumulative_inertia: []
          },
          metadata: {
            session_name: pythonResponse.session_info?.session_name || '',
            filename: pythonResponse.session_info?.filename || '',
            rows: pythonResponse.metadata?.row_count || 0,
            columns: pythonResponse.metadata?.column_count || 0,
            n_samples: pythonResponse.metadata?.n_samples || 0,
            n_features: pythonResponse.metadata?.n_features || 0,
            test_size: pythonResponse.metadata?.test_size || 0.3,
            include_intercept: pythonResponse.metadata?.include_intercept || true
          },
          session_info: {
            session_id: pythonResponse.session_info?.session_id || sessionId,
            session_name: pythonResponse.session_info?.session_name || '',
            description: pythonResponse.session_info?.description || '',
            tags: pythonResponse.session_info?.tags || [],
            analysis_timestamp: pythonResponse.session_info?.analysis_timestamp || '',
            filename: pythonResponse.session_info?.filename || '',
            analysis_type: 'regression',
            row_count: pythonResponse.metadata?.row_count || 0,
            column_count: pythonResponse.metadata?.column_count || 0
          }
        };

        setResult(analysisResult);
        console.log('Regression session details loaded successfully');
        
      } else {
        console.error('Invalid response format:', data);
        alert('セッションデータの形式が不正です');
      }
    } catch (err) {
      console.error('回帰分析セッション詳細取得エラー:', err);
      alert('セッション詳細の取得中にエラーが発生しました');
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
  const downloadCSV = async (sessionId: number | undefined) => {
    if (!sessionId) {
      alert('セッションIDが見つからないため、ダウンロードできません');
      return;
    }

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
  const downloadPlotImage = async (sessionId: number | undefined) => {
    if (!sessionId) {
      alert('セッションIDが見つからないため、ダウンロードできません');
      return;
    }

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

  // 分析結果CSVを生成してダウンロード
  const downloadAnalysisResultCSV = async (result: RegressionAnalysisResult) => {
    try {
      console.log('Downloading analysis CSV for session:', result.session_id);
      
      const response = await fetch(`/api/sessions/${result.session_id}/analysis-csv`);
      
      if (!response.ok) {
        throw new Error('分析結果CSVの取得に失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `regression_analysis_results_${result.session_id}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Analysis CSV download completed');
      
    } catch (err) {
      console.error('分析結果CSVダウンロードエラー:', err);
      
      // フォールバック：クライアント側で生成
      try {
        console.log('Attempting fallback CSV generation...');
        
        let csvContent = "回帰分析結果\n";
        csvContent += `セッション名,${result.metadata?.session_name || result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.metadata?.filename || '不明'}\n`;
        csvContent += `回帰の種類,${result.data?.regression_type || '不明'}\n`;
        csvContent += `目的変数,${result.data?.target_column || '不明'}\n`;
        csvContent += `データサイズ,${result.metadata?.rows || 0}行 × ${result.metadata?.columns || 0}列\n`;
        csvContent += `サンプル数,${result.metadata?.n_samples || 0}\n`;
        csvContent += `特徴量数,${result.metadata?.n_features || 0}\n`;
        csvContent += `テストデータ割合,${(result.metadata?.test_size || 0) * 100}%\n`;
        csvContent += `切片項の使用,${result.metadata?.include_intercept ? 'あり' : 'なし'}\n`;
        csvContent += `訓練データR²,${result.data?.train_r2 || 0}\n`;
        csvContent += `テストデータR²,${result.data?.test_r2 || 0}\n`;
        csvContent += `訓練データRMSE,${result.data?.train_rmse || 0}\n`;
        csvContent += `テストデータRMSE,${result.data?.test_rmse || 0}\n`;
        csvContent += `訓練データMAE,${result.data?.train_mae || 0}\n`;
        csvContent += `テストデータMAE,${result.data?.test_mae || 0}\n`;
        csvContent += `切片,${result.data?.intercept || 0}\n`;
        
        if (result.data?.best_feature) {
          csvContent += `最重要特徴量,${result.data.best_feature}\n`;
        }
        
        if (result.data?.polynomial_degree) {
          csvContent += `多項式次数,${result.data.polynomial_degree}\n`;
        }
        
        csvContent += "\n回帰係数\n";
        csvContent += "変数名,係数,絶対値,標準化係数\n";
        
        if (result.data?.feature_names && result.data?.coefficients) {
          const maxAbsCoeff = Math.max(...result.data.coefficients.map(c => Math.abs(c)));
          result.data.feature_names.forEach((name, index) => {
            const coefficient = result.data.coefficients[index] || 0;
            const absCoeff = Math.abs(coefficient);
            const standardized = maxAbsCoeff > 0 ? coefficient / maxAbsCoeff : 0;
            csvContent += `${name},${coefficient},${absCoeff},${standardized}\n`;
          });
        }

        csvContent += "\n評価指標説明\n";
        csvContent += "指標,説明\n";
        csvContent += "R²,決定係数（1に近いほど良い）\n";
        csvContent += "RMSE,二乗平均平方根誤差（小さいほど良い）\n";
        csvContent += "MAE,平均絶対誤差（小さいほど良い）\n";

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `regression_analysis_result_${result.session_id}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log('Fallback CSV generation completed');
        
      } catch (fallbackError) {
        console.error('フォールバック処理でもエラー:', fallbackError);
        alert('分析結果CSVのダウンロードに失敗しました');
      }
    }
  };

  // 初回ロード時にセッション履歴を取得
  useEffect(() => {
    fetchSessions();
  }, []);

  // 検索クエリが変わったときにセッション履歴を再取得
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSessions();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setFileAnalyzed(false);
    setAvailableColumns([]);
    
    // ファイル名から自動的にセッション名を生成
    if (!sessionName && selectedFile.name) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setSessionName(`${nameWithoutExt}_回帰分析`);
    }

    // ファイルの列名を解析
    await analyzeFileColumns(selectedFile);
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

    if (!parameters.target_column.trim()) {
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
      if (headers.length < 3) {
        throw new Error('列が不足しています。ラベル列と最低2列のデータが必要です。');
      }

      // 目的変数の存在確認
      if (!headers.includes(parameters.target_column)) {
        throw new Error(`目的変数 '${parameters.target_column}' がファイルに存在しません。利用可能な列: ${headers.slice(1).join(', ')}`);
      }

      // データ行の検証
      for (let i = 1; i < Math.min(lines.length, 4); i++) {
        const cells = lines[i].split(',');
        if (cells.length !== headers.length) {
          throw new Error(`${i + 1}行目の列数が一致しません。期待値: ${headers.length}, 実際: ${cells.length}`);
        }
      }

      console.log('回帰分析用ファイル検証完了:', {
        fileName: file.name,
        rows: lines.length - 1,
        columns: headers.length - 1,
        targetColumn: parameters.target_column,
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
        target_column: parameters.target_column,
        regression_type: parameters.regression_type,
        polynomial_degree: parameters.polynomial_degree.toString(),
        test_size: parameters.test_size.toString(),
        include_intercept: parameters.include_intercept.toString()
      });

      console.log('回帰分析を開始します...', params.toString());
      const response = await fetch(`/api/regression/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      console.log('Regression API Response:', response.status, responseText);

      let data: ApiResponse;
      try {
        data = JSON.parse(responseText) as ApiResponse;
      } catch (parseError) {
        console.error('Response parsing error:', parseError);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      if (!response.ok) {
        console.error('Regression API Error:', data);
        
        // 型ガードを使用してエラーレスポンスかチェック
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || '回帰分析中にエラーが発生しました';
          
          // カスタムエラーメッセージの処理
          if (errorData.detail && errorData.detail.includes('target_column')) {
            errorMessage = `目的変数 '${parameters.target_column}' が見つからないか、処理できませんでした。以下を確認してください：\n` +
              '• 目的変数名が正確に入力されていること\n' +
              '• 目的変数が数値データであること\n' +
              '• 欠損値がないこと';
          } else if (errorData.detail && errorData.detail.includes('insufficient')) {
            errorMessage = 'データが不足しています。回帰分析には最低10行以上のデータが推奨されます。';
          }
          
          // hintsがある場合は追加
          if (errorData.hints && Array.isArray(errorData.hints)) {
            errorMessage += '\n\n推奨事項:\n' + errorData.hints.map((hint: string) => `• ${hint}`).join('\n');
          }
          
          // デバッグ情報の表示
          if (errorData.debug?.filePreview && Array.isArray(errorData.debug.filePreview)) {
            console.log('ファイルプレビュー:', errorData.debug.filePreview);
            errorMessage += '\n\nファイルの最初の数行:\n' + errorData.debug.filePreview.join('\n');
          }
          
          throw new Error(errorMessage);
        }
      }

      // 成功レスポンスの処理
      if (!data.success) {
        throw new Error('error' in data ? data.error : '回帰分析に失敗しました');
      }

      console.log('回帰分析が完了しました:', data);

      // 型ガードでRegressionAnalysisResultかチェック
      const regressionResult = data as RegressionAnalysisResult;
      
      // session_idとn_componentsが正しく設定されているか確認
      console.log('Analysis result session_id:', regressionResult.session_id);
      console.log('Analysis result n_components:', regressionResult.data?.n_components);
      console.log('Analysis result structure:', regressionResult);
      
      // n_componentsが未設定の場合はデフォルト値を設定
      if (regressionResult.data && !regressionResult.data.n_components) {
        regressionResult.data.n_components = 2;
      }
      
      // 結果の設定と履歴の更新
      setResult(regressionResult);
      fetchSessions();
      
    } catch (err) {
      console.error('Regression analysis error:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP');
  };

  const getRegressionTypeLabel = (type: string) => {
    switch (type) {
      case 'linear': return '単回帰分析';
      case 'multiple': return '重回帰分析';
      case 'polynomial': return '多項式回帰';
      default: return type;
    }
  };

  return (
    <AnalysisLayout
      title="回帰分析"
      description="目的変数と説明変数の関係をモデル化し、予測や要因分析を行います"
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
                        placeholder="例: 売上予測分析2024"
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
                        placeholder="例: 売上, 予測, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        目的変数 *
                      </label>
                      <select
                        value={parameters.target_column}
                        onChange={(e) => setParameters({...parameters, target_column: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={!fileAnalyzed}
                      >
                        <option value="">
                          {fileAnalyzed ? '目的変数を選択してください' : 'ファイルを選択してください'}
                        </option>
                        {availableColumns.map(column => (
                          <option key={column} value={column}>{column}</option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-500 mt-1">予測したい変数を選択してください</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        回帰の種類
                      </label>
                      <select
                        value={parameters.regression_type}
                        onChange={(e) => setParameters({...parameters, regression_type: e.target.value as 'linear' | 'multiple' | 'polynomial'})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="linear">単回帰分析</option>
                        <option value="multiple">重回帰分析</option>
                        <option value="polynomial">多項式回帰</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">分析手法を選択してください</p>
                    </div>

                    {parameters.regression_type === 'polynomial' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          多項式の次数
                        </label>
                        <select
                          value={parameters.polynomial_degree}
                          onChange={(e) => setParameters({...parameters, polynomial_degree: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          {[2, 3, 4, 5].map(degree => (
                            <option key={degree} value={degree}>{degree}次</option>
                          ))}
                        </select>
                        <p className="text-sm text-gray-500 mt-1">多項式の次数を選択してください</p>
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
                        <option value={0.2}>20%</option>
                        <option value={0.3}>30%</option>
                        <option value={0.4}>40%</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">モデル評価用に分割するデータの割合</p>
                    </div>

                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={parameters.include_intercept}
                          onChange={(e) => setParameters({...parameters, include_intercept: e.target.checked})}
                          className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">切片を含める</span>
                      </label>
                      <p className="text-sm text-gray-500 mt-1">回帰式に切片項を含めるかどうか</p>
                    </div>
                  </div>
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
                        {fileAnalyzed && (
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
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p>保存された回帰分析がありません</p>
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
                        {session.total_inertia && (
                          <p>R²: {session.total_inertia.toFixed(3)}</p>
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
                    onClick={() => downloadCSV(result.session_id)}
                    className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    元CSV
                  </button>
                  <button
                    onClick={() => downloadAnalysisResultCSV(result)}
                    className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    分析詳細CSV
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
          
          {/* メタデータ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">ファイル情報</h3>
              <dl className="space-y-1 text-sm">
                {result.metadata.session_name && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">セッション名:</dt>
                    <dd className="font-medium">{result.metadata.session_name}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-600">ファイル名:</dt>
                  <dd className="font-medium">{result.metadata.filename}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">行数:</dt>
                  <dd className="font-medium">{result.metadata.rows}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">列数:</dt>
                  <dd className="font-medium">{result.metadata.columns}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">目的変数:</dt>
                  <dd className="font-medium">{result.data.target_column}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">分析結果</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">回帰の種類:</dt>
                  <dd className="font-medium">{getRegressionTypeLabel(result.data.regression_type)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">訓練データR²:</dt>
                  <dd className="font-medium">{result.data.train_r2.toFixed(4)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">テストデータR²:</dt>
                  <dd className="font-medium">{result.data.test_r2.toFixed(4)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">テストRMSE:</dt>
                  <dd className="font-medium">{result.data.test_rmse.toFixed(4)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">サンプル数:</dt>
                  <dd className="font-medium">{result.metadata.n_samples}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 回帰式 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">回帰式</h3>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="font-mono text-lg">
                {result.data.regression_type === 'polynomial' && result.data.polynomial_degree ? (
                  <span>
                    y = {result.data.coefficients.map((coeff, index) => {
                      if (index === 0) return coeff.toFixed(3);
                      const sign = coeff >= 0 ? ' + ' : ' - ';
                      const absCoeff = Math.abs(coeff).toFixed(3);
                      return `${sign}${absCoeff}x^${index}`;
                    }).join('')}
                    {result.data.intercept !== 0 && (
                      <span>{result.data.intercept >= 0 ? ' + ' : ' - '}{Math.abs(result.data.intercept).toFixed(3)}</span>
                    )}
                  </span>
                ) : result.data.regression_type === 'linear' ? (
                  <span>
                    y = {result.data.coefficients[0]?.toFixed(3) || '0'}x
                    {result.data.intercept !== 0 && (
                      <span>{result.data.intercept >= 0 ? ' + ' : ' - '}{Math.abs(result.data.intercept).toFixed(3)}</span>
                    )}
                  </span>
                ) : (
                  <span>
                    y = {result.data.intercept.toFixed(3)}
                    {result.data.feature_names.map((name, index) => {
                      const coeff = result.data.coefficients[index];
                      const sign = coeff >= 0 ? ' + ' : ' - ';
                      return `${sign}${Math.abs(coeff).toFixed(3)}×${name}`;
                    }).join('')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 評価指標 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">評価指標</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-800">{result.data.test_r2.toFixed(3)}</div>
                <div className="text-sm text-blue-600">テストR²</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-800">{result.data.test_rmse.toFixed(3)}</div>
                <div className="text-sm text-green-600">テストRMSE</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-800">{result.data.test_mae.toFixed(3)}</div>
                <div className="text-sm text-yellow-600">テストMAE</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-800">{result.metadata.n_features}</div>
                <div className="text-sm text-purple-600">説明変数数</div>
              </div>
            </div>
          </div>

          {/* プロット画像 */}
          {(result.data.plot_image || result.plot_base64) && (
            <div>
              <h3 className="font-semibold mb-4">回帰分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.data.plot_image || result.plot_base64}`}
                  alt="回帰分析プロット"
                  width={1600}
                  height={1200}
                  className="w-full h-auto"
                  priority
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* プロットの解釈ガイド */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">📊 プロットの見方</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 左上: 回帰直線/曲線とデータの関係</li>
                    <li>• 右上: 残差の分布（ランダムが理想）</li>
                    <li>• 左下: 予測値vs実測値（対角線に近いほど良い）</li>
                    <li>• 右下: 評価指標とモデル詳細</li>
                  </ul>
                </div>
                
                {/* 分析のポイント */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">💡 分析のポイント</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• R²値: {result.data.test_r2.toFixed(3)} ({result.data.test_r2 > 0.7 ? '良好' : result.data.test_r2 > 0.5 ? '中程度' : '要改善'})</li>
                    <li>• 残差の分布パターンを確認</li>
                    <li>• 外れ値の存在に注意</li>
                    <li>• 過学習の兆候をチェック</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 回帰係数の詳細 */}
          {result.data.feature_names && result.data.coefficients && (
            <div className="mt-8">
              <h3 className="font-semibold mb-4">回帰係数</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">変数名</th>
                        <th className="px-4 py-2 text-right">係数</th>
                        <th className="px-4 py-2 text-right">標準化係数</th>
                        <th className="px-4 py-2 text-center">影響度</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {result.data.feature_names.map((name, index) => {
                        const coefficient = result.data.coefficients[index];
                        const absCoeff = Math.abs(coefficient);
                        const maxAbsCoeff = Math.max(...result.data.coefficients.map(c => Math.abs(c)));
                        const influence = maxAbsCoeff > 0 ? (absCoeff / maxAbsCoeff) * 100 : 0;
                        
                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{name}</td>
                            <td className="px-4 py-2 text-right">{coefficient.toFixed(6)}</td>
                            <td className="px-4 py-2 text-right">{(coefficient / maxAbsCoeff).toFixed(3)}</td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center">
                                <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                  <div 
                                    className="bg-indigo-600 h-2 rounded-full" 
                                    style={{ width: `${influence}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs">{influence.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {result.data.intercept !== 0 && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-800">
                      <strong>切片:</strong> {result.data.intercept.toFixed(6)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 分析結果の解釈とアドバイス */}
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
                    <strong>決定係数（R²）: {result.data.test_r2.toFixed(3)}</strong>
                    {result.data.test_r2 > 0.8 ? ' - 非常に良い予測精度です' : 
                     result.data.test_r2 > 0.6 ? ' - 良い予測精度です' : 
                     result.data.test_r2 > 0.4 ? ' - 中程度の予測精度です' : 
                     ' - 予測精度の改善が必要です'}
                  </p>
                  <p>
                    <strong>RMSE: {result.data.test_rmse.toFixed(3)}</strong> - 
                    予測の平均的な誤差です。目的変数の単位で表されます。
                  </p>
                  {result.data.train_r2 - result.data.test_r2 > 0.1 && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ 訓練データとテストデータのR²差が大きいため、過学習の可能性があります。
                    </p>
                  )}
                  {result.data.test_r2 < 0.5 && (
                    <p className="text-orange-700 font-medium">
                      💡 予測精度が低いため、以下を検討してください：
                      特徴量の追加、外れ値の除去、別の回帰手法の試行
                    </p>
                  )}
                  {result.data.best_feature && (
                    <p>
                      <strong>最重要特徴量:</strong> {result.data.best_feature} - 
                      この変数が予測に最も大きく影響しています。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

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
          回帰分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              回帰分析は、目的変数と説明変数の関係をモデル化し、
              予測や要因分析を行う統計手法です。
              ビジネスにおける意思決定支援に広く活用されています。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🎯 適用場面</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• 売上予測・需要予測</li>
              <li>• 価格要因分析</li>
              <li>• マーケティング効果測定</li>
              <li>• リスク要因の特定</li>
              <li>• パフォーマンス要因分析</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 解釈のコツ</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• R²値で説明力を評価</li>
              <li>• 係数の符号と大きさを確認</li>
              <li>• 残差の分布を分析</li>
              <li>• 多重共線性に注意</li>
              <li>• 外れ値の影響を考慮</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2 text-blue-600">🔵 単回帰分析</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>用途:</strong> 1つの要因の影響を分析</p>
              <p><strong>例:</strong> 広告費と売上の関係</p>
              <p><strong>特徴:</strong> シンプルで解釈しやすい</p>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2 text-green-600">🟢 重回帰分析</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>用途:</strong> 複数要因の総合的な影響</p>
              <p><strong>例:</strong> 価格・品質・広告の売上への影響</p>
              <p><strong>特徴:</strong> 実務的で汎用性が高い</p>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2 text-purple-600">🟣 多項式回帰</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>用途:</strong> 非線形関係のモデル化</p>
              <p><strong>例:</strong> 温度と反応速度の関係</p>
              <p><strong>特徴:</strong> 曲線的な関係を表現</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">📊 データの準備について</h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>推奨データ形式:</strong> 行（観測値）×列（変数）の数値データ
            </p>
            <p>
              <strong>注意点:</strong> 
              欠損値の処理、外れ値の確認、変数間の相関関係をチェックしてください。
            </p>
            <p>
              <strong>サンプルサイズ:</strong> 
              説明変数の10倍以上の観測値があることが望ましいです。
            </p>
            <p>
              <strong>データ品質:</strong> 
              目的変数と説明変数に明確な関係があることを事前に確認してください。
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-semibold mb-2 text-amber-800">🔍 評価指標の見方</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-amber-700">
            <div>
              <p><strong>R²（決定係数）:</strong></p>
              <ul className="ml-4 space-y-1">
                <li>• 0.8以上: 非常に良い</li>
                <li>• 0.6-0.8: 良い</li>
                <li>• 0.4-0.6: 中程度</li>
                <li>• 0.4未満: 要改善</li>
              </ul>
            </div>
            <div>
              <p><strong>RMSE・MAE:</strong></p>
              <ul className="ml-4 space-y-1">
                <li>• 目的変数の単位で表示</li>
                <li>• 小さいほど予測精度が高い</li>
                <li>• RMSEは外れ値に敏感</li>
                <li>• MAEは外れ値に頑健</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}