//src/app/cluster/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';
import { 
  AnalysisSession, 
  ClusterAnalysisResult as BaseClusterAnalysisResult, 
  ClusterParams,
  SessionDetailResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
  ClusterAssignment,
  ClusterStatistics
} from '../../types/analysis';

// レスポンス型の統合
type ClusterApiResponse = ApiSuccessResponse | ApiErrorResponse;

// 拡張されたクラスター分析結果型
interface ExtendedClusterAnalysisResult extends BaseClusterAnalysisResult {
  data: ClusterAnalysisData; // 必須プロパティとして追加
  metadata: ClusterMetadata; // 必須プロパティとして追加
  visualization?: {
    plot_image?: string;
    cluster_assignments?: ClusterAssignment[];
  };
  data_info?: {
    original_filename?: string;
    rows?: number;
    columns?: number;
  };
  analysis_results?: {
    method?: string;
    n_clusters?: number;
    silhouette_score?: number;
    calinski_harabasz_score?: number;
    davies_bouldin_score?: number;
    inertia?: number;
    cluster_statistics?: Record<string, ClusterStatistics>;
  };
}

type ClusterAnalysisResult = ExtendedClusterAnalysisResult;

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
  const [result, setResult] = useState<ExtendedClusterAnalysisResult | null>(null);
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
        analysis_type: 'cluster'
      });

      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        const allSessions: AnalysisSession[] = data.data || [];
        const clusterSessionsOnly = allSessions.filter((session: AnalysisSession) => 
          session.analysis_type === 'cluster'
        );
        setSessions(clusterSessionsOnly);
      } else {
        setError(data.error || 'データ取得に失敗しました');
      }
    } catch (error) {
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
      throw new Error('セッション詳細の取得に失敗しました');
    }

    const data: SessionDetailResponse = await response.json();
    console.log('Session detail response:', data);

    if (data.success && data.data) {
      const pythonResponse = data.data;
      
      // 画像データとクラスター割り当ての取得
      let plotImageData = '';
      let clusterAssignments = pythonResponse.visualization?.cluster_assignments || [];
      
      // 画像データの取得を試みる
      try {
        const imageResponse = await fetch(`/api/sessions/${sessionId}/image`);
        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob();
          plotImageData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(
              (reader.result as string).split(',')[1] || ''
            );
            reader.readAsDataURL(imageBlob);
          });
          console.log('✅ Plot image successfully loaded from API');
        }
      } catch (imageError) {
        console.error('Plot image fetch error:', imageError);
      }

      const analysisResult: ExtendedClusterAnalysisResult = {
        success: true,
        session_id: pythonResponse.session_info?.session_id || sessionId,
        session_name: pythonResponse.session_info?.session_name || '',
        analysis_type: 'cluster',
        plot_base64: plotImageData,
        data: {
          plot_image: plotImageData,
          method: pythonResponse.analysis_data?.method || 'kmeans',
          n_clusters: pythonResponse.analysis_data?.n_clusters || 3,
          n_samples: pythonResponse.metadata?.row_count || 0,
          n_features: pythonResponse.metadata?.column_count || 0,
          standardized: true,
          silhouette_score: pythonResponse.analysis_data?.metadata?.cluster_metrics?.silhouette_score || 0,
          calinski_harabasz_score: pythonResponse.analysis_data?.metadata?.cluster_metrics?.calinski_harabasz_score || 0,
          davies_bouldin_score: pythonResponse.analysis_data?.metadata?.cluster_metrics?.davies_bouldin_score || 0,
          inertia: pythonResponse.analysis_data?.total_inertia || 0,
          cluster_centers: pythonResponse.analysis_data?.cluster_centers || [],
          cluster_labels: pythonResponse.analysis_data?.cluster_labels || [],
          cluster_assignments: clusterAssignments,
          cluster_statistics: pythonResponse.analysis_data?.metadata?.cluster_statistics || {},
          n_components: pythonResponse.analysis_data?.n_clusters || 3,
          eigenvalues: pythonResponse.analysis_data?.eigenvalues || []
        },
        metadata: {
          filename: pythonResponse.metadata?.original_filename || '',
          session_name: pythonResponse.session_info?.session_name || '',
          rows: pythonResponse.metadata?.row_count || 0,
          columns: pythonResponse.metadata?.column_count || 0,
          sample_names: clusterAssignments.map(a => a.sample_name),
          cluster_names: Object.keys(pythonResponse.analysis_data?.metadata?.cluster_statistics || {})
        },
        data_info: {
          original_filename: pythonResponse.metadata?.original_filename || '',
          rows: pythonResponse.metadata?.row_count || 0,
          columns: pythonResponse.metadata?.column_count || 0
        },
        analysis_results: {
          method: pythonResponse.analysis_data?.method || 'kmeans',
          n_clusters: pythonResponse.analysis_data?.n_clusters || 3,
          silhouette_score: pythonResponse.analysis_data?.metadata?.cluster_metrics?.silhouette_score || 0,
          calinski_harabasz_score: pythonResponse.analysis_data?.metadata?.cluster_metrics?.calinski_harabasz_score || 0,
          davies_bouldin_score: pythonResponse.analysis_data?.metadata?.cluster_metrics?.davies_bouldin_score || 0,
          inertia: pythonResponse.analysis_data?.total_inertia || 0,
          cluster_statistics: pythonResponse.analysis_data?.metadata?.cluster_statistics || {}
        },
        visualization: {
          plot_image: plotImageData,
          cluster_assignments: clusterAssignments
        }
      };

      console.log('解析結果構造:', {
        hasPlotImage: !!plotImageData,
        plotImageLength: plotImageData?.length || 0,
        hasVisualization: true,
        hasClusterAssignments: clusterAssignments.length > 0,
        clusterData: {
          assignments: clusterAssignments.length,
          statistics: Object.keys(pythonResponse.analysis_data?.metadata?.cluster_statistics || {}).length
        },
        metrics: {
          silhouette: analysisResult.data.silhouette_score,
          calinski: analysisResult.data.calinski_harabasz_score,
          davies: analysisResult.data.davies_bouldin_score,
          inertia: analysisResult.data.inertia
        }
      });

      setResult(analysisResult);
      return analysisResult;
    }
  } catch (err) {
    console.error('セッション詳細取得エラー:', err);
    alert('セッション詳細の取得中にエラーが発生しました');
    return null;
  }
};

  // その他の関数（削除、ダウンロードなど）は元のコードと同じ
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
      alert('削除中にエラーが発生しました');
    }
  };

  // CSVダウンロード関数
  const downloadCSV = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/csv`);
      if (!response.ok) throw new Error('ダウンロードに失敗しました');
      
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
      alert('CSVファイルのダウンロードに失敗しました');
    }
  };

  // プロット画像をダウンロード
  const downloadPlotImage = async (sessionId: number) => {
    try {
      console.log('Downloading plot image for session:', sessionId);
      
      // まずAPIから試す
      const response = await fetch(`/api/sessions/${sessionId}/image`);
      if (response.ok) {
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
        
        console.log('Plot image download completed from API');
        return;
      }
      
      // APIが失敗した場合、resultから直接ダウンロード
      if (result && (result.visualization?.plot_image || result.plot_base64)) {
        const imageData = result.visualization?.plot_image || result.plot_base64;
        if (imageData) {
          // Base64データをblobに変換
          const byteCharacters = atob(imageData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });
          
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cluster_analysis_${sessionId}_plot.png`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          console.log('Plot image download completed from result data');
          return;
        }
      }
      
      throw new Error('画像データが見つかりません');
      
    } catch (err) {
      console.error('画像ダウンロードエラー:', err);
      alert('プロット画像のダウンロードに失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    }
  };

  // クラスター分析結果CSVを生成してダウンロード
  const downloadAnalysisResultCSV = async (result: ExtendedClusterAnalysisResult) => {
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
        csvContent += `セッション名,${result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.data_info?.original_filename || '不明'}\n`;
        csvContent += `データサイズ,${result.data_info?.rows || 0}サンプル × ${result.data_info?.columns || 0}変数\n`;
        csvContent += `クラスタリング手法,${result.analysis_results?.method || 'kmeans'}\n`;
        csvContent += `クラスター数,${result.analysis_results?.n_clusters || 0}\n`;
        csvContent += `シルエットスコア,${result.analysis_results?.silhouette_score?.toFixed(4) || 0}\n`;
        csvContent += `慣性,${result.analysis_results?.inertia?.toFixed(4) || 0}\n`;
        csvContent += "\nクラスター割り当て結果\n";
        csvContent += "サンプル名,クラスターID,クラスターラベル\n";
        
        if (result.visualization?.cluster_assignments) {
          result.visualization.cluster_assignments.forEach(assignment => {
            csvContent += `${assignment.sample_name},${assignment.cluster_id},クラスター ${assignment.cluster_id + 1}\n`;
          });
        }

        // クラスター統計情報
        csvContent += "\nクラスター統計情報\n";
        if (result.analysis_results?.cluster_statistics) {
          Object.entries(result.analysis_results.cluster_statistics).forEach(([clusterName, stats]: [string, any]) => {
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

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
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
      const formData = new FormData();
      formData.append('file', file);

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

      const response = await fetch(`/api/cluster/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      // テスト用ログ
      console.log('🔴 TEST LOG: Response received');
      console.log('🔴 TEST LOG: Data keys:', Object.keys(data));
      
      // 完全なレスポンスをログ出力（ただし、大きすぎる場合は分割）
      console.log('📊 Complete API Response:');
      console.log('📊 - Keys:', Object.keys(data));
      console.log('📊 - Status:', data.status);
      console.log('📊 - Session ID:', data.session_id);
      console.log('📊 - Metadata:', data.metadata);
      console.log('📊 - Analysis Results Keys:', data.analysis_results ? Object.keys(data.analysis_results) : 'none');
      console.log('📊 - Data Info:', (data as any).data_info);
      
      // Visualizationの詳細チェック
      console.log('📊 Visualization Check:');
      console.log('📊 - Has visualization property:', 'visualization' in data);
      console.log('📊 - Visualization type:', typeof (data as any).visualization);
      console.log('📊 - Visualization value:', (data as any).visualization);
      
      if ((data as any).visualization) {
        console.log('📊 - Visualization keys:', Object.keys((data as any).visualization));
        const viz = (data as any).visualization;
        for (const key of Object.keys(viz)) {
          if (key === 'plot_image' && viz[key]) {
            console.log(`📊 - ${key}: [${viz[key].length} characters]`);
          } else {
            console.log(`📊 - ${key}:`, viz[key]);
          }
        }
      }
      
      // レスポンス文字列の中から"plot_image"を検索
      const responseText = JSON.stringify(data);
      const plotImageIndex = responseText.indexOf('"plot_image"');
      console.log('📊 "plot_image" found in response at index:', plotImageIndex);
      
      if (plotImageIndex > -1) {
        const snippet = responseText.substring(plotImageIndex, plotImageIndex + 200);
        console.log('📊 plot_image snippet:', snippet);
      }

      if (!response.ok) {
        throw new Error(data.error || 'クラスター分析中にエラーが発生しました');
      }

      // APIレスポンスを正しい構造に変換 - **画像データ取得の修正**
      console.log('📊 Building result object with available data...');
      
      // 画像データの取得先を明確にする
      const plotImageData = (data as any).visualization?.plot_image || "";
      console.log('🖼️ Plot image data check:', {
        hasVisualization: !!(data as any).visualization,
        hasPlotImage: !!(data as any).visualization?.plot_image,
        plotImageLength: plotImageData.length,
        plotImageSample: plotImageData.substring(0, 50)
      });

      // 型定義に合わせた正しい構造でanalysisResultを作成
      const analysisResult: ExtendedClusterAnalysisResult = {
        success: true,
        session_id: data.session_id,
        session_name: data.session_name,
        analysis_type: 'cluster',
        plot_base64: plotImageData,
        
        // data プロパティ（ClusterAnalysisData型）- 必須
        data: {
          plot_image: plotImageData,
          method: data.analysis_results?.method || 'kmeans',
          n_clusters: data.analysis_results?.n_clusters || 3,
          n_samples: data.metadata?.rows || 0,
          n_features: data.metadata?.columns || 0,
          standardized: true,
          silhouette_score: data.analysis_results?.silhouette_score || 0,
          calinski_harabasz_score: data.analysis_results?.calinski_harabasz_score || 0,
          davies_bouldin_score: data.analysis_results?.davies_bouldin_score || 0,
          inertia: data.analysis_results?.inertia || 0,
          cluster_centers: [],
          cluster_labels: [],
          cluster_assignments: (data as any).visualization?.cluster_assignments || [],
          cluster_statistics: data.analysis_results?.cluster_statistics || (data as any).visualization?.cluster_statistics || {},
          n_components: data.analysis_results?.n_clusters || 3,
          eigenvalues: []
        },
        
        // metadata プロパティ（ClusterMetadata型）- 必須
        metadata: {
          session_name: data.session_name || '',
          filename: data.metadata?.original_filename || '',
          rows: data.metadata?.rows || 0,
          columns: data.metadata?.columns || 0,
          sample_names: ((data as any).visualization?.cluster_assignments || []).map((a: any) => a.sample_name || ''),
          cluster_names: Object.keys(data.analysis_results?.cluster_statistics || (data as any).visualization?.cluster_statistics || {})
        },

        // 追加の互換性プロパティ（ExtendedClusterAnalysisResult用）
        data_info: {
          original_filename: data.metadata?.original_filename || (data as any).data_info?.original_filename || '',
          rows: data.metadata?.rows || (data as any).data_info?.rows || 0,
          columns: data.metadata?.columns || (data as any).data_info?.columns || 0
        },
        analysis_results: {
          method: data.analysis_results?.method || 'kmeans',
          n_clusters: data.analysis_results?.n_clusters || 3,
          silhouette_score: data.analysis_results?.silhouette_score || 0,
          calinski_harabasz_score: data.analysis_results?.calinski_harabasz_score || 0,
          davies_bouldin_score: data.analysis_results?.davies_bouldin_score || 0,
          inertia: data.analysis_results?.inertia || 0,
          cluster_statistics: data.analysis_results?.cluster_statistics || (data as any).visualization?.cluster_statistics || {}
        },
        visualization: {
          plot_image: plotImageData,
          cluster_assignments: (data as any).visualization?.cluster_assignments || []
        }
      };

      console.log('📊 Final result structure:', {
        hasPlotImageInResult: !!analysisResult.plot_base64,
        hasPlotImageInVisualization: !!analysisResult.visualization?.plot_image,
        hasPlotImageInData: !!analysisResult.data?.plot_image,
        plotImageLength: analysisResult.plot_base64?.length || 0,
        hasClusterAssignments: !!analysisResult.visualization?.cluster_assignments?.length,
        clusterAssignmentsCount: analysisResult.visualization?.cluster_assignments?.length || 0,
        hasClusterStatistics: !!analysisResult.analysis_results?.cluster_statistics,
        clusterStatisticsKeys: Object.keys(analysisResult.analysis_results?.cluster_statistics || {}),
        sessionId: analysisResult.session_id,
        hasDataProperty: !!analysisResult.data,
        hasMetadataProperty: !!analysisResult.metadata
      });

      setResult(analysisResult);
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

  // 画像表示のヘルパー関数
  const getImageSrc = (result: ExtendedClusterAnalysisResult) => {
    // 複数のソースから画像データを取得を試行
    const imageData = result.visualization?.plot_image || 
                     result.plot_base64 || 
                     result.data?.plot_image;
    
    if (imageData && imageData.length > 0) {
      return `data:image/png;base64,${imageData}`;
    }
    return null;
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
                    
                    {/* セッション名フィールドを追加 */}
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
                <button
                  onClick={fetchSessions}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                >
                  更新
                </button>
              </div>

              {sessionsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">読み込み中...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
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
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>分析日時: {formatDate(session.analysis_timestamp)}</p>
                        <p>データサイズ: {session.row_count} × {session.column_count}</p>
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
                  {/* 画像データがある場合のみ表示 */}
                  {getImageSrc(result) && (
                    <button
                      onClick={() => downloadPlotImage(result.session_id)}
                      className="bg-purple-600 text-white px-3 py-1 rounded-md hover:bg-purple-700 text-sm flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      プロット画像
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* メタデータ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">ファイル情報</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">セッション名:</dt>
                  <dd className="font-medium">{result.session_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">ファイル名:</dt>
                  <dd className="font-medium">{result.data_info?.original_filename || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">サンプル数:</dt>
                  <dd className="font-medium">{result.data_info?.rows || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">変数数:</dt>
                  <dd className="font-medium">{result.data_info?.columns || 0}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">分析設定</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">手法:</dt>
                  <dd className="font-medium">{result.analysis_results?.method === 'kmeans' ? 'K-means' : '階層クラスタリング'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">クラスター数:</dt>
                  <dd className="font-medium">{result.analysis_results?.n_clusters || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">シルエットスコア:</dt>
                  <dd className="font-medium">{result.analysis_results?.silhouette_score?.toFixed(3) || '0.000'}</dd>
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
                  {result.analysis_results?.silhouette_score?.toFixed(3) || '0.000'}
                </div>
                <div className="text-sm text-blue-700 font-medium">シルエットスコア</div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {result.analysis_results?.calinski_harabasz_score?.toFixed(1) || '0.0'}
                </div>
                <div className="text-sm text-green-700 font-medium">Calinski-Harabasz</div>
              </div>
              
              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {result.analysis_results?.davies_bouldin_score?.toFixed(3) || '0.000'}
                </div>
                <div className="text-sm text-orange-700 font-medium">Davies-Bouldin</div>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {result.analysis_results?.inertia?.toFixed(1) || '0.0'}
                </div>
                <div className="text-sm text-purple-700 font-medium">慣性（Inertia）</div>
              </div>
            </div>
          </div>

          {/* プロット画像 - 修正版 */}
          {(() => {
            const imageSrc = getImageSrc(result);
            if (imageSrc) {
              return (
                <div className="mb-6">
                  <h3 className="font-semibold mb-4">クラスター分析プロット</h3>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <img
                      src={imageSrc}
                      alt="クラスター分析プロット"
                      className="w-full h-auto"
                      onError={(e) => {
                        console.error('Image loading error:', e);
                        console.log('Image src:', imageSrc);
                        // エラー時の代替表示
                        e.currentTarget.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'p-8 text-center text-gray-500';
                        errorDiv.innerHTML = '画像の読み込みに失敗しました';
                        e.currentTarget.parentNode?.appendChild(errorDiv);
                      }}
                      onLoad={() => {
                        console.log('✅ Image loaded successfully');
                      }}
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
                        <li>• シルエットスコア: {result.analysis_results?.silhouette_score?.toFixed(3) || '0.000'} ({
                          (result.analysis_results?.silhouette_score || 0) >= 0.7 ? '非常に良いクラスタリング' :
                          (result.analysis_results?.silhouette_score || 0) >= 0.5 ? '良いクラスタリング' :
                          (result.analysis_results?.silhouette_score || 0) >= 0.25 ? '普通のクラスタリング' : 'クラスタリング品質が低い'
                        })</li>
                        <li>• 手法: {result.analysis_results?.method === 'kmeans' ? 'K-means（球状クラスター向き）' : '階層クラスタリング（任意形状対応）'}</li>
                      </ul>
                    </div>
                  </div>

                  {/* デバッグ情報（開発時のみ） */}
                  <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-600">
                    <details>
                      <summary className="cursor-pointer">デバッグ情報（クリックで表示）</summary>
                      <div className="mt-2">
                        <p>画像データ長: {(result.visualization?.plot_image || result.plot_base64 || result.data?.plot_image)?.length || 0} 文字</p>
                        <p>画像データプレビュー: {(result.visualization?.plot_image || result.plot_base64 || result.data?.plot_image)?.substring(0, 100)}...</p>
                        <p>セッションID: {result.session_id}</p>
                        <p>画像ソース: {imageSrc?.substring(0, 100)}...</p>
                      </div>
                    </details>
                  </div>
                </div>
              );
            } else {
              return (
                /* プロット画像が見つからない場合のメッセージ */
                <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex">
                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">プロット画像が利用できません</h3>
                      <p className="mt-1 text-sm text-yellow-700">
                        分析は正常に完了しましたが、プロット画像の生成に問題がありました。数値結果とクラスター統計は下記をご確認ください。
                      </p>
                      <div className="mt-2 text-xs text-gray-600">
                        <p>デバッグ: visualization?.plot_image = {result.visualization?.plot_image ? `あり (${result.visualization.plot_image.length}文字)` : 'なし'}</p>
                        <p>デバッグ: plot_base64 = {result.plot_base64 ? `あり (${result.plot_base64.length}文字)` : 'なし'}</p>
                        <p>デバッグ: data?.plot_image = {result.data?.plot_image ? `あり (${result.data.plot_image.length}文字)` : 'なし'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          })()}

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
                    {result.visualization?.cluster_assignments?.map((assignment: ClusterAssignment, index:number) => (
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
                    )) || []}
                    {(!result.visualization?.cluster_assignments || result.visualization.cluster_assignments.length === 0) && (
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
                {result.analysis_results?.cluster_statistics && Object.keys(result.analysis_results.cluster_statistics).length > 0 ? (
                  Object.entries(result.analysis_results.cluster_statistics).map(([clusterName, stats]) => {
                    const clusterStats = stats as ClusterStatistics;
                    return (
                      <div key={clusterName} className="border border-gray-200 rounded p-3 bg-white">
                        <h5 className="font-medium text-gray-900 mb-2">{clusterName}</h5>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p><strong>サイズ:</strong> {clusterStats.size}サンプル</p>
                          {clusterStats.members && clusterStats.members.length > 0 && (
                            <p className="truncate">
                              <strong>メンバー:</strong> {clusterStats.members.slice(0, 3).join(', ')}
                              {clusterStats.members.length > 3 && ` ...他${clusterStats.members.length - 3}件`}
                            </p>
                          )}
                          {clusterStats.mean && Object.keys(clusterStats.mean).length > 0 && (
                            <div className="mt-2">
                              <p className="font-medium text-gray-700">主要変数の平均:</p>
                              {Object.entries(clusterStats.mean).slice(0, 3).map(([variable, value]) => (
                                <p key={variable} className="text-xs ml-2">
                                  {variable}: {typeof value === 'number' ? value.toFixed(2) : value}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    クラスター統計情報がありません
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 詳細なクラスター統計テーブル */}
          {result.analysis_results?.cluster_statistics && Object.keys(result.analysis_results.cluster_statistics).length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">詳細なクラスター統計</h3>
              <div className="space-y-4">
                {Object.entries(result.analysis_results.cluster_statistics).map(([clusterName, stats]) => {
                  const clusterStats = stats as ClusterStatistics;
                  return (
                    <div key={clusterName} className="border border-gray-200 rounded-lg">
                      <div className="bg-gray-50 px-4 py-2 border-b">
                        <h4 className="font-medium text-gray-900">{clusterName} ({clusterStats.size}サンプル)</h4>
                      </div>
                      
                      {clusterStats.mean && Object.keys(clusterStats.mean).length > 0 && (
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
                                {Object.keys(clusterStats.mean).map((variable) => (
                                  <tr key={variable} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium">{variable}</td>
                                    <td className="px-4 py-2 text-right">
                                      {typeof clusterStats.mean[variable] === 'number' ? clusterStats.mean[variable].toFixed(2) : clusterStats.mean[variable]}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      {clusterStats.std && typeof clusterStats.std[variable] === 'number' ? clusterStats.std[variable].toFixed(2) : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      {clusterStats.min && typeof clusterStats.min[variable] === 'number' ? clusterStats.min[variable].toFixed(2) : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      {clusterStats.max && typeof clusterStats.max[variable] === 'number' ? clusterStats.max[variable].toFixed(2) : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          
                          {clusterStats.members && clusterStats.members.length > 0 && (
                            <div className="mt-4 p-3 bg-gray-50 rounded">
                              <h5 className="font-medium text-gray-900 mb-2">メンバー一覧:</h5>
                              <div className="text-sm text-gray-600 flex flex-wrap gap-1">
                                {clusterStats.members.map((member: string, index: number) => (
                                  <span key={index} className="bg-white px-2 py-1 rounded border text-xs">
                                    {member}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                    <strong>シルエットスコア ({result.analysis_results?.silhouette_score?.toFixed(3) || '0.000'})</strong>: 
                    クラスター内の結束性とクラスター間の分離性を示します。1に近いほど良好なクラスタリングです。
                  </p>
                  <p>
                    <strong>Calinski-Harabasz指標 ({result.analysis_results?.calinski_harabasz_score?.toFixed(1) || '0.0'})</strong>: 
                    クラスター間分散とクラスター内分散の比率です。値が大きいほど良好です。
                  </p>
                  <p>
                    <strong>Davies-Bouldin指標 ({result.analysis_results?.davies_bouldin_score?.toFixed(3) || '0.000'})</strong>: 
                    クラスターの平均的な類似度を示します。0に近いほど良好なクラスタリングです。
                  </p>
                  {(result.analysis_results?.silhouette_score || 0) < 0.25 && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ シルエットスコアが低いため、クラスター数やパラメータの調整を検討することをお勧めします。
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