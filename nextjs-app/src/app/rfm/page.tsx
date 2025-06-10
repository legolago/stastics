//src/app/rfm/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';

// RFM分析結果の型定義
interface RFMAnalysisResult {
  success: boolean;
  session_id: string | number;
  session_name: string;
  analysis_type: string;
  plot_base64: string;
  data: {
    total_customers: number;
    analysis_date: string;
    date_range: {
      start_date: string;
      end_date: string;
    };
    rfm_divisions: number;
    customer_data: RFMCustomer[];
    segment_counts: Record<string, number>;
    rfm_stats: {
      recency_stats: { min: number; max: number; mean: number; std: number };
      frequency_stats: { min: number; max: number; mean: number; std: number };
      monetary_stats: { min: number; max: number; mean: number; std: number };
    };
    segment_stats: Record<string, {
      customer_count: number;
      recency_mean: number;
      frequency_mean: number;
      monetary_mean: number;
      rfm_score_mean: number;
    }>;
    segment_definitions: Record<string, {
      description: string;
      characteristics: string[];
      action: string;
    }>;
  };
  metadata: {
    filename: string;
    encoding_used: string;
    rows: number;
    columns: number;
    analysis_period_days: number;
  };
  download_urls: Record<string, string>;
}

// RFM顧客データの型定義
interface RFMCustomer {
  customer_id: string;
  recency: number;
  frequency: number;
  monetary: number;
  rfm_score: number;
  r_score: number;
  f_score: number;
  m_score: number;
  segment: string;
}

// RFMセッションの型定義
interface RFMSession {
  session_id: number;
  session_name: string;
  filename: string;
  description: string;
  tags: string[];
  analysis_timestamp: string;
  row_count: number;
  column_count: number;
  analysis_type: string;
  total_customers?: number;
  rfm_divisions?: number;
  analysis_date?: string;
}

// RFM分析パラメータの型定義
interface RFMParams {
  customer_id_col: string;
  date_col: string;
  amount_col: string;
  rfm_divisions: number;
}

// API レスポンスの型定義
interface ApiErrorResponse {
  success: false;
  error: string;
  detail?: string;
  hints?: string[];
}

