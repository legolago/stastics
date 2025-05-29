'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface AnalysisResult {
  success: boolean;
  session_id: number;
  data: {
    total_inertia: number;
    chi2: number;
    eigenvalues: number[];
    explained_inertia: number[];
    cumulative_inertia: number[];
    degrees_of_freedom: number;
    plot_image: string;
  };
  metadata: {
    session_name: string;
    filename: string;
    rows: number;
    columns: number;
    row_names: string[];
    column_names: string[];
  };
}

interface AnalysisSession {
  session_id: number;
  session_name: string;
  filename: string;
  description?: string;
  tags: string[];
  analysis_timestamp: string;
  total_inertia?: number;
  dimension_1_contribution?: number;
  dimension_2_contribution?: number;
  row_count: number;
  column_count: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<AnalysisResult | null>(null);

  // セッション履歴を取得
  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const params = new URLSearchParams({
        userId: 'default',
        limit: '50',
        offset: '0'
      });
      
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setSessions(data.data);
      } else {
        console.error('セッション取得エラー:', data.error);
      }
    } catch (err) {
      console.error('セッション取得エラー:', err);
    } finally {
      setSessionsLoading(false);
    }
  };

  // 特定のセッションの詳細を取得
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        // データ構造を変換してAnalysisResult形式に合わせる
        const convertedResult: AnalysisResult = {
          success: true,
          session_id: data.session_info.session_id,
          data: {
            total_inertia: data.analysis_data.total_inertia || 0,
            chi2: data.analysis_data.chi2 || 0,
            eigenvalues: data.analysis_data.eigenvalues.map((e: any) => e.eigenvalue),
            explained_inertia: data.analysis_data.eigenvalues.map((e: any) => e.explained_inertia),
            cumulative_inertia: data.analysis_data.eigenvalues.map((e: any) => e.cumulative_inertia),
            degrees_of_freedom: data.analysis_data.degrees_of_freedom || 0,
            plot_image: data.visualization.plot_image || ''
          },
          metadata: {
            session_name: data.session_info.session_name,
            filename: data.session_info.filename,
            rows: data.metadata.row_count || 0,
            columns: data.metadata.column_count || 0,
            row_names: data.analysis_data.coordinates.rows.map((r: any) => r.name),
            column_names: data.analysis_data.coordinates.columns.map((c: any) => c.name)
          }
        };
        
        setSelectedSession(convertedResult);
        setResult(convertedResult);
      }
    } catch (err) {
      console.error('セッション詳細取得エラー:', err);
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
        fetchSessions(); // 一覧を再取得
        if (selectedSession?.session_id === sessionId) {
          setSelectedSession(null);
          setResult(null);
        }
      }
    } catch (err) {
      console.error('セッション削除エラー:', err);
    }
  };

  // CSVファイルをダウンロード
  const downloadCSV = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/csv`);
      if (!response.ok) throw new Error('ダウンロードに失敗しました');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Content-Dispositionヘッダーからファイル名を取得
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `analysis_${sessionId}.csv`;
      
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
      if (!response.ok) throw new Error('ダウンロードに失敗しました');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis_${sessionId}_plot.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('画像ダウンロードエラー:', err);
      alert('プロット画像のダウンロードに失敗しました');
    }
  };

  // 分析結果CSVを生成してダウンロード
  const downloadAnalysisResultCSV = async (result: AnalysisResult) => {
    try {
      // セッションの詳細データを取得して座標情報を含める
      const response = await fetch(`/api/sessions/${result.session_id}`);
      const detailData = await response.json();
      
      if (!detailData.success) {
        throw new Error('詳細データの取得に失敗しました');
      }

      // 分析結果をCSV形式で生成
      let csvContent = "分析結果サマリー\n";
      csvContent += `セッション名,${result.metadata.session_name}\n`;
      csvContent += `ファイル名,${result.metadata.filename}\n`;
      csvContent += `データサイズ,${result.metadata.rows}行 × ${result.metadata.columns}列\n`;
      csvContent += `総慣性,${result.data.total_inertia}\n`;
      csvContent += `カイ二乗値,${result.data.chi2}\n`;
      csvContent += `自由度,${result.data.degrees_of_freedom}\n`;
      csvContent += "\n次元別情報\n";
      csvContent += "次元,固有値,寄与率(%),累積寄与率(%)\n";
      
      result.data.eigenvalues.forEach((eigenvalue, index) => {
        csvContent += `第${index + 1}次元,${eigenvalue},${(result.data.explained_inertia[index] * 100).toFixed(2)},${(result.data.cumulative_inertia[index] * 100).toFixed(2)}\n`;
      });

      // 行座標（イメージ）を追加
      csvContent += "\n行座標（イメージ）\n";
      csvContent += "項目名,第1次元,第2次元\n";
      if (detailData.analysis_data.coordinates.rows) {
        detailData.analysis_data.coordinates.rows.forEach((row: any) => {
          csvContent += `${row.name},${row.dimension_1},${row.dimension_2}\n`;
        });
      }

      // 列座標（ブランド）を追加
      csvContent += "\n列座標（ブランド）\n";
      csvContent += "項目名,第1次元,第2次元\n";
      if (detailData.analysis_data.coordinates.columns) {
        detailData.analysis_data.coordinates.columns.forEach((col: any) => {
          csvContent += `${col.name},${col.dimension_1},${col.dimension_2}\n`;
        });
      }

      // BOMを追加（Excelでの文字化け対策）
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis_result_${result.session_id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('分析結果CSVダウンロードエラー:', err);
      alert('分析結果CSVのダウンロードに失敗しました');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionName', sessionName.trim());
      formData.append('description', description.trim());
      formData.append('tags', tags.trim());
      formData.append('userId', 'default');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'エラーが発生しました');
      }

      setResult(data);
      // 分析完了後に履歴を更新
      fetchSessions();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            コレスポンデンス分析アプリ
          </h1>
          <p className="text-lg text-gray-600">
            CSVファイルをアップロードして、コレスポンデンス分析を実行・分析結果を保存、ダウンロードできます
          </p>
        </div>

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
              // ファイルアップロードタブ
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">新しい分析を実行</h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        セッション名 *
                      </label>
                      <input
                        type="text"
                        value={sessionName}
                        onChange={(e) => setSessionName(e.target.value)}
                        placeholder="例: ファッションブランド分析2024"
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
                        placeholder="例: ファッション, ブランド, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CSVファイル *
                      </label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500
                                   file:mr-4 file:py-2 file:px-4
                                   file:rounded-full file:border-0
                                   file:text-sm file:font-semibold
                                   file:bg-indigo-50 file:text-indigo-700
                                   hover:file:bg-indigo-100"
                      />
                    </div>
                    
                    {file && (
                      <p className="text-sm text-gray-600">
                        選択されたファイル: {file.name}
                      </p>
                    )}

                    <button
                      onClick={handleUpload}
                      disabled={!file || !sessionName.trim() || loading}
                      className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 
                                 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {loading ? '分析中...' : '分析を実行'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // 分析履歴タブ
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">分析履歴</h2>
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
                    <p>保存された分析がありません</p>
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
                          {session.total_inertia && (
                            <p>総慣性: {(session.total_inertia * 100).toFixed(1)}%</p>
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
              <div className="text-red-800">
                <h3 className="font-medium">エラーが発生しました</h3>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 結果表示 */}
        {result && result.success && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">分析結果</h2>
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
                      <dt>セッション名:</dt>
                      <dd>{result.metadata.session_name}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt>ファイル名:</dt>
                    <dd>{result.metadata.filename}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>行数:</dt>
                    <dd>{result.metadata.rows}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>列数:</dt>
                    <dd>{result.metadata.columns}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">分析統計</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>総慣性:</dt>
                    <dd>{result.data.total_inertia.toFixed(4)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>カイ二乗値:</dt>
                    <dd>{result.data.chi2.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>自由度:</dt>
                    <dd>{result.data.degrees_of_freedom}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* 寄与率 */}
            <div className="mb-6">
              <h3 className="font-semibold mb-2">次元別寄与率</h3>
              <div className="space-y-2">
                {result.data.explained_inertia.map((inertia, index) => (
                  <div key={index} className="flex items-center">
                    <span className="w-16 text-sm">第{index + 1}次元:</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-4">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full" 
                        style={{ width: `${inertia * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">
                      {(inertia * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* プロット画像 */}
            {result.data.plot_image && (
              <div>
                <h3 className="font-semibold mb-4">コレスポンデンス分析プロット</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Image
                    src={`data:image/png;base64,${result.data.plot_image}`}
                    alt="コレスポンデンス分析プロット"
                    width={800}
                    height={600}
                    className="w-full h-auto"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}