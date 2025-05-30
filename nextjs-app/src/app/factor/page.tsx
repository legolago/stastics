//src/app/factor/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';

// 因子分析結果の型定義
interface FactorAnalysisResult {
  success: boolean;
  session_id: string | number;
  session_name: string;
  analysis_type: string;
  plot_base64: string;
  data: {
    n_factors: number;
    rotation: string;
    standardized: boolean;
    loadings: number[][];
    communalities: number[];
    uniquenesses: number[];
    eigenvalues: number[];
    explained_variance: number[];
    cumulative_variance: number[];
    factor_scores: number[][];
    feature_names: string[];
    sample_names: string[];
    assumptions: {
      kmo_model: number;
      kmo_interpretation: string;
      bartlett_p_value: number;
      bartlett_significant: boolean;
      n_samples: number;
      n_features: number;
    };
    method: string;
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    feature_names: string[];
    sample_names: string[];
  };
  session_info: {
    session_id: string | number;
    session_name: string;
    description: string;
    tags: string[];
    analysis_timestamp: string;
    filename: string;
    analysis_type: string;
    row_count: number;
    column_count: number;
  };
}

// 因子分析セッションの型定義
interface FactorSession {
  session_id: number;
  session_name: string;
  filename: string;
  description: string;
  tags: string[];
  analysis_timestamp: string;
  row_count: number;
  column_count: number;
  analysis_type: string;
  total_inertia?: number;
  dimensions_count?: number;
  dimension_1_contribution?: number;
  dimension_2_contribution?: number;
}

// 因子分析パラメータの型定義
interface FactorParams {
  n_factors?: number;
  rotation: string;
  standardize: boolean;
}

// セッション詳細レスポンスの型定義
interface SessionDetailResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// API エラーレスポンスの型定義
interface ApiErrorResponse {
  success: false;
  error: string;
  detail?: string;
  hints?: string[];
  debug?: {
    filePreview?: string[];
    requestInfo?: {
      url: string;
      params: Record<string, string>;
    };
  };
}

// API 成功レスポンスの型定義
interface ApiSuccessResponse {
  success: true;
  session_id: number;
  data: any;
  metadata: any;
  [key: string]: any;
}

