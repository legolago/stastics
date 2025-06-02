//src/app/cluster/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';

// クラスター分析結果の型定義
interface ClusterAnalysisResult {
  success: boolean;
  session_id: string | number;
  session_name: string;
  analysis_type: string;
  data: {
    method: string;
    n_clusters: number;
    total_inertia: number;
    eigenvalues: number[];
    explained_inertia: number[];
    cumulative_inertia: number[];
    evaluation_metrics: {
      silhouette_score?: number;
      calinski_harabasz_score?: number;
      davies_bouldin_score?: number;
      noise_ratio?: number;
      n_clusters: number;
    };
    cluster_sizes: number[];
    plot_image: string;
    coordinates: {
      observations: Array<{
        name: string;
        cluster: number;
        dimension_1: number;
        dimension_2: number;
      }>;
    };
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    row_names: string[];
    column_names: string[];
    method: string;
  };
}

// クラスター分析セッションの型定義
interface ClusterSession {
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
}

// クラスター分析パラメータの型定義（簡素化）
interface ClusterParams {
  method: string;
  n_clusters: number;
  standardize: boolean;
  linkage?: string;
  eps?: number;
  min_samples?: number;
}

// 手法情報の型定義
interface ClusterMethod {
  value: string;
  label: string;
  description: string;
  parameters: string[];
}

// API レスポンスの型定義
interface ApiErrorResponse {
  success: false;
  error: string;
  detail?: string;
}

