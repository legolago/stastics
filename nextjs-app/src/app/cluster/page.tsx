//src/app/cluster/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';
import { 
  AnalysisSession, 
  ClusterAnalysisResult, 
  ClusterParams,
  SessionDetailResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
  ClusterAssignment,
  ClusterStatistics
} from '../../types/analysis';

// レスポンス型の統合
type ClusterApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function ClusterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<ClusterParams>({
    method: 'kmeans',
    n_clusters: 3,
    linkage_method: 'ward',
    distance_metric: 'euclidean',
    standardize: true,
    max_clusters: 10
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClusterAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // セッション履歴を取得
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      const params = new URLSearchParams({
        userId: 'default',
        limit: '50',
        offset: '0',
        analysis_type: 'cluster' // 明示的にクラスター分析指定
      });

      console.log('🔍 Cluster sessions request:', `/api/sessions?${params.toString()}`);
      
      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();
      
      console.log('📊 API Response:', data);

      if (data.success) {
        // 強制的な二重フィルタリング
        const allSessions: AnalysisSession[] = data.data || [];
        const clusterSessionsOnly = allSessions.filter((session: AnalysisSession) => {
          const sessionType = session.analysis_type;
          const isCluster = sessionType === 'cluster';
          
          if (!isCluster) {
            console.warn(`⚠️ Non-Cluster session found: ${session.session_id} (type: ${sessionType})`);
          }
          
          return isCluster;
        });
        
        console.log(`✅ Filtered sessions: ${allSessions.length} → ${clusterSessionsOnly.length} (Cluster only)`);
        
        // デバッグ: 分析タイプ別カウント
        const typeCounts: Record<string, number> = {};
        allSessions.forEach((session: AnalysisSession) => {
          const type = session.analysis_type || 'undefined';
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        console.log('📈 Session types found:', typeCounts);
        
        setSessions(clusterSessionsOnly);
      } else {
        console.error('❌ API Error:', data);
        setError(data.error || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('❌ Fetch Error:', error);
      setError(error instanceof Error ? error.message : 'データ取得中にエラーが発生しました');
    } finally {
      setSessionsLoading(false);
    }
  };

  // 特定のセッションの詳細を取得
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      console.log('Fetching Cluster session details for:', sessionId);
      
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        console.error(`HTTP ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        alert('セッション詳細の取得に失敗しました');
        return;
      }

      const data: SessionDetailResponse = await response.json();
      console.log('Received Cluster session data:', data);

      if (data.success && data.data) {
        const pythonResponse = data.data;
        
        // クラスター分析結果への型安全な変換処理
        const analysisResult: ClusterAnalysisResult = {
          success: true,
          session_id: pythonResponse.session_info?.session_id || sessionId,
          session_name: pythonResponse.session_info?.session_name || '',
          analysis_type: 'cluster',
          plot_base64: pythonResponse.visualization?.plot_image || "", 
          data: {
            plot_image: pythonResponse.visualization?.plot_image || "",
            method: pythonResponse.analysis_data?.method || 'kmeans',
            n_clusters: pythonResponse.analysis_data?.n_clusters || 3,
            n_samples: pythonResponse.analysis_data?.n_samples || 0,
            n_features: pythonResponse.analysis_data?.n_features || 0,
            standardized: pythonResponse.analysis_data?.standardized || false,
            silhouette_score: pythonResponse.analysis_data?.silhouette_score || 0,
            calinski_harabasz_score: pythonResponse.analysis_data?.calinski_harabasz_score || 0,
            davies_bouldin_score: pythonResponse.analysis_data?.davies_bouldin_score || 0,
            inertia: pythonResponse.analysis_data?.inertia || 0,
            cluster_centers: pythonResponse.analysis_data?.cluster_centers || [],
            cluster_labels: pythonResponse.analysis_data?.cluster_labels || [],
            cluster_assignments: (pythonResponse.analysis_data?.cluster_assignments || []).map((a: any): ClusterAssignment => ({
              sample_name: a.sample_name || '',
              cluster_id: a.cluster_id || 0,
              cluster_label: a.cluster_label
            })),
            cluster_statistics: pythonResponse.analysis_data?.cluster_statistics || {},
            // BaseAnalysisDataとの互換性のため（オプショナル）
            n_components: pythonResponse.analysis_data?.n_clusters || 3, // クラスター数をマッピング
            eigenvalues: [] // クラスター分析では使用しない
          },
          metadata: {
            session_name: pythonResponse.session_info?.session_name || '',
            filename: pythonResponse.session_info?.filename || '',
            rows: pythonResponse.metadata?.row_count || 0,
            columns: pythonResponse.metadata?.column_count || 0,
            sample_names: (pythonResponse.analysis_data?.cluster_assignments || []).map((a: any) => a.sample_name || ''),
            cluster_names: Object.keys(pythonResponse.analysis_data?.cluster_statistics || {})
          },
          session_info: {
            session_id: pythonResponse.session_info?.session_id || sessionId,
            session_name: pythonResponse.session_info?.session_name || '',
            description: pythonResponse.session_info?.description || '',
            tags: pythonResponse.session_info?.tags || [],
            analysis_timestamp: pythonResponse.session_info?.analysis_timestamp || '',
            filename: pythonResponse.session_info?.filename || '',
            analysis_type: 'cluster',
            row_count: pythonResponse.metadata?.row_count || 0,
            column_count: pythonResponse.metadata?.column_count || 0
          }
        };

        setResult(analysisResult);
        console.log('Cluster session details loaded successfully');
        
      } else {
        console.error('Invalid response format:', data);
        alert('セッションデータの形式が不正です');
      }
    } catch (err) {
      console.error('クラスターセッション詳細取得エラー:', err);
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `cluster_analysis_${sessionId}_plot.png`;
      
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

  // クラスター分析結果CSVを生成してダウンロード
  const downloadAnalysisResultCSV = async (result: ClusterAnalysisResult) => {
    try {
      console.log('Downloading Cluster analysis CSV for session:', result.session_id);
      
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
      
      console.log('Cluster Analysis CSV download completed');
      
    } catch (err) {
      console.error('クラスター分析結果CSVダウンロードエラー:', err);
      
      // フォールバック：クライアント側で生成
      try {
        console.log('Attempting fallback Cluster CSV generation...');
        
        let csvContent = "クラスター分析結果\n";
        csvContent += `セッション名,${result.metadata?.session_name || result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.metadata?.filename || '不明'}\n`;
        csvContent += `データサイズ,${result.metadata?.rows || 0}サンプル × ${result.metadata?.columns || 0}変数\n`;
        csvContent += `クラスタリング手法,${result.data?.method || 'kmeans'}\n`;
        csvContent += `クラスター数,${result.data?.n_clusters || 0}\n`;
        csvContent += `標準化,${result.data?.standardized ? 'あり' : 'なし'}\n`;
        csvContent += `シルエットスコア,${result.data?.silhouette_score?.toFixed(4) || 0}\n`;
        csvContent += `慣性,${result.data?.inertia?.toFixed(4) || 0}\n`;
        csvContent += "\nクラスター割り当て結果\n";
        csvContent += "サンプル名,クラスターID,クラスターラベル\n";
        
        if (result.data?.cluster_assignments) {
          result.data.cluster_assignments.forEach(assignment => {
            csvContent += `${assignment.sample_name},${assignment.cluster_id},クラスター ${assignment.cluster_id + 1}\n`;
          });
        }

        // クラスター統計情報
        csvContent += "\nクラスター統計情報\n";
        if (result.data?.cluster_statistics) {
          Object.entries(result.data.cluster_statistics).forEach(([clusterName, stats]: [string, any]) => {
            csvContent += `\n${clusterName}\n`;
            csvContent += `サイズ,${stats.size || 0}\n`;
            csvContent += `メンバー,"${(stats.members || []).join(', ')}"\n`;
            
            if (stats.mean) {
              csvContent += "\n変数,平均,標準偏差,最小値,最大値\n";
              Object.keys(stats.mean).forEach(variable => {
                csvContent += `${variable},${stats.mean[variable] || 0},${stats.std?.[variable] || 0},${stats.min?.[variable] || 0},${stats.max?.[variable] || 0}\n`;
              });
            }
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
        
        console.log('Fallback Cluster CSV generation completed');
        
      } catch (fallbackError) {
        console.error('フォールバック処理でもエラー:', fallbackError);
        alert('クラスター分析結果CSVのダウンロードに失敗しました');
      }
    }
  };

  // クラスター割り当て結果のみをダウンロード
  const downloadClusterAssignments = async (sessionId: number) => {
    try {
      console.log('Downloading cluster assignments for session:', sessionId);
      
      const response = await fetch(`/api/cluster/download/${sessionId}/assignments`);
      
      if (!response.ok) {
        throw new Error('クラスター割り当て結果のダウンロードに失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `cluster_assignments_${sessionId}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Cluster assignments download completed');
      
    } catch (err) {
      console.error('クラスター割り当て結果ダウンロードエラー:', err);
      alert('クラスター割り当て結果のダウンロードに失敗しました');
    }
  };
  // result の表示部分の直前に追加
  // result の表示部分の直前に追加
    useEffect(() => {
      if (result) {
        console.log('🔄 Rendered result data:', {
          hasData: !!result.data,
          plotImage: result.data?.plot_image ? 'exists' : 'missing',
          dataKeys: result.data ? Object.keys(result.data) : [],
          metadata: result.metadata,
          sessionInfo: result.session_info
        });
      }
    }, [result]);
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

      // クエリパラメータの設定
      const params = new URLSearchParams({
        session_name: sessionName.trim(),
        description: description.trim(),
        tags: tags.trim(),
        user_id: 'default',
        method: parameters.method,
        n_clusters: parameters.n_clusters.toString(),
        linkage_method: parameters.linkage_method,
        distance_metric: parameters.distance_metric,
        standardize: parameters.standardize.toString(),
        max_clusters: parameters.max_clusters.toString()
      });

      console.log('クラスター分析を開始します...', params.toString());
      const response = await fetch(`/api/cluster/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      console.log('Cluster API Response:', response.status, responseText.substring(0, 500) + '...');

      let data: ClusterApiResponse;
      try {
        data = JSON.parse(responseText) as ClusterApiResponse;
        console.log('Parsed data:', data);
      } catch (parseError) {
        console.error('Response parsing error:', parseError);
        console.error('Full response text:', responseText);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      if (!response.ok) {
        console.error('Cluster API Error:', data);
        
        // 型ガードを使用してエラーレスポンスかチェック
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || 'クラスター分析中にエラーが発生しました';
          
          // カスタムエラーメッセージの処理
          if (errorData.detail && errorData.detail.includes('有効なデータが不足')) {
            errorMessage = 'データの形式が正しくありません。以下を確認してください：\n' +
              '• 1行目にヘッダー（列名）があること\n' +
              '• 1列目に行ラベルがあること\n' +
              '• データ部分（2行目以降、2列目以降）に数値データがあること\n' +
              '• 各変数に十分なバリエーション（分散）があること\n' +
              '• 定数列（すべて同じ値の列）がないこと';
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

      // 成功レスポンスの処理 - dataがnullの場合の対処
      if (!data) {
        console.error('Response data is null or undefined');
        console.error('Full response text:', responseText);
        throw new Error('サーバーからの応答が空です');
      }

      // successプロパティの確認
      if (typeof data === 'object' && 'success' in data) {
        if (!data.success) {
          throw new Error('error' in data ? data.error : 'クラスター分析に失敗しました');
        }
      } else {
        // FastAPIから直接ClusterAnalysisResult形式で返される場合
        console.log('Direct analysis result received:', data);
        
        // dataが直接分析結果の場合、successプロパティを追加
        if (!('success' in data)) {
          (data as any).success = true;
        }
      }

      console.log('クラスター分析が完了しました:', data);

      const debugData = {
        hasData: !!data?.data,
        plotImage: data?.data?.plot_image ? 'exists' : 'missing',
        dataKeys: data?.data ? Object.keys(data.data) : [],
        analysis_results: data?.analysis_results || null,
        visualization: data?.visualization || null
      };

      console.log('📊 Result data debug:', debugData);
      console.log('📊 Raw result structure:', JSON.stringify(data, null, 2).substring(0, 500));

setResult(data as ClusterAnalysisResult);

      // 結果の設定と履歴の更新
      setResult(data as ClusterAnalysisResult);
      fetchSessions();
      
    } catch (err) {
      console.error('Cluster Analysis error:', err);
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
      title="クラスター分析"
      description="データの類似性に基づいてサンプルをグループ化し、パターンや構造を発見します"
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
                        placeholder="例: 顧客データクラスター分析2024"
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
                        placeholder="例: 顧客分析, クラスタリング, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        クラスタリング手法
                      </label>
                      <select
                        value={parameters.method}
                        onChange={(e) => setParameters({...parameters, method: e.target.value as 'kmeans' | 'hierarchical'})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="kmeans">K-means</option>
                        <option value="hierarchical">階層クラスタリング</option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">クラスタリングアルゴリズムを選択してください</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        クラスター数
                      </label>
                      <select
                        value={parameters.n_clusters}
                        onChange={(e) => setParameters({...parameters, n_clusters: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n}>{n}クラスター</option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-500 mt-1">作成するクラスター数を選択してください</p>
                    </div>

                    {parameters.method === 'hierarchical' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            結合方法
                          </label>
                          <select
                            value={parameters.linkage_method}
                            onChange={(e) => setParameters({...parameters, linkage_method: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="ward">Ward法</option>
                            <option value="complete">完全結合法</option>
                            <option value="average">平均結合法</option>
                            <option value="single">単結合法</option>
                          </select>
                          <p className="text-sm text-gray-500 mt-1">クラスター間の距離計算方法</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            距離指標
                          </label>
                          <select
                            value={parameters.distance_metric}
                            onChange={(e) => setParameters({...parameters, distance_metric: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="euclidean">ユークリッド距離</option>
                            <option value="manhattan">マンハッタン距離</option>
                            <option value="cosine">コサイン距離</option>
                          </select>
                          <p className="text-sm text-gray-500 mt-1">データ点間の距離計算方法</p>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        最大クラスター数（エルボー法用）
                      </label>
                      <select
                        value={parameters.max_clusters}
                        onChange={(e) => setParameters({...parameters, max_clusters: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {[5, 8, 10, 15, 20].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-500 mt-1">最適クラスター数探索の上限値</p>
                    </div>

                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={parameters.standardize}
                          onChange={(e) => setParameters({...parameters, standardize: e.target.checked})}
                          className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        />
                        <span className="ml-2 text-sm text-gray-700">データを標準化する</span>
                      </label>
                      <p className="text-sm text-gray-500 mt-1">変数間のスケールの違いを調整します（推奨）</p>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m8-8V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1m8 0V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1" />
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
                            className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>分析日時: {formatDate(session.analysis_timestamp)}</p>
                        <p>データサイズ: {session.row_count} × {session.column_count}</p>
                        {session.chi2_value !== null && session.chi2_value !== undefined && (
                          <p>シルエットスコア: {session.chi2_value.toFixed(3)}</p>
                        )}
                        {session.degrees_of_freedom && (
                          <p>クラスター数: {session.degrees_of_freedom}</p>
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
                    onClick={() => downloadClusterAssignments(result.session_id)}
                    className="bg-orange-600 text-white px-3 py-1 rounded-md hover:bg-orange-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
                    </svg>
                    割り当て結果
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
          {/* ファイル情報 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">ファイル情報</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">セッション名:</dt>
                <dd className="font-medium">{result.session_name || '不明'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">ファイル名:</dt>
                <dd className="font-medium">{result.metadata?.filename || '不明'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">サンプル数:</dt>
                <dd className="font-medium">{result.data?.n_samples || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">変数数:</dt>
                <dd className="font-medium">{result.data?.n_features || 0}</dd>
              </div>
            </dl>
          </div>

            <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">分析設定</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">手法:</dt>
                <dd className="font-medium">
                  {result.data?.method === 'kmeans' ? 'K-means' : '階層クラスタリング'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">クラスター数:</dt>
                <dd className="font-medium">{result.data?.n_clusters || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">標準化:</dt>
                <dd className="font-medium">{result.data?.standardized ? 'あり' : 'なし'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">シルエットスコア:</dt>
                <dd className="font-medium">{result.data?.silhouette_score?.toFixed(3) || '0.000'}</dd>
              </div>
            </dl>
          </div>
          </div>

          {/* 評価指標 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">評価指標</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {result.data?.silhouette_score?.toFixed(3) || '0.000'}
                </div>
                <div className="text-sm text-blue-700 font-medium">シルエットスコア</div>
                <div className="text-xs text-blue-600 mt-1">
                  {result.data?.silhouette_score >= 0.7 ? '非常に良い' :
                  result.data?.silhouette_score >= 0.5 ? '良い' :
                  result.data?.silhouette_score >= 0.25 ? '普通' : '悪い'}
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {result.data?.calinski_harabasz_score?.toFixed(1) || '0.0'}
                </div>
                <div className="text-sm text-green-700 font-medium">Calinski-Harabasz</div>
                <div className="text-xs text-green-600 mt-1">
                  値が大きいほど良い
                </div>
              </div>

              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {result.data?.davies_bouldin_score?.toFixed(3) || '0.000'}
                </div>
                <div className="text-sm text-orange-700 font-medium">Davies-Bouldin</div>
                <div className="text-xs text-orange-600 mt-1">
                  値が小さいほど良い
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {result.data?.inertia?.toFixed(1) || '0.0'}
                </div>
                <div className="text-sm text-purple-700 font-medium">慣性（Inertia）</div>
                <div className="text-xs text-purple-600 mt-1">
                  クラスター内分散
                </div>
              </div>
            </div>
          </div>
                        
          {/* プロット画像 */}
          {result.data?.plot_image && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">クラスター分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.data.plot_image}`}
                  alt="クラスター分析プロット"
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
                    <li>• <strong>散布図:</strong> サンプルをクラスター別に色分け表示</li>
                    <li>• <strong>中心点:</strong> 各クラスターの重心位置</li>
                    <li>• <strong>エルボー法:</strong> 最適クラスター数の目安</li>
                    <li>• <strong>シルエット分析:</strong> クラスター品質の評価</li>
                  </ul>
                </div>
                
                {/* 評価指標の解釈 */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">💡 評価指標の解釈</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• シルエットスコア: {result.data.silhouette_score.toFixed(3)} ({
                      result.data.silhouette_score >= 0.7 ? '非常に良いクラスタリング' :
                      result.data.silhouette_score >= 0.5 ? '良いクラスタリング' :
                      result.data.silhouette_score >= 0.25 ? '普通のクラスタリング' : 'クラスタリング品質が低い'
                    })</li>
                    <li>• 手法: {result.data.method === 'kmeans' ? 'K-means（球状クラスター向き）' : '階層クラスタリング（任意形状対応）'}</li>
                    <li>• 標準化: {result.data.standardized ? '実施済み（推奨）' : '未実施'}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* クラスター割り当て結果とクラスター統計 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* クラスター割り当て結果 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                クラスター割り当て結果
              </h4>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2">サンプル名</th>
                      <th className="text-center p-2">クラスター</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data?.cluster_assignments?.map((assignment, index) => (
                      <tr key={index} className="hover:bg-gray-100">
                        <td className="p-2 font-medium">{assignment.sample_name}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            assignment.cluster_id === 0 ? 'bg-red-100 text-red-800' :
                            assignment.cluster_id === 1 ? 'bg-blue-100 text-blue-800' :
                            assignment.cluster_id === 2 ? 'bg-green-100 text-green-800' :
                            assignment.cluster_id === 3 ? 'bg-yellow-100 text-yellow-800' :
                            assignment.cluster_id === 4 ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            クラスター {assignment.cluster_id + 1}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!result.data?.cluster_assignments || result.data.cluster_assignments.length === 0) && (
                      <tr>
                        <td colSpan={2} className="p-4 text-center text-gray-500">
                          クラスター割り当て結果がありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* クラスター統計情報 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                クラスター統計情報
              </h4>
              <div className="max-h-64 overflow-y-auto space-y-3">
                {result.data?.cluster_statistics && Object.keys(result.data?.cluster_statistics).length > 0 ? (
                  Object.entries(result.data.cluster_statistics).map(([clusterName, stats]: [string, ClusterStatistics]) => (
                    <div key={clusterName} className="border border-gray-200 rounded p-3 bg-white">
                      <h5 className="font-medium text-gray-900 mb-2">{clusterName}</h5>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p><strong>サイズ:</strong> {stats.size}サンプル</p>
                        {stats.members && stats.members.length > 0 && (
                          <p className="truncate">
                            <strong>メンバー:</strong> {stats.members.slice(0, 3).join(', ')}
                            {stats.members.length > 3 && ` ...他${stats.members.length - 3}件`}
                          </p>
                        )}
                        {stats.mean && Object.keys(stats.mean).length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium text-gray-700">主要変数の平均:</p>
                            {Object.entries(stats.mean).slice(0, 3).map(([variable, value]) => (
                              <p key={variable} className="text-xs ml-2">
                                {variable}: {typeof value === 'number' ? value.toFixed(2) : value}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    クラスター統計情報がありません
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 詳細なクラスター統計テーブル */}
          {result.data?.cluster_statistics && Object.keys(result.data?.cluster_statistics).length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">詳細なクラスター統計</h3>
              <div className="space-y-4">
                {Object.entries(result.data?.cluster_statistics || {}).map(([clusterName, stats]: [string, ClusterStatistics]) => (
                  <div key={clusterName} className="border border-gray-200 rounded-lg">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <h4 className="font-medium text-gray-900">
                        {clusterName} ({stats?.size || 0}サンプル)
                      </h4>
                    </div>
                    
                    {stats?.mean && Object.keys(stats.mean).length > 0 && (
                      <div className="p-4">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left">変数</th>
                                <th className="px-4 py-2 text-right">平均</th>
                                <th className="px-4 py-2 text-right">標準偏差</th>
                                <th className="px-4 py-2 text-right">最小値</th>
                                <th className="px-4 py-2 text-right">最大値</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {Object.keys(stats.mean).map((variable) => (
                                <tr key={variable} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 font-medium">{variable}</td>
                                  <td className="px-4 py-2 text-right">
                                    {typeof stats?.mean[variable] === 'number' 
                                      ? stats.mean[variable].toFixed(2) 
                                      : '-'}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {stats?.std && typeof stats.std[variable] === 'number' 
                                      ? stats.std[variable].toFixed(2) 
                                      : '-'}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {stats?.min && typeof stats.min[variable] === 'number' 
                                      ? stats.min[variable].toFixed(2) 
                                      : '-'}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {stats?.max && typeof stats.max[variable] === 'number' 
                                      ? stats.max[variable].toFixed(2) 
                                      : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 分析結果の解釈とアドバイス */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
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
                    <strong>シルエットスコア ({result.data?.silhouette_score?.toFixed(3) || '0.000'})</strong>: 
                    クラスター内の結束性とクラスター間の分離性を示します。1に近いほど良好なクラスタリングです。
                  </p>
                  <p>
                    <strong>Calinski-Harabasz指標 ({result.data?.calinski_harabasz_score?.toFixed(1) || '0.0'})</strong>: 
                    クラスター間分散とクラスター内分散の比率です。値が大きいほど良好です。
                  </p>
                  <p>
                    <strong>Davies-Bouldin指標 ({result.data?.davies_bouldin_score?.toFixed(3) || '0.000'})</strong>: 
                    クラスターの平均的な類似度を示します。0に近いほど良好なクラスタリングです。
                  </p>
                  {result.data?.silhouette_score && result.data.silhouette_score < 0.25 && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ シルエットスコアが低いため、クラスター数やパラメータの調整を検討することをお勧めします。
                    </p>
                  )}
                  {!result.data?.standardized && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ データが標準化されていません。変数間のスケールが大きく異なる場合は標準化をお勧めします。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-4 justify-center">
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
              クラスター分析は、データの類似性に基づいてサンプルを
              グループ（クラスター）に分類する手法です。
              教師なし学習の代表的な手法で、パターン発見に活用されます。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🎯 適用場面</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• 顧客セグメンテーション</li>
              <li>• 市場調査・マーケティング</li>
              <li>• 画像認識・パターン認識</li>
              <li>• 遺伝子データ分析</li>
              <li>• データマイニング</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 解釈のコツ</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• シルエットスコアで品質評価</li>
              <li>• エルボー法で最適クラスター数を決定</li>
              <li>• クラスター統計で特徴を把握</li>
              <li>• ビジネス文脈での意味づけが重要</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">📊 手法の選択について</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>K-means:</strong> 
                球状のクラスターに適し、計算が高速です。クラスター数を事前に指定する必要があります。
              </p>
              <p>
                <strong>階層クラスタリング:</strong> 
                任意の形状のクラスターに対応し、デンドログラムで構造を可視化できます。
              </p>
              <p>
                <strong>標準化:</strong> 
                変数間のスケールが異なる場合は必須です。すべての変数を平等に扱えます。
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">⚠️ 注意点</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>外れ値の影響:</strong> 
                極端な値はクラスタリング結果に大きく影響するため事前確認が重要です。
              </p>
              <p>
                <strong>クラスター数の決定:</strong> 
                エルボー法やシルエット分析を参考に、ビジネス的な意味も考慮して決定しましょう。
              </p>
              <p>
                <strong>解釈性:</strong> 
                統計的に良いクラスタリングでも、ビジネス的に意味のあるグループかを確認することが重要です。
              </p>
            </div>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}