interface ApiSuccessResponse {
  success: true;
  session_id: number;
  data: any;
  metadata: any;
  download_urls: Record<string, string>;
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function RFMAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<RFMParams>({
    customer_id_col: 'customer_id',
    date_col: 'date',
    amount_col: 'amount',
    rfm_divisions: 3
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RFMAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<RFMSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // セッション履歴を取得（RFM分析のみ）
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      console.log('Fetching RFM analysis sessions...');
      
      const params = new URLSearchParams({
        userId: 'default',
        limit: '50',
        offset: '0',
        analysis_type: 'rfm'
      });

      const response = await fetch(`/api/sessions?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'セッション取得に失敗しました');
      }

      const rfmSessions = data.data
      .filter((session: any) => session.analysis_type === 'rfm')
      .map((session: any) => ({
        ...session,
        tags: session.tags || [] // タグが無い場合は空配列を設定
      }));

    console.log('🔍 RFM分析セッション一覧:', {
      totalSessions: data.data.length,
      rfmSessions: rfmSessions.length,
      rfmSessionIds: rfmSessions.map((s: any) => s.session_id)
    });

    setSessions(rfmSessions);

  } catch (error) {
    console.error('❌ セッション取得エラー:', error);
    setError(error instanceof Error ? error.message : 'セッション取得中にエラーが発生しました');
  } finally {
    setSessionsLoading(false);
  }
};

  // セッション詳細を取得
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      setError(null);
      
      const response = await fetch(`/api/rfm/sessions/${sessionId}`, {
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

      // RFM分析結果の構築
      const result: RFMAnalysisResult = {
        success: true,
        session_id: sessionId,
        session_name: data.session_name || '',
        analysis_type: 'rfm',
        plot_base64: data.plot_image || '',
        data: {
          total_customers: data.customer_count || 0,
          analysis_date: data.analysis_date || '',
          date_range: data.date_range || { start_date: '', end_date: '' },
          rfm_divisions: data.rfm_divisions || 3,
          customer_data: [],
          segment_counts: data.rfm_statistics?.segment_counts || {},
          rfm_stats: data.rfm_statistics?.rfm_stats || {
            recency_stats: { min: 0, max: 0, mean: 0, std: 0 },
            frequency_stats: { min: 0, max: 0, mean: 0, std: 0 },
            monetary_stats: { min: 0, max: 0, mean: 0, std: 0 }
          },
          segment_stats: data.rfm_statistics?.segment_stats || {},
          segment_definitions: data.rfm_statistics?.segment_definitions || {}
        },
        metadata: {
          filename: data.filename || '',
          encoding_used: '',
          rows: data.row_count || 0,
          columns: 0,
          analysis_period_days: 0
        },
        download_urls: data.download_urls || {}
      };

      setResult(result);

    } catch (error) {
      console.error('❌ RFM session detail fetch error:', error);
      setError(error instanceof Error ? error.message : 'セッション詳細の取得中にエラーが発生しました');
    }
  };

  // セッションを削除
  const deleteSession = async (sessionId: number) => {
    if (!confirm('このセッションを削除しますか？')) return;

    try {
      const response = await fetch(`/api/rfm/session/${sessionId}`, {
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
  const downloadCSV = async (sessionId: number, type: 'customers' | 'segments' = 'customers') => {
    try {
      console.log(`Downloading ${type} CSV for session:`, sessionId);
      
      const response = await fetch(`/api/rfm/download/${sessionId}/${type}`);
      if (!response.ok) {
        throw new Error('ダウンロードに失敗しました');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `rfm_${type}_${sessionId}.csv`;
      
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

  // JSONファイルをダウンロード
  const downloadJSON = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/rfm/download/${sessionId}/details`);
      if (!response.ok) {
        throw new Error('ダウンロードに失敗しました');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rfm_analysis_${sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      console.error('JSONダウンロードエラー:', err);
      alert('JSONファイルのダウンロードに失敗しました');
    }
  };

  // 初回ロード時にセッション履歴を取得
  useEffect(() => {
    fetchSessions();
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    if (!sessionName && selectedFile.name) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setSessionName(`${nameWithoutExt}_RFM分析`);
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
      
      if (lines.length < 2) {
        throw new Error('データが不足しています。ヘッダー行と最低1行のデータが必要です。');
      }

      const headers = lines[0].split(',').map(h => h.trim());
      if (headers.length < 3) {
        throw new Error('列が不足しています。顧客ID、日付、金額の3列が必要です。');
      }

      console.log('ファイル検証完了:', {
        fileName: file.name,
        rows: lines.length - 1,
        columns: headers.length,
        headers: headers.slice(0, 5)
      });

      const formData = new FormData();
      formData.append('file', file);

      const params = new URLSearchParams({
        session_name: sessionName.trim(),
        description: description.trim(),
        tags: tags.trim(),
        user_id: 'default',
        customer_id_col: parameters.customer_id_col,
        date_col: parameters.date_col,
        amount_col: parameters.amount_col,
        rfm_divisions: parameters.rfm_divisions.toString()
      });

      console.log('RFM分析を開始します...', params.toString());
      const response = await fetch(`/api/rfm/analyze?${params.toString()}`, {
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
          throw new Error(errorMessage);
        }
      }

      if (!data.success) {
        throw new Error('error' in data ? data.error : 'データの分析に失敗しました');
      }

      const successData = data as ApiSuccessResponse;
      
      const analysisResult: RFMAnalysisResult = {
        success: true,
        session_id: successData.session_id,
        session_name: sessionName,
        analysis_type: 'rfm',
        plot_base64: successData.data?.plot_image || '',
        data: {
          total_customers: successData.data?.total_customers || 0,
          analysis_date: successData.data?.analysis_date || '',
          date_range: successData.data?.date_range || { start_date: '', end_date: '' },
          rfm_divisions: successData.data?.rfm_divisions || parameters.rfm_divisions,
          customer_data: (successData.data?.customer_data || []).slice(0, 100),
          segment_counts: successData.data?.segment_counts || {},
          rfm_stats: successData.data?.rfm_stats || {
            recency_stats: { min: 0, max: 0, mean: 0, std: 0 },
            frequency_stats: { min: 0, max: 0, mean: 0, std: 0 },
            monetary_stats: { min: 0, max: 0, mean: 0, std: 0 }
          },
          segment_stats: successData.data?.segment_stats || {},
          segment_definitions: successData.data?.segment_definitions || {}
        },
        metadata: {
          filename: file.name,
          encoding_used: successData.metadata?.encoding_used || 'utf-8',
          rows: successData.metadata?.rows || 0,
          columns: successData.metadata?.columns || 0,
          analysis_period_days: successData.metadata?.analysis_period_days || 0
        },
        download_urls: successData.download_urls || {}
      };

      setResult(analysisResult);
      fetchSessions();
      
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '不明';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  const formatNumber = (num: number | undefined, decimals: number = 2) => {
    if (num === undefined || num === null) return '0.00';
    return num.toFixed(decimals);
  };

  const getSegmentColor = (segment: string) => {
    const colorMap: Record<string, string> = {
      'VIP顧客': 'bg-purple-100 text-purple-800',
      '優良顧客': 'bg-blue-100 text-blue-800',
      '新規顧客': 'bg-green-100 text-green-800',
      '要注意ヘビーユーザー': 'bg-orange-100 text-orange-800',
      '安定顧客': 'bg-cyan-100 text-cyan-800',
      '見込み顧客': 'bg-yellow-100 text-yellow-800',
      '離脱した優良顧客': 'bg-red-100 text-red-800',
      '離脱しつつある顧客': 'bg-gray-100 text-gray-800',
      '離脱顧客': 'bg-gray-200 text-gray-600'
    };
    return colorMap[segment] || 'bg-gray-100 text-gray-800';
  };

  return (
    <AnalysisLayout
      title="RFM分析"
      description="顧客をRecency（最新購入日）、Frequency（購入頻度）、Monetary（購入金額）で分析し、顧客セグメンテーションを行います"
      analysisType="rfm"
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
              <h2 className="text-xl font-semibold mb-4">新しいRFM分析を実行</h2>
              
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
                        placeholder="例: 顧客RFM分析_2024年度"
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
                        placeholder="例: 顧客分析, EC, 2024年度"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">列名設定</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        顧客ID列名
                      </label>
                      <input
                        type="text"
                        value={parameters.customer_id_col}
                        onChange={(e) => setParameters({...parameters, customer_id_col: e.target.value})}
                        placeholder="customer_id"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        日付列名
                      </label>
                      <input
                        type="text"
                        value={parameters.date_col}
                        onChange={(e) => setParameters({...parameters, date_col: e.target.value})}
                        placeholder="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        金額列名
                      </label>
                      <input
                        type="text"
                        value={parameters.amount_col}
                        onChange={(e) => setParameters({...parameters, amount_col: e.target.value})}
                        placeholder="amount"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        RFMスコア分割数
                      </label>
                      <select
                        value={parameters.rfm_divisions}
                        onChange={(e) => setParameters({...parameters, rfm_divisions: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value={3}>3分割（1-3）</option>
                        <option value={4}>4分割（1-4）</option>
                        <option value={5}>5分割（1-5）</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">各指標（R・F・M）の分割数を設定</p>
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
                        RFM分析中...
                      </>
                    ) : (
                      'RFM分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">RFM分析履歴</h2>
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
                  <p>保存されたRFM分析がありません</p>
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
                        {session.tags && Array.isArray(session.tags) ? (
                          session.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded"
                            >
                              {tag}
                            </span>
                          ))
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>分析日時: {formatDate(session.analysis_timestamp)}</p>
                        <p>データサイズ: {session.row_count} 行</p>
                        {session.total_customers && (
                          <p>顧客数: {session.total_customers}</p>
                        )}
                        {session.rfm_divisions && (
                          <p>RFM分割: {session.rfm_divisions}段階</p>
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
            <h2 className="text-2xl font-semibold">RFM分析結果</h2>
            <div className="flex items-center space-x-2">
              {result.session_id && (
                <>
                  <span className="text-sm text-gray-500 mr-4">
                    セッションID: {result.session_id}
                  </span>
                  <button
                    onClick={() => downloadCSV(Number(result.session_id), 'customers')}
                    className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    顧客CSV
                  </button>
                  <button
                    onClick={() => downloadCSV(Number(result.session_id), 'segments')}
                    className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    セグメントCSV
                  </button>
                  <button
                    onClick={() => downloadJSON(Number(result.session_id))}
                    className="bg-purple-600 text-white px-3 py-1 rounded-md hover:bg-purple-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    詳細JSON
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* 分析概要 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">📊 分析概要</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-blue-700">総顧客数:</dt>
                  <dd className="font-medium text-blue-900">{result.data.total_customers.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">RFM分割:</dt>
                  <dd className="font-medium text-blue-900">{result.data.rfm_divisions}段階</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">分析日:</dt>
                  <dd className="font-medium text-blue-900">{result.data.analysis_date || '不明'}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">📈 Recency統計</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-green-700">平均:</dt>
                  <dd className="font-medium text-green-900">{formatNumber(result.data.rfm_stats.recency_stats.mean, 1)}日</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">最小:</dt>
                  <dd className="font-medium text-green-900">{Math.round(result.data.rfm_stats.recency_stats.min)}日</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">最大:</dt>
                  <dd className="font-medium text-green-900">{Math.round(result.data.rfm_stats.recency_stats.max)}日</dd>
                </div>
              </dl>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-900 mb-2">🔄 Frequency統計</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-yellow-700">平均:</dt>
                  <dd className="font-medium text-yellow-900">{formatNumber(result.data.rfm_stats.frequency_stats.mean, 1)}回</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-yellow-700">最小:</dt>
                  <dd className="font-medium text-yellow-900">{Math.round(result.data.rfm_stats.frequency_stats.min)}回</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-yellow-700">最大:</dt>
                  <dd className="font-medium text-yellow-900">{Math.round(result.data.rfm_stats.frequency_stats.max)}回</dd>
                </div>
              </dl>
            </div>

            <div className="bg-purple-50 rounded-lg p-4">
              <h3 className="font-semibold text-purple-900 mb-2">💰 Monetary統計</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-purple-700">平均:</dt>
                  <dd className="font-medium text-purple-900">¥{result.data.rfm_stats.monetary_stats.mean.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-purple-700">最小:</dt>
                  <dd className="font-medium text-purple-900">¥{Math.round(result.data.rfm_stats.monetary_stats.min).toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-purple-700">最大:</dt>
                  <dd className="font-medium text-purple-900">¥{Math.round(result.data.rfm_stats.monetary_stats.max).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 顧客セグメント分布 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">👥 顧客セグメント分布</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(result.data.segment_counts).map(([segment, count]) => {
                const percentage = ((count / result.data.total_customers) * 100).toFixed(1);
                const definition = result.data.segment_definitions[segment];
                
                return (
                  <div key={segment} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSegmentColor(segment)}`}>
                        {segment}
                      </span>
                      <span className="text-lg font-bold text-gray-900">{count}</span>
                    </div>
                    <div className="flex items-center mb-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{percentage}%</span>
                    </div>
                    {definition && (
                      <div className="text-xs text-gray-600">
                        <p className="mb-1">{definition.description}</p>
                        <p className="text-indigo-600">💡 {definition.action}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* プロット画像 */}
          {result.plot_base64 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">📊 RFM分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.plot_base64}`}
                  alt="RFM分析プロット"
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
                    <li>• 散布図: 顧客の分布状況</li>
                    <li>• 色分け: セグメント別表示</li>
                    <li>• 軸: R（最新購入）、F（頻度）、M（金額）</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">💡 活用のポイント</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• VIP顧客: 特別サービス提供</li>
                    <li>• 離脱顧客: 復帰キャンペーン実施</li>
                    <li>• 新規顧客: 継続購入促進</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* セグメント別詳細統計 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">📈 セグメント別詳細統計</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">セグメント</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">顧客数</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">平均Recency</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">平均Frequency</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">平均Monetary</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">平均RFMスコア</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.data.segment_stats).map(([segment, stats]) => (
                    <tr key={segment} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSegmentColor(segment)}`}>
                          {segment}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center font-medium">
                        {stats.customer_count}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {formatNumber(stats.recency_mean, 1)}日
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {formatNumber(stats.frequency_mean, 1)}回
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        ¥{Math.round(stats.monetary_mean).toLocaleString()}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {formatNumber(stats.rfm_score_mean, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 顧客データサンプル */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">👤 顧客データサンプル（最初の20件）</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1 text-left">顧客ID</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Recency</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Frequency</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Monetary</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">RFMスコア</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">セグメント</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.customer_data.slice(0, 20).map((customer, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 font-medium">
                        {customer.customer_id}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        {Math.round(customer.recency)}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        {Math.round(customer.frequency)}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        ¥{Math.round(customer.monetary).toLocaleString()}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        <span className="font-medium">
                          {formatNumber(customer.rfm_score, 2)}
                        </span>
                        <br />
                        <span className="text-xs text-gray-500">
                          ({customer.r_score},{customer.f_score},{customer.m_score})
                        </span>
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        <span className={`px-1 py-0.5 rounded text-xs ${getSegmentColor(customer.segment)}`}>
                          {customer.segment}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.data.customer_data.length > 20 && (
              <p className="text-sm text-gray-500 mt-2">
                他 {result.data.customer_data.length - 20} 件の顧客データ（CSVダウンロードで全件取得可能）
              </p>
            )}
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
                <h3 className="text-sm font-medium text-yellow-800">RFM分析結果の活用について</h3>
                <div className="mt-2 text-sm text-yellow-700 space-y-2">
                  <p>
                    <strong>セグメント別アプローチ:</strong> 
                    各セグメントの特徴に応じたマーケティング施策を検討してください。
                  </p>
                  <p>
                    <strong>優先度設定:</strong> 
                    VIP顧客と離脱顧客への対応を最優先に、リソース配分を行いましょう。
                  </p>
                  <p>
                    <strong>定期的な更新:</strong> 
                    顧客の行動は変化するため、定期的にRFM分析を実行して最新の状況を把握しましょう。
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

      {/* RFM分析手法の説明 */}
      <div className="mt-12 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="text-2xl mr-3">📚</span>
          RFM分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">📖 概要</h3>
            <p className="text-sm text-green-800">
              RFM分析は、顧客を最新購入日（Recency）、購入頻度（Frequency）、購入金額（Monetary）の3つの指標で評価し、
              効果的な顧客セグメンテーションを行う手法です。
            </p>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">🎯 RFMの3つの指標</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Recency</strong>: 最後の購入からの日数</li>
              <li>• <strong>Frequency</strong>: 購入回数・頻度</li>
              <li>• <strong>Monetary</strong>: 累計購入金額</li>
              <li>• 各指標を3-5段階で評価</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💼 適用場面</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• EC・小売業の顧客管理</li>
              <li>• マーケティング施策の最適化</li>
              <li>• 顧客ロイヤリティ分析</li>
              <li>• チャーン（離脱）予測</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">📊 主要な顧客セグメント</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <div className="flex items-center">
                <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                <strong>VIP顧客:</strong> 最近購入・高頻度・高額（R:高, F:高, M:高）
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                <strong>優良顧客:</strong> 最近購入・中程度の頻度と金額
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                <strong>新規顧客:</strong> 最近購入・低頻度・低額
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                <strong>要注意ヘビーユーザー:</strong> 購入なし・高頻度・高額
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                <strong>離脱顧客:</strong> 購入なし・低頻度・低額
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">🚀 活用のメリット</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• セグメント別マーケティング戦略の策定</li>
              <li>• 限られたリソースの効率的配分</li>
              <li>• 顧客生涯価値（LTV）の最大化</li>
              <li>• 離脱リスクの早期発見</li>
              <li>• パーソナライズされた顧客体験</li>
              <li>• マーケティングROIの向上</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold mb-2">📋 データの準備について</h3>
          <div className="text-sm text-yellow-700 space-y-2">
            <p>
              <strong>必要なデータ:</strong> 顧客ID、購入日、購入金額の3列が必須です
            </p>
            <p>
              <strong>データ形式:</strong> 
              1行1取引の形式（顧客が複数回購入している場合は複数行になります）
            </p>
            <p>
              <strong>データ期間:</strong> 
              最低6ヶ月、理想的には1-2年分のデータがあると良い分析結果が得られます
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <h3 className="font-semibold mb-2">📄 サンプルデータ形式</h3>
          <div className="text-sm text-green-700">
            <p className="mb-2">RFM分析用のCSVファイルは以下の形式で準備してください：</p>
            <div className="bg-white p-3 rounded border font-mono text-xs">
              <div>customer_id,date,amount</div>
              <div>CUST001,2024-01-15,2500</div>
              <div>CUST002,2024-01-16,1200</div>
              <div>CUST001,2024-02-20,3800</div>
              <div>CUST003,2024-01-18,5500</div>
              <div>...</div>
            </div>
            <p className="mt-2">
              • customer_id: 顧客を識別するID<br/>
              • date: 購入日（YYYY-MM-DD形式推奨）<br/>
              • amount: 購入金額（数値のみ）
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold mb-2">⚙️ 分析パラメータの設定</h3>
          <div className="text-sm text-blue-700 space-y-2">
            <p>
              <strong>RFM分割数:</strong> 
              3分割（1-3）が一般的で解釈しやすく、5分割（1-5）はより細かいセグメンテーションが可能です
            </p>
            <p>
              <strong>列名の指定:</strong> 
              CSVファイルの列名が標準的でない場合は、適切な列名を指定してください
            </p>
            <p>
              <strong>基準日の設定:</strong> 
              Recency計算の基準日は、データの最新日が自動的に使用されます
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-indigo-50 rounded-lg">
          <h3 className="font-semibold mb-2">📈 結果の活用方法</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-indigo-700">
            <div>
              <h4 className="font-medium mb-1">マーケティング施策例:</h4>
              <ul className="space-y-1">
                <li>• VIP顧客: 限定商品・特別サービス</li>
                <li>• 新規顧客: ウェルカムキャンペーン</li>
                <li>• 離脱顧客: 復帰促進オファー</li>
                <li>• 要注意顧客: 再エンゲージメント</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">KPI改善への貢献:</h4>
              <ul className="space-y-1">
                <li>• 顧客生涯価値（LTV）向上</li>
                <li>• 顧客維持率（リテンション）改善</li>
                <li>• 購入頻度・単価の向上</li>
                <li>• マーケティング効率の最適化</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}