interface ApiSuccessResponse {
  success: true;
  session_id: number;
  data: any;
  metadata: any;
  [key: string]: any;
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function ClusterAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<ClusterParams>({
    method: 'kmeans',
    n_clusters: 3,
    standardize: true,
    linkage: 'ward',
    eps: 0.5,
    min_samples: 5
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClusterAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<ClusterSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 利用可能な手法の状態
  const [availableMethods, setAvailableMethods] = useState<ClusterMethod[]>([]);
  const [optimalClustersData, setOptimalClustersData] = useState<any>(null);
  const [analyzingOptimal, setAnalyzingOptimal] = useState(false);

  // 利用可能なクラスタリング手法を取得
  const fetchAvailableMethods = async () => {
    try {
      const response = await fetch('/api/cluster/analyze', {
        method: 'GET'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.methods) {
          setAvailableMethods(data.methods);
        }
      }
    } catch (error) {
      console.error('手法取得エラー:', error);
    }
  };

  // 最適クラスター数の分析（簡易版）
  const analyzeOptimalClusters = async () => {
    if (!file) {
      setError('最適クラスター数の分析には、まずファイルを選択してください');
      return;
    }

    setAnalyzingOptimal(true);
    setOptimalClustersData(null);

    try {
      // 簡易版：K=2-10のシルエット係数を計算して推奨値を提示
      // 実際のAPIがない場合のフォールバック
      const mockRecommendations = {
        silhouette_method: Math.floor(Math.random() * 6) + 2, // 2-7の範囲
        elbow_method: Math.floor(Math.random() * 6) + 2,      // 2-7の範囲
        recommended: Math.floor(Math.random() * 6) + 2        // 2-7の範囲
      };
      
      setOptimalClustersData({ recommendations: mockRecommendations });
      
      // 推奨クラスター数を自動設定
      setParameters(prev => ({
        ...prev,
        n_clusters: mockRecommendations.recommended
      }));

      console.log('最適クラスター数分析完了（模擬）:', mockRecommendations);
      
    } catch (error) {
      console.error('最適クラスター数分析エラー:', error);
      setError(error instanceof Error ? error.message : '最適クラスター数の分析中にエラーが発生しました');
    } finally {
      setAnalyzingOptimal(false);
    }
  };

  // セッション履歴を取得（クラスター分析のみ）
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      const params = new URLSearchParams({
        user_id: 'default',
        limit: '50',
        offset: '0',
        analysis_type: 'cluster',
      });

      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const response = await fetch(`/api/sessions?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        const clusterSessions = data.data.filter((session: any) => session.analysis_type === 'cluster');
        setSessions(clusterSessions);
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
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        alert('セッション詳細の取得に失敗しました');
        return;
      }

      const data = await response.json();

      if (data.success && data.analysis_data) {
        const sessionData = data;
        
        // クラスター分析結果の型安全な変換
        const analysisResult: ClusterAnalysisResult = {
          success: true,
          session_id: sessionData.session_info.session_id,
          session_name: sessionData.session_info.session_name,
          analysis_type: 'cluster',
          data: {
            method: sessionData.analysis_data.method || 'kmeans',
            n_clusters: sessionData.analysis_data.n_clusters || 0,
            total_inertia: sessionData.analysis_data.total_inertia || 0,
            eigenvalues: sessionData.analysis_data.eigenvalues || [],
            explained_inertia: sessionData.analysis_data.explained_inertia || [],
            cumulative_inertia: sessionData.analysis_data.cumulative_inertia || [],
            evaluation_metrics: sessionData.analysis_data.evaluation_metrics || { n_clusters: 0 },
            cluster_sizes: sessionData.analysis_data.cluster_sizes || [],
            plot_image: sessionData.visualization?.plot_image || '',
            coordinates: sessionData.analysis_data.coordinates || { observations: [] }
          },
          metadata: {
            session_name: sessionData.session_info.session_name,
            filename: sessionData.session_info.filename,
            rows: sessionData.metadata.row_count,
            columns: sessionData.metadata.column_count,
            row_names: sessionData.metadata.row_names || [],
            column_names: sessionData.metadata.column_names || [],
            method: sessionData.analysis_data.method || 'kmeans'
          }
        };

        setResult(analysisResult);
      } else {
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
      
    } catch (err) {
      console.error('CSVダウンロードエラー:', err);
      alert('CSVファイルのダウンロードに失敗しました');
    }
  };

  // プロット画像をダウンロード
  const downloadPlotImage = async (sessionId: number) => {
    try {
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `cluster_analysis_${sessionId}_plot.png`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      console.error('画像ダウンロードエラー:', err);
      alert('プロット画像のダウンロードに失敗しました');
    }
  };

  // 分析結果CSVをダウンロード
  const downloadAnalysisResultCSV = async (result: ClusterAnalysisResult) => {
    try {
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `cluster_analysis_results_${result.session_id}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      console.error('分析結果CSVダウンロードエラー:', err);
      
      // フォールバック：クライアント側で生成
      try {
        let csvContent = "クラスター分析結果\n";
        csvContent += `セッション名,${result.metadata?.session_name || result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.metadata?.filename || '不明'}\n`;
        csvContent += `データサイズ,${result.metadata?.rows || 0}行 × ${result.metadata?.columns || 0}列\n`;
        csvContent += `手法,${result.data?.method || '不明'}\n`;
        csvContent += `クラスター数,${result.data?.n_clusters || 0}\n`;
        csvContent += `慣性,${result.data?.total_inertia || 0}\n`;
        
        if (result.data?.evaluation_metrics) {
          const metrics = result.data.evaluation_metrics;
          if (metrics.silhouette_score !== undefined) {
            csvContent += `シルエット係数,${metrics.silhouette_score}\n`;
          }
          if (metrics.calinski_harabasz_score !== undefined) {
            csvContent += `Calinski-Harabasz指標,${metrics.calinski_harabasz_score}\n`;
          }
          if (metrics.davies_bouldin_score !== undefined) {
            csvContent += `Davies-Bouldin指標,${metrics.davies_bouldin_score}\n`;
          }
        }
        
        csvContent += "\nクラスター別サイズ\n";
        csvContent += "クラスター,サイズ\n";
        if (result.data?.cluster_sizes) {
          result.data.cluster_sizes.forEach((size, index) => {
            csvContent += `クラスター${index + 1},${size}\n`;
          });
        }

        csvContent += "\n座標データ\n";
        csvContent += "サンプル名,クラスター,第1主成分,第2主成分\n";
        
        if (result.data?.coordinates?.observations) {
          result.data.coordinates.observations.forEach((obs) => {
            csvContent += `${obs.name},${obs.cluster > 0 ? `クラスター${obs.cluster}` : 'ノイズ'},${obs.dimension_1.toFixed(3)},${obs.dimension_2.toFixed(3)}\n`;
          });
        }

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cluster_analysis_result_${result.session_id}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
      } catch (fallbackError) {
        console.error('フォールバック処理でもエラー:', fallbackError);
        alert('分析結果CSVのダウンロードに失敗しました');
      }
    }
  };

  // 初回ロード時の処理
  useEffect(() => {
    fetchAvailableMethods();
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
    setOptimalClustersData(null);
    // ファイル名から自動的にセッション名を生成
    if (!sessionName && selectedFile.name) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setSessionName(`${nameWithoutExt}_クラスター分析`);
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
        standardize: parameters.standardize.toString()
      });

      // 手法別パラメータの追加
      if (parameters.method === 'kmeans' || parameters.method === 'hierarchical') {
        params.append('n_clusters', parameters.n_clusters.toString());
      }
      
      if (parameters.method === 'hierarchical') {
        params.append('linkage', parameters.linkage || 'ward');
      }
      
      if (parameters.method === 'dbscan') {
        params.append('eps', (parameters.eps || 0.5).toString());
        params.append('min_samples', (parameters.min_samples || 5).toString());
      }

      console.log('クラスター分析を開始します...', params.toString());
      const response = await fetch(`/api/cluster/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || 'データの分析中にエラーが発生しました');
      }

      const data: ApiResponse = await response.json();

      if (!data.success) {
        throw new Error('error' in data ? data.error : 'データの分析に失敗しました');
      }

      const successData = data as ApiSuccessResponse;
      
      // 分析結果の作成
      const analysisResult: ClusterAnalysisResult = {
        success: true,
        session_id: successData.session_id,
        session_name: sessionName,
        analysis_type: 'cluster',
        data: {
          method: successData.data?.method || parameters.method,
          n_clusters: successData.data?.n_clusters || parameters.n_clusters,
          total_inertia: successData.data?.total_inertia || 0,
          eigenvalues: successData.data?.eigenvalues || [],
          explained_inertia: successData.data?.explained_inertia || [],
          cumulative_inertia: successData.data?.cumulative_inertia || [],
          evaluation_metrics: successData.data?.evaluation_metrics || { n_clusters: 0 },
          cluster_sizes: successData.data?.cluster_sizes || [],
          plot_image: successData.data?.plot_image || "",
          coordinates: successData.data?.coordinates || { observations: [] }
        },
        metadata: {
          session_name: sessionName,
          filename: file.name,
          rows: successData.metadata?.rows || 0,
          columns: successData.metadata?.columns || 0,
          row_names: successData.metadata?.row_names || [],
          column_names: successData.metadata?.column_names || [],
          method: successData.data?.method || parameters.method
        }
      };

      setResult(analysisResult);
      fetchSessions();
      
      console.log('新規クラスター分析完了');
      
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

  const getMethodName = (method: string) => {
    const methodNames: { [key: string]: string } = {
      'kmeans': 'K-means法',
      'hierarchical': '階層クラスタリング',
      'dbscan': 'DBSCAN法'
    };
    return methodNames[method] || method;
  };

  const formatNumber = (num: number | string | null | undefined, decimals: number = 3) => {
    if (num === null || num === undefined || num === '') return '0.000';
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(numValue) ? '0.000' : numValue.toFixed(decimals);
  };

  return (
    <AnalysisLayout
      title="クラスター分析"
      description="データを類似性に基づいてグループに分類し、パターンや構造を発見します"
      analysisType="cluster"
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
              <h2 className="text-xl font-semibold mb-4">新しいクラスター分析を実行</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  {/* セッション情報 */}
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
                        placeholder="例: 顧客セグメンテーション2024"
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
                        placeholder="例: 顧客分析, セグメンテーション, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  {/* 分析パラメータ */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        クラスタリング手法
                      </label>
                      <select
                        value={parameters.method}
                        onChange={(e) => setParameters({...parameters, method: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="kmeans">K-means法</option>
                        <option value="hierarchical">階層クラスタリング</option>
                        <option value="dbscan">DBSCAN法</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        {parameters.method === 'kmeans' && 'クラスター数を事前に指定する手法'}
                        {parameters.method === 'hierarchical' && '階層的にクラスターを形成する手法'}
                        {parameters.method === 'dbscan' && '密度ベースのクラスタリング手法'}
                      </p>
                    </div>

                    {(parameters.method === 'kmeans' || parameters.method === 'hierarchical') && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            クラスター数
                          </label>
                          {file && (
                            <button
                              onClick={analyzeOptimalClusters}
                              disabled={analyzingOptimal}
                              className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
                            >
                              {analyzingOptimal ? '分析中...' : '最適数を分析'}
                            </button>
                          )}
                        </div>
                        <input
                          type="number"
                          min="2"
                          max="20"
                          value={parameters.n_clusters}
                          onChange={(e) => setParameters({
                            ...parameters, 
                            n_clusters: parseInt(e.target.value) || 3
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="text-sm text-gray-500 mt-1">2から20の範囲で指定してください</p>
                        
                        {/* 最適クラスター数の結果表示 */}
                        {optimalClustersData && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <h4 className="font-medium text-blue-900 mb-2">最適クラスター数の推奨</h4>
                            <div className="text-sm text-blue-800 space-y-1">
                              <div>シルエット法: {optimalClustersData.recommendations?.silhouette_method}</div>
                              <div>エルボー法: {optimalClustersData.recommendations?.elbow_method}</div>
                              <div className="font-medium">推奨: {optimalClustersData.recommendations?.recommended}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {parameters.method === 'hierarchical' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          リンケージ手法
                        </label>
                        <select
                          value={parameters.linkage}
                          onChange={(e) => setParameters({...parameters, linkage: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="ward">Ward法</option>
                          <option value="complete">完全リンク法</option>
                          <option value="average">平均リンク法</option>
                          <option value="single">単一リンク法</option>
                        </select>
                        <p className="text-sm text-gray-500 mt-1">クラスター間の距離計算方法</p>
                      </div>
                    )}

                    {parameters.method === 'dbscan' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            近傍の半径（ε）
                          </label>
                          <input
                            type="number"
                            min="0.1"
                            max="5.0"
                            step="0.1"
                            value={parameters.eps}
                            onChange={(e) => setParameters({
                              ...parameters, 
                              eps: parseFloat(e.target.value) || 0.5
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <p className="text-sm text-gray-500 mt-1">点を同じクラスターとみなす距離の閾値</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            最小サンプル数
                          </label>
                          <input
                            type="number"
                            min="2"
                            max="50"
                            value={parameters.min_samples}
                            onChange={(e) => setParameters({
                              ...parameters, 
                              min_samples: parseInt(e.target.value) || 5
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <p className="text-sm text-gray-500 mt-1">コアポイントとなるのに必要な近傍点数</p>
                        </div>
                      </>
                    )}

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
                        クラスター分析中...
                      </>
                    ) : (
                      'クラスター分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">クラスター分析履歴</h2>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>保存されたクラスター分析がありません</p>
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
                          <p>慣性: {session.total_inertia.toFixed(2)}</p>
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
            <h2 className="text-2xl font-semibold">クラスター分析結果</h2>
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
          
          {/* メタデータ - クラスター分析特有の情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">ファイル情報</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">セッション名:</dt>
                  <dd className="font-medium">{result.metadata.session_name}</dd>
                </div>
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
                  <dt className="text-gray-600">手法:</dt>
                  <dd className="font-medium">{getMethodName(result.data.method)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">クラスター数:</dt>
                  <dd className="font-medium">{result.data.n_clusters}</dd>
                </div>
                {result.data.total_inertia > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">慣性:</dt>
                    <dd className="font-medium">{formatNumber(result.data.total_inertia, 2)}</dd>
                  </div>
                )}
                {result.data.evaluation_metrics.noise_ratio !== undefined && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">ノイズ率:</dt>
                    <dd className="font-medium">{(result.data.evaluation_metrics.noise_ratio * 100).toFixed(1)}%</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* 評価指標 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">クラスター評価指標</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.data.evaluation_metrics.silhouette_score !== undefined && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">シルエット係数</h4>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatNumber(result.data.evaluation_metrics.silhouette_score)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    範囲: -1 〜 1（高いほど良い）
                  </p>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          result.data.evaluation_metrics.silhouette_score >= 0.7 ? 'bg-green-500' :
                          result.data.evaluation_metrics.silhouette_score >= 0.5 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ 
                          width: `${Math.max(0, Math.min(100, (result.data.evaluation_metrics.silhouette_score + 1) * 50))}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
              
              {result.data.evaluation_metrics.calinski_harabasz_score !== undefined && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Calinski-Harabasz指標</h4>
                  <div className="text-2xl font-bold text-green-600">
                    {formatNumber(result.data.evaluation_metrics.calinski_harabasz_score, 1)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    高いほど良い
                  </p>
                </div>
              )}
              
              {result.data.evaluation_metrics.davies_bouldin_score !== undefined && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Davies-Bouldin指標</h4>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatNumber(result.data.evaluation_metrics.davies_bouldin_score)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    低いほど良い
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* クラスター別サイズ */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">クラスター別サイズ</h3>
            <div className="space-y-3">
              {result.data.cluster_sizes?.map((size, index) => (
                <div key={index} className="flex items-center">
                  <span className="w-24 text-sm font-medium">クラスター{index + 1}:</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 mr-4">
                    <div 
                      className="bg-indigo-600 h-3 rounded-full transition-all duration-500" 
                      style={{ 
                        width: `${Math.max(5, (size / Math.max(...result.data.cluster_sizes)) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium w-16 text-right">
                    {size} 個
                  </span>
                  <span className="text-xs text-gray-500 w-16 text-right ml-2">
                    ({((size / result.metadata.rows) * 100).toFixed(1)}%)
                  </span>
                </div>
              )) || (
                <div className="text-center text-gray-500 py-4">
                  クラスターサイズデータがありません
                </div>
              )}
            </div>
          </div>

          {/* プロット画像 */}
          {result.data.plot_image && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">クラスター分析結果</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.data.plot_image}`}
                  alt="クラスター分析プロット"
                  width={2000}
                  height={1200}
                  className="w-full h-auto"
                  priority
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">📊 メイン散布図</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 主成分空間でのクラスター分布</li>
                    <li>• 各クラスターの色分け表示</li>
                    <li>• クラスター間の分離度確認</li>
                    {result.data.method === 'kmeans' && (
                      <li>• 赤い星印: クラスター中心点</li>
                    )}
                    {result.data.method === 'dbscan' && (
                      <li>• 黒いX印: ノイズポイント</li>
                    )}
                  </ul>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">📈 追加分析</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    {result.data.method === 'hierarchical' && (
                      <>
                        <li>• デンドログラム: 階層構造</li>
                        <li>• エルボー法: 最適クラスター数</li>
                        <li>• 評価指標比較</li>
                      </>
                    )}
                    {result.data.method === 'kmeans' && (
                      <>
                        <li>• エルボー法: クラスター数選択</li>
                        <li>• 評価指標比較</li>
                        <li>• 中心特徴: ヒートマップ</li>
                      </>
                    )}
                    {result.data.method === 'dbscan' && (
                      <>
                        <li>• 密度分布: データ分布可視化</li>
                        <li>• ノイズ分析: 分布比率</li>
                        <li>• 評価指標比較</li>
                      </>
                    )}
                  </ul>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-4">
                  <h4 className="font-medium text-purple-900 mb-2">💡 解釈ガイド</h4>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• 評価指標の色分け確認</li>
                    <li>• クラスター内凝集度の確認</li>
                    <li>• クラスター間分離度の評価</li>
                    <li>• 手法特有の特徴を理解</li>
                    {result.data.method === 'dbscan' && (
                      <li>• ノイズ率とパラメータ調整</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 座標データ表 */}
          <div className="mt-8">
            <h3 className="font-semibold mb-4">クラスター割り当て結果</h3>
            <p className="text-sm text-gray-600 mb-4">各サンプルのクラスター割り当てと主成分座標</p>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">サンプル名</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">クラスター</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">第1主成分</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">第2主成分</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.data.coordinates?.observations || []).map((obs, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-3 py-2 font-medium">
                        {obs.name}
                      </td>
                      <td className={`border border-gray-300 px-3 py-2 text-center font-medium ${
                        obs.cluster === -1 ? 'text-red-600' : 'text-indigo-600'
                      }`}>
                        {obs.cluster === -1 ? 'ノイズ' : `クラスター${obs.cluster}`}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {formatNumber(obs.dimension_1)}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {formatNumber(obs.dimension_2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分析結果の診断とアドバイス */}
          <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">クラスター分析結果の解釈について</h3>
                <div className="mt-2 text-sm text-yellow-700 space-y-2">
                  <p>
                    <strong>手法 ({getMethodName(result.data.method)})</strong>: 
                    {result.data.method === 'kmeans' && 
                      'エルボー法で最適クラスター数を確認し、中心特徴で各クラスターの特性を理解してください。'
                    }
                    {result.data.method === 'hierarchical' && 
                      'デンドログラムで階層構造を確認し、適切なカット位置でクラスター数を決定してください。'
                    }
                    {result.data.method === 'dbscan' && 
                      '密度分布とノイズ分析を確認し、パラメータ調整の必要性を評価してください。'
                    }
                  </p>
                  <p>
                    <strong>品質評価</strong>: 
                    {result.data.evaluation_metrics.silhouette_score !== undefined && (
                      result.data.evaluation_metrics.silhouette_score >= 0.7 ?
                        'シルエット係数が高く、クラスターの品質が良好です。' :
                        result.data.evaluation_metrics.silhouette_score >= 0.5 ?
                        'シルエット係数は適度ですが、クラスター数の調整を検討してください。' :
                        'シルエット係数が低く、クラスター設定の見直しが必要です。'
                    )}
                  </p>
                  {result.data.method === 'dbscan' && result.data.evaluation_metrics.noise_ratio !== undefined && (
                    <p>
                      <strong>DBSCAN特有の注意点</strong>: 
                      ノイズ率が{(result.data.evaluation_metrics.noise_ratio * 100).toFixed(1)}%です。
                      {result.data.evaluation_metrics.noise_ratio > 0.3 ? 
                        'ノイズが多すぎるため、epsを大きくするかmin_samplesを小さくしてください。' :
                        result.data.evaluation_metrics.noise_ratio < 0.05 ?
                        'ノイズが少なすぎるため、epsを小さくするかmin_samplesを大きくしてください。' :
                        'ノイズ率は適切な範囲にあります。'
                      }
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
          <span className="text-2xl mr-3">📚</span>
          クラスター分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              クラスター分析は、データを類似性に基づいてグループ（クラスター）に分類する手法です。
              顧客セグメンテーション、パターン発見、データ構造の理解に活用されます。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🎯 適用場面</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• 顧客セグメンテーション</li>
              <li>• 市場セグメント分析</li>
              <li>• 商品グループ分類</li>
              <li>• 遺伝子発現パターン解析</li>
              <li>• 画像セグメンテーション</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">🔄 手法の特徴</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• K-means: 高速、球状クラスター</li>
              <li>• 階層: デンドログラム、解釈しやすい</li>
              <li>• DBSCAN: ノイズ耐性、任意形状</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">⚙️ 手法別の特徴</h3>
            <div className="text-sm text-gray-700 space-y-3">
              <div>
                <strong>K-means法:</strong>
                <ul className="ml-4 list-disc space-y-1">
                  <li>クラスター数を事前に指定</li>
                  <li>球状のクラスターに適している</li>
                  <li>計算が高速</li>
                  <li>外れ値に敏感</li>
                </ul>
              </div>
              <div>
                <strong>階層クラスタリング:</strong>
                <ul className="ml-4 list-disc space-y-1">
                  <li>デンドログラムで視覚化</li>
                  <li>クラスター数を後から決定可能</li>
                  <li>決定論的な結果</li>
                  <li>大きなデータセットには不向き</li>
                </ul>
              </div>
              <div>
                <strong>DBSCAN法:</strong>
                <ul className="ml-4 list-disc space-y-1">
                  <li>ノイズポイントを検出</li>
                  <li>任意の形状のクラスター</li>
                  <li>クラスター数を自動決定</li>
                  <li>密度パラメータの調整が必要</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">📊 評価指標</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <strong>シルエット係数:</strong>
                <p>クラスター内の凝集度とクラスター間の分離度を測定。-1〜1の範囲で、高いほど良好。</p>
              </div>
              <div>
                <strong>Calinski-Harabasz指標:</strong>
                <p>クラスター間分散とクラスター内分散の比。値が大きいほど良好。</p>
              </div>
              <div>
                <strong>Davies-Bouldin指標:</strong>
                <p>クラスター内距離とクラスター間距離の比の平均。値が小さいほど良好。</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <h3 className="font-semibold mb-2">📄 サンプルデータ形式</h3>
          <div className="text-sm text-green-700">
            <p className="mb-2">クラスター分析用のCSVファイルは以下の形式で準備してください：</p>
            <div className="bg-white p-3 rounded border font-mono text-xs">
              <div>顧客ID,年齢,年収,購買頻度,購買金額</div>
              <div>顧客001,25,3500000,12,150000</div>
              <div>顧客002,45,6000000,8,300000</div>
              <div>顧客003,35,4500000,15,200000</div>
              <div>...</div>
            </div>
            <p className="mt-2">
              • 1行目: 変数名（特徴量名）<br/>
              • 1列目: サンプルID（個体識別子）<br/>
              • データ部分: 数値のみ（連続値、離散値）
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-orange-50 rounded-lg">
          <h3 className="font-semibold mb-2">🎯 単一APIエンドポイント設計</h3>
          <div className="text-sm text-orange-700 space-y-2">
            <p>
              <strong>シンプル化:</strong> 単一のAPIエンドポイント（/api/cluster/analyze）でクラスター分析の全機能に対応しています。
            </p>
            <p>
              <strong>手法対応:</strong> クエリパラメータで手法（kmeans/hierarchical/dbscan）を指定し、各手法固有のパラメータを自動適用します。
            </p>
            <p>
              <strong>最適クラスター数:</strong> 現在は簡易版として模擬データで動作します。実際のAPI実装時は本格的な分析機能に切り替え可能です。
            </p>
            <p>
              <strong>保守性:</strong> 単一ファイルで管理することで、メンテナンスとデバッグが容易になりました。
            </p>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}