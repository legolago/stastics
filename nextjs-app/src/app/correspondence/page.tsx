//src/app/correspondence/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';
import { CorrespondenceAnalysisResult, 
  AnalysisSession, 
  CorrespondenceParams, 
  SessionDetailResponse, 
  CoordinatePoint,
  ApiErrorResponse,
  ApiSuccessResponse
 } from '../../types/analysis';


// レスポンス型の統合
type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function CorrespondencePage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<CorrespondenceParams>({
    n_components: 2
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CorrespondenceAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
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
        analysis_type: 'correspondence'
      });

      console.log('🔍 Correspondence sessions request:', `/api/sessions?${params.toString()}`);
      
      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();
      
      console.log('📊 API Response:', data);

      if (data.success) {
        // フィルタリング処理
        const allSessions = data.data || [];
        const correspondenceOnly = allSessions.filter((session: any) => 
          session.analysis_type === 'correspondence'
        );
        
        console.log(`✅ Filtered: ${allSessions.length} → ${correspondenceOnly.length}`);
        setSessions(correspondenceOnly);
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
        
        // 型安全な変換処理
        const analysisResult: CorrespondenceAnalysisResult = {
          success: true,
          session_id: pythonResponse.session_info?.session_id || sessionId,
          session_name: pythonResponse.session_info?.session_name || '',
          analysis_type: 'correspondence',
          plot_base64: pythonResponse.visualization?.plot_image || "", 
          data: {
            total_inertia: pythonResponse.analysis_data?.total_inertia || 0,
            chi2: pythonResponse.analysis_data?.chi2 || 0,
            degrees_of_freedom: pythonResponse.analysis_data?.degrees_of_freedom || 0,
            n_components: 2,
            eigenvalues: pythonResponse.analysis_data?.eigenvalues?.map(e => e.eigenvalue) || [],
            explained_inertia: pythonResponse.analysis_data?.eigenvalues?.map(e => e.explained_inertia) || [],
            cumulative_inertia: pythonResponse.analysis_data?.eigenvalues?.map(e => e.cumulative_inertia) || [],
            plot_image: pythonResponse.visualization?.plot_image || "",
            coordinates: {
              rows: pythonResponse.analysis_data?.coordinates?.rows || [],
              columns: pythonResponse.analysis_data?.coordinates?.columns || []
            }
          },
          metadata: {
            session_name: pythonResponse.session_info?.session_name || '',
            filename: pythonResponse.session_info?.filename || '',
            rows: pythonResponse.metadata?.row_count || 0,
            columns: pythonResponse.metadata?.column_count || 0,
            row_names: pythonResponse.analysis_data?.coordinates?.rows?.map(r => r.name) || [],
            column_names: pythonResponse.analysis_data?.coordinates?.columns?.map(c => c.name) || []
          },
          session_info: {
            session_id: pythonResponse.session_info?.session_id || sessionId,
            session_name: pythonResponse.session_info?.session_name || '',
            description: pythonResponse.session_info?.description || '',
            tags: pythonResponse.session_info?.tags || [],
            analysis_timestamp: pythonResponse.session_info?.analysis_timestamp || '',
            filename: pythonResponse.session_info?.filename || '',
            analysis_type: 'correspondence',
            row_count: pythonResponse.metadata?.row_count || 0,
            column_count: pythonResponse.metadata?.column_count || 0
          }
        };

        setResult(analysisResult);
        console.log('Session details loaded successfully');
        
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `correspondence_analysis_${sessionId}_plot.png`;
      
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
  const downloadAnalysisResultCSV = async (result: CorrespondenceAnalysisResult) => {
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `analysis_results_${result.session_id}.csv`;
      
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
        
        let csvContent = "コレスポンデンス分析結果\n";
        csvContent += `セッション名,${result.metadata?.session_name || result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.metadata?.filename || '不明'}\n`;
        csvContent += `データサイズ,${result.metadata?.rows || 0}行 × ${result.metadata?.columns || 0}列\n`;
        csvContent += `総慣性,${result.data?.total_inertia || 0}\n`;
        csvContent += `カイ二乗値,${result.data?.chi2 || 0}\n`;
        csvContent += `自由度,${result.data?.degrees_of_freedom || 0}\n`;
        csvContent += "\n次元別情報\n";
        csvContent += "次元,固有値,寄与率(%),累積寄与率(%)\n";
        
        if (result.data?.eigenvalues && result.data?.explained_inertia) {
          result.data.eigenvalues.forEach((eigenvalue, index) => {
            const explained = result.data.explained_inertia[index] || 0;
            const cumulative = result.data.cumulative_inertia?.[index] || 0;
            csvContent += `第${index + 1}次元,${eigenvalue},${(explained * 100).toFixed(2)},${(cumulative * 100).toFixed(2)}\n`;
          });
        }

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `correspondence_analysis_result_${result.session_id}.csv`;
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
      setSessionName(`${nameWithoutExt}_コレスポンデンス分析`);
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

      // データ行の検証
      for (let i = 1; i < Math.min(lines.length, 4); i++) {
        const cells = lines[i].split(',');
        if (cells.length !== headers.length) {
          throw new Error(`${i + 1}行目の列数が一致しません。期待値: ${headers.length}, 実際: ${cells.length}`);
        }
      }

      console.log('ファイル検証完了:', {
        fileName: file.name,
        rows: lines.length - 1,
        columns: headers.length - 1,
        headers: headers.slice(0, 3) // 最初の3つのヘッダーを表示
      });

      // FormDataの準備
      const formData = new FormData();
      formData.append('file', file);

      // クエリパラメータの設定（既存のroute.tsに合わせる）
      const params = new URLSearchParams({
        session_name: sessionName.trim(),
        description: description.trim(),
        tags: tags.trim(),
        user_id: 'default',
        n_components: parameters.n_components.toString()
      });

      // 正しいエンドポイントに修正（既存のroute.tsのパスに合わせる）
      console.log('分析を開始します...', params.toString());
      const response = await fetch(`/api/correspondence/analyze?${params.toString()}`, {
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
        
        // 型ガードを使用してエラーレスポンスかチェック
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || 'データの分析中にエラーが発生しました';
          
          // カスタムエラーメッセージの処理
          if (errorData.detail && errorData.detail.includes('(0, 0)')) {
            errorMessage = 'データの形式が正しくありません。以下を確認してください：\n' +
              '• 1行目にヘッダー（列名）があること\n' +
              '• 1列目に行ラベルがあること\n' +
              '• データ部分（2行目以降、2列目以降）に数値データがあること\n' +
              '• すべての数値が非負であること\n' +
              '• 各行・各列に少なくとも1つの非ゼロ値があること';
          }
          
          // hintsがある場合は追加（型安全に処理）
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
        throw new Error('error' in data ? data.error : 'データの分析に失敗しました');
      }

      console.log('分析が完了しました:', data);

      // 結果の設定と履歴の更新
      setResult(data as CorrespondenceAnalysisResult);
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

  return (
    <AnalysisLayout
      title="コレスポンデンス分析"
      description="カテゴリカルデータの関係性を可視化し、行と列の関連構造を分析します"
      analysisType="correspondence"
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
              <h2 className="text-xl font-semibold mb-4">新しいコレスポンデンス分析を実行</h2>
              
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

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        次元数
                      </label>
                      <select
                        value={parameters.n_components}
                        onChange={(e) => setParameters({...parameters, n_components: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {[2, 3, 4, 5].map(n => (
                          <option key={n} value={n}>{n}次元</option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-500 mt-1">抽出する次元数を選択してください</p>
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
                        分析中...
                      </>
                    ) : (
                      'コレスポンデンス分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">コレスポンデンス分析履歴</h2>
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
                  <p>保存されたコレスポンデンス分析がありません</p>
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
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="ml-3">
              <h3 className="font-medium text-red-800">エラーが発生しました</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 結果表示 */}
      {result && result.success && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">コレスポンデンス分析結果</h2>
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
              </dl>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">分析統計</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">総慣性:</dt>
                  <dd className="font-medium">{result.data.total_inertia.toFixed(4)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">カイ二乗値:</dt>
                  <dd className="font-medium">{result.data.chi2.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">自由度:</dt>
                  <dd className="font-medium">{result.data.degrees_of_freedom}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">抽出次元数:</dt>
                  <dd className="font-medium">{result.data.eigenvalues?.length || 0}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 寄与率 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">次元別寄与率</h3>
            <div className="space-y-3">
              {result.data.explained_inertia?.map((inertia, index) => (
                <div key={index} className="flex items-center">
                  <span className="w-20 text-sm font-medium">第{index + 1}次元:</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 mr-4">
                    <div 
                      className="bg-indigo-600 h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${inertia * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium w-16 text-right">
                    {(inertia * 100).toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500 w-20 text-right ml-2">
                    (累積: {((result.data.cumulative_inertia?.[index] || 0) * 100).toFixed(1)}%)
                  </span>
                </div>
              )) || (
                <div className="text-center text-gray-500 py-4">
                  寄与率データがありません
                </div>
              )}
            </div>
            
            {/* 寄与率の詳細表 */}
            {result.data.eigenvalues && result.data.eigenvalues.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">次元</th>
                      <th className="px-4 py-2 text-right">固有値</th>
                      <th className="px-4 py-2 text-right">寄与率</th>
                      <th className="px-4 py-2 text-right">累積寄与率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.eigenvalues.map((eigenvalue, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">第{index + 1}次元</td>
                        <td className="px-4 py-2 text-right">{eigenvalue.toFixed(4)}</td>
                        <td className="px-4 py-2 text-right">{((result.data.explained_inertia?.[index] || 0) * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2 text-right">{((result.data.cumulative_inertia?.[index] || 0) * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* プロット画像 */}
          {result.data.plot_image && (
            <div>
              <h3 className="font-semibold mb-4">コレスポンデンス分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.data.plot_image}`}
                  alt="コレスポンデンス分析プロット"
                  width={1400}
                  height={1100}
                  className="w-full h-auto"
                  priority
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* プロットの解釈ガイド */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">📊 プロットの見方</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 点が近いほど類似性が高い</li>
                    <li>• 原点からの距離が大きいほど特徴的</li>
                    <li>• 第1-2次元で全体の{(((result.data.explained_inertia?.[0] || 0) + (result.data.explained_inertia?.[1] || 0)) * 100).toFixed(1)}%を説明</li>
                  </ul>
                </div>
                
                {/* 分析のポイント */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">💡 分析のポイント</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• カイ二乗値: {result.data.chi2.toFixed(2)}</li>
                    <li>• 統計的有意性を確認してください</li>
                    <li>• 外れ値の存在に注意</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 座標データの詳細 */}
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 行座標（イメージ）*/}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                行座標（イメージ）
              </h4>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2">項目名</th>
                      <th className="text-right p-2">第1次元</th>
                      <th className="text-right p-2">第2次元</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.coordinates?.rows?.map((row: CoordinatePoint, index: number) => (
                      <tr key={index} className="hover:bg-gray-100">
                        <td className="p-2 font-medium">{row.name}</td>
                        <td className="p-2 text-right">{row.dimension_1?.toFixed(3) || '-'}</td>
                        <td className="p-2 text-right">{row.dimension_2?.toFixed(3) || '-'}</td>
                      </tr>
                    )) || []}
                    {(!result.data.coordinates?.rows || result.data.coordinates.rows.length === 0) && 
                     result.metadata.row_names?.map((name, index) => (
                      <tr key={`fallback-${index}`} className="hover:bg-gray-100">
                        <td className="p-2 font-medium">{name}</td>
                        <td className="p-2 text-right">-</td>
                        <td className="p-2 text-right">-</td>
                      </tr>
                    )) || []}
                    {(!result.data.coordinates?.rows || result.data.coordinates.rows.length === 0) && 
                     (!result.metadata.row_names || result.metadata.row_names.length === 0) && (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-gray-500">
                          座標データがありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 列座標（ブランド）*/}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center">
                <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                列座標（ブランド）
              </h4>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2">項目名</th>
                      <th className="text-right p-2">第1次元</th>
                      <th className="text-right p-2">第2次元</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.coordinates?.columns?.map((col: CoordinatePoint, index: number) => (
                      <tr key={index} className="hover:bg-gray-100">
                        <td className="p-2 font-medium">{col.name}</td>
                        <td className="p-2 text-right">{col.dimension_1?.toFixed(3) || '-'}</td>
                        <td className="p-2 text-right">{col.dimension_2?.toFixed(3) || '-'}</td>
                      </tr>
                    )) || []}
                    {(!result.data.coordinates?.columns || result.data.coordinates.columns.length === 0) && 
                     result.metadata.column_names?.map((name, index) => (
                      <tr key={`fallback-${index}`} className="hover:bg-gray-100">
                        <td className="p-2 font-medium">{name}</td>
                        <td className="p-2 text-right">-</td>
                        <td className="p-2 text-right">-</td>
                      </tr>
                    )) || []}
                    {(!result.data.coordinates?.columns || result.data.coordinates.columns.length === 0) && 
                     (!result.metadata.column_names || result.metadata.column_names.length === 0) && (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-gray-500">
                          座標データがありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                    <strong>総慣性 ({(result.data.total_inertia * 100).toFixed(1)}%)</strong>: 
                    データ全体の関連性の強さを示します。値が高いほどカテゴリ間の関連が強いことを意味します。
                  </p>
                  <p>
                    <strong>第1-2次元の累積寄与率 ({(((result.data.explained_inertia?.[0] || 0) + (result.data.explained_inertia?.[1] || 0)) * 100).toFixed(1)}%)</strong>: 
                    2次元プロットで説明できる情報の割合です。一般的に70%以上であれば十分な説明力があるとされます。
                  </p>
                  {(((result.data.explained_inertia?.[0] || 0) + (result.data.explained_inertia?.[1] || 0)) * 100) < 70 && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ 累積寄与率が70%未満のため、3次元以上での分析も検討することをお勧めします。
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
          コレスポンデンス分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              コレスポンデンス分析は、カテゴリカルデータの関係性を可視化する多変量解析手法です。
              クロス集計表の行と列の関連構造を低次元空間で表現します。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🎯 適用場面</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• ブランドイメージ分析</li>
              <li>• 顧客セグメント分析</li>
              <li>• アンケート調査の分析</li>
              <li>• マーケット・ポジショニング</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 解釈のコツ</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• 近い点は類似性が高い</li>
              <li>• 軸の意味を解釈する</li>
              <li>• 寄与率を確認する</li>
              <li>• 外れ値に注意する</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">📊 データの準備について</h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>推奨データ形式:</strong> 行（観測対象）×列（属性）のクロス集計表
            </p>
            <p>
              <strong>注意点:</strong> 
              データは非負の値である必要があります。欠損値がある場合は事前に処理してください。
            </p>
            <p>
              <strong>サンプルサイズ:</strong> 
              行・列ともに3以上のカテゴリがあることが望ましいです。
            </p>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}