// レスポンス型の統合
type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function FactorAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<FactorParams>({
    n_factors: undefined,
    rotation: 'varimax',
    standardize: true
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FactorAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<FactorSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // セッション履歴を取得（因子分析のみ）
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      const params = new URLSearchParams({
        userId: 'default',
        limit: '50',
        offset: '0',
        analysis_type: 'factor', // バックエンドに合わせて修正
      });

      console.log('Fetching factor analysis sessions...');
      
      const response = await fetch(`/api/sessions?${params.toString()}`);
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      const data = JSON.parse(responseText);
      
      if (data.success) {
        // 因子分析のセッションのみフィルター（念のため）
        const factorSessions = data.data.filter((session: any) => session.analysis_type === 'factor');
        setSessions(factorSessions);
      } else {
        throw new Error(data.error || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('Session fetch error:', error);
      setError(error instanceof Error ? error.message : 'データ取得中にエラーが発生しました');
    } finally {
      setSessionsLoading(false);
    }
  };

  // 特定のセッションの詳細を取得
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      console.log('Fetching session details for:', sessionId);
      
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        console.error(`HTTP ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        alert('セッション詳細の取得に失敗しました');
        return;
      }

      const data: SessionDetailResponse = await response.json();
      console.log('Received session data:', data);

      if (data.success && data.data) {
        const pythonResponse = data.data;
        
        // 因子分析結果の型安全な変換処理
        const analysisResult: FactorAnalysisResult = {
          success: true,
          session_id: pythonResponse.session_info?.session_id || sessionId,
          session_name: pythonResponse.session_info?.session_name || '',
          analysis_type: 'factor',
          plot_base64: pythonResponse.visualization?.plot_image || pythonResponse.plot_base64 || "", 
          data: {
            n_factors: pythonResponse.analysis_data?.n_factors || pythonResponse.data?.n_factors || 0,
            rotation: pythonResponse.analysis_data?.rotation || pythonResponse.data?.rotation || 'varimax',
            standardized: pythonResponse.analysis_data?.standardized || pythonResponse.data?.standardized || true,
            loadings: pythonResponse.analysis_data?.loadings || pythonResponse.data?.loadings || [],
            communalities: pythonResponse.analysis_data?.communalities || pythonResponse.data?.communalities || [],
            uniquenesses: pythonResponse.analysis_data?.uniquenesses || pythonResponse.data?.uniquenesses || [],
            eigenvalues: pythonResponse.analysis_data?.eigenvalues || pythonResponse.data?.eigenvalues || [],
            explained_variance: pythonResponse.analysis_data?.explained_variance || pythonResponse.data?.explained_variance || [],
            cumulative_variance: pythonResponse.analysis_data?.cumulative_variance || pythonResponse.data?.cumulative_variance || [],
            factor_scores: pythonResponse.analysis_data?.factor_scores || pythonResponse.data?.factor_scores || [],
            feature_names: pythonResponse.analysis_data?.feature_names || pythonResponse.data?.feature_names || [],
            sample_names: pythonResponse.analysis_data?.sample_names || pythonResponse.data?.sample_names || [],
            assumptions: pythonResponse.analysis_data?.assumptions || pythonResponse.data?.assumptions || {
              kmo_model: 0,
              kmo_interpretation: 'unknown',
              bartlett_p_value: 1,
              bartlett_significant: false,
              n_samples: 0,
              n_features: 0
            },
            method: pythonResponse.analysis_data?.method || pythonResponse.data?.method || 'unknown'
          },
          metadata: {
            session_name: pythonResponse.session_info?.session_name || '',
            filename: pythonResponse.session_info?.filename || '',
            rows: pythonResponse.metadata?.row_count || 0,
            columns: pythonResponse.metadata?.column_count || 0,
            feature_names: pythonResponse.analysis_data?.feature_names || pythonResponse.data?.feature_names || [],
            sample_names: pythonResponse.analysis_data?.sample_names || pythonResponse.data?.sample_names || []
          },
          session_info: {
            session_id: pythonResponse.session_info?.session_id || sessionId,
            session_name: pythonResponse.session_info?.session_name || '',
            description: pythonResponse.session_info?.description || '',
            tags: pythonResponse.session_info?.tags || [],
            analysis_timestamp: pythonResponse.session_info?.analysis_timestamp || '',
            filename: pythonResponse.session_info?.filename || '',
            analysis_type: 'factor',
            row_count: pythonResponse.metadata?.row_count || 0,
            column_count: pythonResponse.metadata?.column_count || 0
          }
        };

        setResult(analysisResult);
        console.log('Factor analysis session details loaded successfully');
        
      } else {
        console.error('Invalid response format:', data);
        alert('セッションデータの形式が不正です');
      }
    } catch (err) {
      console.error('セッション詳細取得エラー:', err);
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `factor_analysis_${sessionId}_plot.png`;
      
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
  const downloadAnalysisResultCSV = async (result: FactorAnalysisResult) => {
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `factor_analysis_results_${result.session_id}.csv`;
      
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
        
        let csvContent = "因子分析結果\n";
        csvContent += `セッション名,${result.metadata?.session_name || result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.metadata?.filename || '不明'}\n`;
        csvContent += `データサイズ,${result.metadata?.rows || 0}行 × ${result.metadata?.columns || 0}列\n`;
        csvContent += `因子数,${result.data?.n_factors || 0}\n`;
        csvContent += `回転方法,${result.data?.rotation || '不明'}\n`;
        csvContent += `標準化,${result.data?.standardized ? '実行済み' : '未実行'}\n`;
        csvContent += `KMO測度,${result.data?.assumptions?.kmo_model || 0}\n`;
        csvContent += `Bartlett検定p値,${result.data?.assumptions?.bartlett_p_value || 1}\n`;
        csvContent += "\n因子別情報\n";
        csvContent += "因子,固有値,寄与率(%),累積寄与率(%)\n";
        
        if (result.data?.eigenvalues && result.data?.explained_variance) {
          result.data.eigenvalues.forEach((eigenvalue, index) => {
            const explained = result.data.explained_variance[index] || 0;
            const cumulative = result.data.cumulative_variance?.[index] || 0;
            csvContent += `因子${index + 1},${eigenvalue},${explained.toFixed(2)},${cumulative.toFixed(2)}\n`;
          });
        }

        csvContent += "\n因子負荷量\n";
        csvContent += "変数," + Array.from({ length: result.data?.n_factors || 0 }, (_, i) => `因子${i + 1}`).join(",") + ",共通性\n";
        
        if (result.data?.feature_names && result.data?.loadings && result.data?.communalities) {
          result.data.feature_names.forEach((feature, i) => {
            const loadings = result.data.loadings[i] || [];
            const communality = result.data.communalities[i] || 0;
            csvContent += `${feature},${loadings.map(l => l.toFixed(3)).join(",")},${communality.toFixed(3)}\n`;
          });
        }

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `factor_analysis_result_${result.session_id}.csv`;
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

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    // ファイル名から自動的にセッション名を生成
    if (!sessionName && selectedFile.name) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setSessionName(`${nameWithoutExt}_因子分析`);
    }
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
        rotation: parameters.rotation,
        standardize: parameters.standardize.toString()
      });

      // 因子数が指定されている場合のみ追加
      if (parameters.n_factors !== undefined && parameters.n_factors > 0) {
        params.append('n_factors', parameters.n_factors.toString());
      }

      console.log('因子分析を開始します...', params.toString());
      const response = await fetch(`/api/factor/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      console.log('API Response:', response.status, responseText);

      let data: ApiResponse;
      try {
        data = JSON.parse(responseText) as ApiResponse;
      } catch (parseError) {
        console.error('Response parsing error:', parseError);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      if (!response.ok) {
        console.error('API Error:', data);
        
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || 'データの分析中にエラーが発生しました';
          
          if (errorData.hints && Array.isArray(errorData.hints)) {
            errorMessage += '\n\n推奨事項:\n' + errorData.hints.map((hint: string) => `• ${hint}`).join('\n');
          }
          
          if (errorData.debug?.filePreview && Array.isArray(errorData.debug.filePreview)) {
            console.log('ファイルプレビュー:', errorData.debug.filePreview);
            errorMessage += '\n\nファイルの最初の数行:\n' + errorData.debug.filePreview.join('\n');
          }
          
          throw new Error(errorMessage);
        }
      }

      if (!data.success) {
        throw new Error('error' in data ? data.error : 'データの分析に失敗しました');
      }

      console.log('因子分析が完了しました:', data);

      // 結果の設定と履歴の更新
      setResult(data as FactorAnalysisResult);
      fetchSessions();
      
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

  const getKMOColor = (kmo: number | string | null | undefined) => {
    const kmoValue = typeof kmo === 'string' ? parseFloat(kmo) : (kmo || 0);
    if (kmoValue >= 0.9) return 'text-green-600';
    if (kmoValue >= 0.8) return 'text-blue-600';
    if (kmoValue >= 0.7) return 'text-yellow-600';
    if (kmoValue >= 0.6) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatNumber = (num: number | string | null | undefined, decimals: number = 3) => {
    if (num === null || num === undefined || num === '') return '0.000';
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(numValue) ? '0.000' : numValue.toFixed(decimals);
  };

  return (
    <AnalysisLayout
      title="因子分析"
      description="観測変数の背後にある潜在因子を見つけ出し、データの構造を理解します"
      analysisType="factor"
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
              <h2 className="text-xl font-semibold mb-4">新しい因子分析を実行</h2>
              
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
                        placeholder="例: 心理尺度因子分析2024"
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
                        placeholder="例: 心理尺度, アンケート, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        因子数
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={parameters.n_factors || ''}
                        onChange={(e) => setParameters({
                          ...parameters, 
                          n_factors: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="自動決定（固有値>1）"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">空白の場合は固有値&gt;1で自動決定</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        回転方法
                      </label>
                      <select
                        value={parameters.rotation}
                        onChange={(e) => setParameters({...parameters, rotation: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="varimax">Varimax（直交回転）</option>
                        <option value="promax">Promax（斜交回転）</option>
                        <option value="oblimin">Oblimin（斜交回転）</option>
                        <option value="quartimax">Quartimax（直交回転）</option>
                        <option value="equamax">Equamax（直交回転）</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">因子間の独立性を仮定するかどうかを選択</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        データの標準化
                      </label>
                      <div className="flex items-center space-x-3">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="standardize"
                            checked={parameters.standardize === true}
                            onChange={() => setParameters({...parameters, standardize: true})}
                            className="mr-2"
                          />
                          標準化する
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="standardize"
                            checked={parameters.standardize === false}
                            onChange={() => setParameters({...parameters, standardize: false})}
                            className="mr-2"
                          />
                          しない
                        </label>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">異なるスケールの変数がある場合は標準化を推奨</p>
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
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={!file || !sessionName.trim() || loading}
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
                        因子分析中...
                      </>
                    ) : (
                      '因子分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">因子分析履歴</h2>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m8-8V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1m8 0V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1" />
                  </svg>
                  <p>保存された因子分析がありません</p>
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
                            className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>分析日時: {formatDate(session.analysis_timestamp)}</p>
                        <p>データサイズ: {session.row_count} × {session.column_count}</p>
                        {session.dimensions_count && (
                          <p>因子数: {session.dimensions_count}</p>
                        )}
                        {session.dimension_1_contribution && (
                          <p>第1因子寄与率: {(session.dimension_1_contribution * 100).toFixed(1)}%</p>
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
            <h2 className="text-2xl font-semibold">因子分析結果</h2>
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
                    onClick={() => downloadAnalysisResultCSV(result)}
                    className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    分析詳細CSV
                  </button>
                  <button
                    onClick={() => downloadPlotImage(Number(result.session_id))}
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
          
          {/* メタデータ - 因子分析特有の情報 */}
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
                  <dt className="text-gray-600">サンプル数:</dt>
                  <dd className="font-medium">{result.metadata.rows}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">変数数:</dt>
                  <dd className="font-medium">{result.metadata.columns}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">分析統計</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">抽出因子数:</dt>
                  <dd className="font-medium">{result.data.n_factors}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">回転方法:</dt>
                  <dd className="font-medium">{result.data.rotation}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">標準化:</dt>
                  <dd className="font-medium">{result.data.standardized ? '実行済み' : '未実行'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">分析手法:</dt>
                  <dd className="font-medium">{result.data.method}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 前提条件チェック */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">分析の前提条件</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">適合度指標</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">KMO測度:</span>
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${getKMOColor(result.data.assumptions.kmo_model)}`}>
                        {formatNumber(result.data.assumptions.kmo_model)}
                      </span>
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                        {result.data.assumptions.kmo_interpretation}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Bartlett検定:</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs">
                        p = {result.data.assumptions.bartlett_p_value?.toExponential(2) || 'N/A'}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        result.data.assumptions.bartlett_significant 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {result.data.assumptions.bartlett_significant ? '有意' : '非有意'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">データ品質</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">サンプル/変数比:</span>
                    <span className={`font-medium ${
                      (result.data.assumptions.n_samples / result.data.assumptions.n_features) >= 5 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }`}>
                      {formatNumber(result.data.assumptions.n_samples / result.data.assumptions.n_features, 1)}:1
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">低共通性変数:</span>
                    <span className={`font-medium ${
                      result.data.communalities.filter(c => c < 0.5).length === 0 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }`}>
                      {result.data.communalities.filter(c => c < 0.5).length} 個
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 診断メッセージ */}
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium mb-2 text-blue-800">📊 診断結果</h4>
              <div className="text-sm text-blue-700 space-y-1">
                {result.data.assumptions.kmo_model >= 0.6 ? (
                  <p>✅ KMO測度が適切で、因子分析に適したデータです</p>
                ) : (
                  <p>⚠️ KMO測度が低く、因子分析の結果は慎重に解釈してください</p>
                )}
                
                {result.data.assumptions.bartlett_significant ? (
                  <p>✅ Bartlett検定が有意で、変数間に十分な相関があります</p>
                ) : (
                  <p>⚠️ Bartlett検定が非有意で、変数間の相関が不十分な可能性があります</p>
                )}
                
                {result.data.communalities.filter(c => c < 0.5).length > 0 && (
                  <p>⚠️ 共通性の低い変数があります。除去を検討してください</p>
                )}
              </div>
            </div>
          </div>

          {/* 因子の寄与率 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">因子別寄与率</h3>
            <div className="space-y-3">
              {result.data.explained_variance?.map((variance, index) => (
                <div key={index} className="flex items-center">
                  <span className="w-20 text-sm font-medium">因子{index + 1}:</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 mr-4">
                    <div 
                      className="bg-purple-600 h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(0, Math.min(100, Number(variance) || 0))}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium w-16 text-right">
                    {formatNumber(variance, 1)}%
                  </span>
                  <span className="text-xs text-gray-500 w-20 text-right ml-2">
                    (累積: {formatNumber(result.data.cumulative_variance?.[index], 1)}%)
                  </span>
                </div>
              )) || (
                <div className="text-center text-gray-500 py-4">
                  寄与率データがありません
                </div>
              )}
            </div>
            
            {/* 詳細表 */}
            {result.data.eigenvalues && result.data.eigenvalues.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">因子</th>
                      <th className="px-4 py-2 text-right">固有値</th>
                      <th className="px-4 py-2 text-right">寄与率</th>
                      <th className="px-4 py-2 text-right">累積寄与率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.eigenvalues.map((eigenvalue, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">因子{index + 1}</td>
                        <td className="px-4 py-2 text-right">
                          {Number(eigenvalue).toFixed(4)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {(result.data.explained_variance?.[index] || 0).toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          {(result.data.cumulative_variance?.[index] || 0).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* プロット画像 */}
          {result.plot_base64 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">因子分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.plot_base64}`}
                  alt="因子分析プロット"
                  width={1400}
                  height={1100}
                  className="w-full h-auto"
                  priority
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">📊 プロットの見方</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• スクリープロット: 因子数決定の参考</li>
                    <li>• 因子負荷量: 変数と因子の関係の強さ</li>
                    <li>• 共通性: 因子による説明力</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">💡 解釈のポイント</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• |因子負荷量| ≥ 0.5: 中程度の関連</li>
                    <li>• |因子負荷量| ≥ 0.7: 強い関連</li>
                    <li>• 共通性 ≥ 0.5: 適切な説明力</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 因子負荷量の詳細表 */}
          <div className="mt-8">
            <h3 className="font-semibold mb-4">因子負荷量行列</h3>
            <p className="text-sm text-gray-600 mb-4">各変数が各因子にどの程度関連しているかを示します</p>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">変数</th>
                    {Array.from({ length: result.data.n_factors || 0 }, (_, i) => (
                      <th key={i} className="border border-gray-300 px-3 py-2 text-center">
                        因子{i + 1}
                      </th>
                    ))}
                    <th className="border border-gray-300 px-3 py-2 text-center">共通性</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.data.feature_names || []).map((feature, i) => (
                    <tr key={feature} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-3 py-2 font-medium">
                        {feature}
                      </td>
                      {(result.data.loadings?.[i] || []).map((loading, j) => (
                        <td 
                          key={j} 
                          className={`border border-gray-300 px-3 py-2 text-center ${
                            Math.abs(loading) >= 0.5 ? 'font-bold' : ''
                          } ${
                            Math.abs(loading) >= 0.7 ? 'bg-blue-100' : 
                            Math.abs(loading) >= 0.5 ? 'bg-blue-50' : ''
                          }`}
                        >
                          {formatNumber(loading)}
                        </td>
                      ))}
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        <span className={
                          (result.data.communalities?.[i] || 0) >= 0.7 ? 'text-green-600 font-bold' :
                          (result.data.communalities?.[i] || 0) >= 0.5 ? 'text-blue-600' :
                          'text-red-600'
                        }>
                          {formatNumber(result.data.communalities?.[i] || 0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              <p><strong>解釈の目安:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>因子負荷量 ≥ 0.7: 強い関連（青色の背景）</li>
                <li>因子負荷量 ≥ 0.5: 中程度の関連（薄青色の背景）</li>
                <li>共通性 ≥ 0.7: 因子による説明が良好（緑色）</li>
                <li>共通性 ≥ 0.5: 因子による説明が適切（青色）</li>
              </ul>
            </div>
          </div>

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
                    <strong>抽出因子数 ({result.data.n_factors}個)</strong>: 
                    {result.data.n_factors <= 5 ? 
                      '適切な因子数です。各因子の意味を解釈してください。' : 
                      '因子数が多い可能性があります。より少ない因子数での分析も検討してください。'
                    }
                  </p>
                  <p>
                    <strong>累積寄与率 ({formatNumber(
                      result.data.cumulative_variance?.[result.data.cumulative_variance.length - 1], 1
                    )}%)</strong>: 
                    {(Number(result.data.cumulative_variance?.[result.data.cumulative_variance.length - 1]) || 0) >= 60 ?
                      '十分な説明力があります。' :
                      '説明力が不足している可能性があります。因子数の追加を検討してください。'
                    }
                  </p>
                  <p>
                    <strong>回転方法 ({result.data.rotation})</strong>: 
                    {result.data.rotation === 'varimax' || result.data.rotation === 'quartimax' ?
                      '直交回転により、因子間は独立と仮定されています。' :
                      '斜交回転により、因子間の相関が考慮されています。'
                    }
                  </p>
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
          <span className="text-2xl mr-3">📚</span>
          因子分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              因子分析は、観測された多数の変数の背後にある少数の潜在因子（共通因子）を見つけ出す統計手法です。
              データの構造を理解し、次元削減を行います。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🎯 適用場面</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• 心理尺度の構成概念検証</li>
              <li>• 顧客満足度の要因分析</li>
              <li>• アンケート調査の因子構造</li>
              <li>• 製品評価の基準軸特定</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 主成分分析との違い</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• 因子分析: 潜在因子を仮定</li>
              <li>• 主成分分析: 分散最大化</li>
              <li>• 因子分析: 共通性・独自性を分離</li>
              <li>• 主成分分析: 全分散を説明</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">⚠️ 前提条件</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• KMO測度 ≥ 0.6（理想的には ≥ 0.8）</li>
              <li>• Bartlett検定が有意（p &lt; 0.05）</li>
              <li>• サンプル数は変数数の5-10倍以上</li>
              <li>• 変数間に適度な相関（0.3-0.9）</li>
              <li>• 最低3つの変数が必要</li>
            </ul>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">🔄 回転方法の選択</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <strong>直交回転:</strong>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Varimax: 因子の解釈しやすさ重視</li>
                  <li>Quartimax: 変数の単純構造重視</li>
                </ul>
              </div>
              <div>
                <strong>斜交回転:</strong>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Promax: 因子間相関を許可</li>
                  <li>Oblimin: より柔軟な構造</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold mb-2">📊 データの準備について</h3>
          <div className="text-sm text-yellow-700 space-y-2">
            <p>
              <strong>推奨データ形式:</strong> 行（サンプル・回答者）×列（変数・質問項目）の形式
            </p>
            <p>
              <strong>注意点:</strong> 
              数値データのみ対応。リッカート尺度（1-5点、1-7点など）が適しています。
              欠損値は事前に処理してください。
            </p>
            <p>
              <strong>サンプルサイズ:</strong> 
              変数数の5-10倍のサンプルサイズが理想的です。最低でも変数数の3倍は必要です。
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <h3 className="font-semibold mb-2">📄 サンプルデータ形式</h3>
          <div className="text-sm text-green-700">
            <p className="mb-2">因子分析用のCSVファイルは以下の形式で準備してください：</p>
            <div className="bg-white p-3 rounded border font-mono text-xs">
              <div>ID,質問1,質問2,質問3,質問4,質問5</div>
              <div>回答者1,5,4,3,5,4</div>
              <div>回答者2,3,3,4,2,3</div>
              <div>回答者3,4,5,5,4,5</div>
              <div>...</div>
            </div>
            <p className="mt-2">
              • 1行目: 変数名（質問項目名など）<br/>
              • 1列目: サンプルID（回答者IDなど）<br/>
              • データ部分: 数値のみ（リッカート尺度など）
            </p>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}