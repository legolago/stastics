//src/app/pca/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnalysisLayout from '../../components/AnalysisLayout';
import FileUpload from '../../components/FileUpload';
import { 
  AnalysisSession, 
  PCAAnalysisResult, 
  PCAParams,
  SessionDetailResponse,
  ApiErrorResponse,
  ApiSuccessResponse
} from '../../types/analysis';


// レスポンス型の統合
type PCAApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function PCAPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [parameters, setParameters] = useState<PCAParams>({
    n_components: 2,
    standardize: true
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PCAAnalysisResult | null>(null);
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
      analysis_type: 'pca' // 明示的にPCA指定
    });

    console.log('🔍 PCA sessions request:', `/api/sessions?${params.toString()}`);
    
    const response = await fetch(`/api/sessions?${params.toString()}`);
    const data = await response.json();
    
    console.log('📊 API Response:', data);

    if (data.success) {
      // 強制的な二重フィルタリング
      const allSessions: AnalysisSession[] = data.data || [];
        const pcaSessionsOnly = allSessions.filter((session: AnalysisSession) => {
        const sessionType = session.analysis_type;
        const isPCA = sessionType === 'pca';
        
        if (!isPCA) {
          console.warn(`⚠️ Non-PCA session found: ${session.session_id} (type: ${sessionType})`);
        }
        
        return isPCA;
      });
      
      console.log(`✅ Filtered sessions: ${allSessions.length} → ${pcaSessionsOnly.length} (PCA only)`);
      
      // デバッグ: 分析タイプ別カウント
      const typeCounts: Record<string, number> = {};
      allSessions.forEach((session: AnalysisSession) => {
        const type = session.analysis_type || 'undefined';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      console.log('📈 Session types found:', typeCounts);
      
      setSessions(pcaSessionsOnly);
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
  // APIレスポンス構造をデバッグする関数
  const debugApiResponse = (data: any, level = 0) => {
    const indent = '  '.repeat(level);
    console.log(`${indent}🔍 Response structure analysis:`);
    
    if (typeof data !== 'object' || data === null) {
      console.log(`${indent}Type: ${typeof data}, Value: ${data}`);
      return;
    }
    
    if (Array.isArray(data)) {
      console.log(`${indent}Array with ${data.length} items`);
      if (data.length > 0) {
        console.log(`${indent}First item structure:`);
        debugApiResponse(data[0], level + 1);
      }
      return;
    }
    
    console.log(`${indent}Object keys: [${Object.keys(data).join(', ')}]`);
    
    // 重要なキーを個別にチェック
    const importantKeys = [
      'analysis_data', 'pca_coordinates', 'coordinates', 
      'scores', 'loadings', 'visualization', 'plot_image'
    ];
    importantKeys.forEach(key => {
      if (data.hasOwnProperty(key)) {
        console.log(`${indent}📋 ${key}:`);
        if (key === 'scores' || key === 'loadings') {
          if (Array.isArray(data[key])) {
            console.log(`${indent}  Array with ${data[key].length} items`);
            if (data[key].length > 0) {
              console.log(`${indent}  Sample item:`, JSON.stringify(data[key][0], null, 2));
            }
          } else {
            console.log(`${indent}  Type: ${typeof data[key]}`);
          }
        } else if (level < 2) {
          debugApiResponse(data[key], level + 1);
        }
      }
    });
  };

// 修正版 fetchSessionDetail 関数
  const fetchSessionDetail = async (sessionId: number) => {
  try {
    console.log('🔍 PCA分析セッション詳細取得開始:', sessionId);
    
    // 新しいPCA専用エンドポイントを使用
    const response = await fetch(`/api/pca/sessions/${sessionId}`);
    
    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      alert('セッション詳細の取得に失敗しました');
      return;
    }

    const data: SessionDetailResponse = await response.json();
    console.log('📥 PCA session detail response:', data);

    if (data.success && data.data) {
      const pythonResponse = data.data;
      
      // 新しいデータ構造に対応
      let scores = [];
      let loadings = [];

      // component_scores → component_scores_data に変更
      if (pythonResponse.analysis_data?.component_scores) {
        scores = pythonResponse.analysis_data.component_scores.map((scoreData: any) => ({
          name: scoreData.name || scoreData.sample_name,
          dimension_1: scoreData.dimension_1 || scoreData.pc_1,
          dimension_2: scoreData.dimension_2 || scoreData.pc_2,
          pc1: scoreData.dimension_1 || scoreData.pc_1,
          pc2: scoreData.dimension_2 || scoreData.pc_2
        }));
      }

      // component_loadings → component_loadings_data に変更
      if (pythonResponse.analysis_data?.component_loadings) {
        loadings = pythonResponse.analysis_data.component_loadings.map((loadingData: any) => ({
          name: loadingData.name || loadingData.variable_name,
          dimension_1: loadingData.dimension_1 || loadingData.pc_1,
          dimension_2: loadingData.dimension_2 || loadingData.pc_2,
          pc1: loadingData.dimension_1 || loadingData.pc_1,
          pc2: loadingData.dimension_2 || loadingData.pc_2
        }));
      }

      // 残りの処理は同様...
      
    } else {
      console.error('Invalid response format:', data);
      alert('セッションデータの形式が不正です');
    }
  } catch (err) {
    console.error('PCAセッション詳細取得エラー:', err);
    alert('セッション詳細の取得中にエラーが発生しました');
  }
};

const downloadPCALoadings = async (sessionId: number) => {
  try {
    console.log('Downloading PCA loadings CSV for session:', sessionId);
    
    const response = await fetch(`/api/pca/download/${sessionId}/loadings`);
    if (!response.ok) {
      throw new Error('主成分負荷量CSVダウンロードに失敗しました');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const contentDisposition = response.headers.get('Content-Disposition');
    const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `pca_loadings_${sessionId}.csv`;
    
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    console.log('PCA Loadings CSV download completed');
    
  } catch (err) {
    console.error('PCA負荷量CSVダウンロードエラー:', err);
    alert('主成分負荷量CSVファイルのダウンロードに失敗しました');
  }
};

const downloadPCAScores = async (sessionId: number) => {
  try {
    console.log('Downloading PCA scores CSV for session:', sessionId);
    
    const response = await fetch(`/api/pca/download/${sessionId}/scores`);
    if (!response.ok) {
      throw new Error('主成分得点CSVダウンロードに失敗しました');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const contentDisposition = response.headers.get('Content-Disposition');
    const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `pca_scores_${sessionId}.csv`;
    
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    console.log('PCA Scores CSV download completed');
    
  } catch (err) {
    console.error('PCA得点CSVダウンロードエラー:', err);
    alert('主成分得点CSVファイルのダウンロードに失敗しました');
  }
};
// 2. CSVダウンロード関数の追加
const downloadPCADetails = async (sessionId: number) => {
  try {
    console.log('Downloading PCA details CSV for session:', sessionId);
    
    const response = await fetch(`/api/pca/download/${sessionId}/details`);
    if (!response.ok) {
      throw new Error('詳細CSVダウンロードに失敗しました');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const contentDisposition = response.headers.get('Content-Disposition');
    const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `pca_details_${sessionId}.csv`;
    
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    console.log('PCA Details CSV download completed');
    
  } catch (err) {
    console.error('PCA詳細CSVダウンロードエラー:', err);
    alert('詳細CSVファイルのダウンロードに失敗しました');
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `pca_analysis_${sessionId}_plot.png`;
      
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

  // PCA分析結果CSVを生成してダウンロード
  const downloadAnalysisResultCSV = async (result: PCAAnalysisResult) => {
    try {
      console.log('Downloading PCA analysis CSV for session:', result.session_id);
      
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
      const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `pca_analysis_results_${result.session_id}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('PCA Analysis CSV download completed');
      
    } catch (err) {
      console.error('PCA分析結果CSVダウンロードエラー:', err);
      
      // フォールバック：クライアント側で生成
      try {
        console.log('Attempting fallback PCA CSV generation...');
        
        let csvContent = "主成分分析結果\n";
        csvContent += `セッション名,${result.metadata?.session_name || result.session_name || '不明'}\n`;
        csvContent += `ファイル名,${result.metadata?.filename || '不明'}\n`;
        csvContent += `データサイズ,${result.metadata?.rows || 0}サンプル × ${result.metadata?.columns || 0}変数\n`;
        csvContent += `使用主成分数,${result.data?.n_components || 0}\n`;
        csvContent += `標準化,${result.data?.standardized ? 'あり' : 'なし'}\n`;
        csvContent += `KMO標本妥当性,${result.data?.kmo || 0}\n`;
        csvContent += `相関行列式,${result.data?.determinant || 0}\n`;
        csvContent += "\n主成分別情報\n";
        csvContent += "主成分,固有値,寄与率(%),累積寄与率(%)\n";
        
        if (result.data?.eigenvalues && result.data?.explained_variance_ratio) {
          result.data.eigenvalues.forEach((eigenvalue, index) => {
            const explained = result.data.explained_variance_ratio[index] || 0;
            const cumulative = result.data.cumulative_variance_ratio?.[index] || 0;
            csvContent += `第${index + 1}主成分,${eigenvalue},${(explained * 100).toFixed(2)},${(cumulative * 100).toFixed(2)}\n`;
          });
        }

        // 主成分得点
        csvContent += "\n主成分得点\n";
        csvContent += "サンプル名,第1主成分,第2主成分\n";
        if (result.data?.coordinates?.scores) {
          result.data.coordinates.scores.forEach(score => {
            csvContent += `${score.name},${score.dimension_1},${score.dimension_2}\n`;
          });
        }

        // 主成分負荷量
        csvContent += "\n主成分負荷量\n";
        csvContent += "変数名,第1主成分,第2主成分\n";
        if (result.data?.coordinates?.loadings) {
          result.data.coordinates.loadings.forEach(loading => {
            csvContent += `${loading.name},${loading.dimension_1},${loading.dimension_2}\n`;
          });
        }

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pca_analysis_result_${result.session_id}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log('Fallback PCA CSV generation completed');
        
      } catch (fallbackError) {
        console.error('フォールバック処理でもエラー:', fallbackError);
        alert('PCA分析結果CSVのダウンロードに失敗しました');
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
      setSessionName(`${nameWithoutExt}_主成分分析`);
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
        n_components: parameters.n_components.toString(),
        standardize: parameters.standardize.toString()
      });

      console.log('PCA分析を開始します...', params.toString());
      const response = await fetch(`/api/pca/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      console.log('PCA API Response:', response.status, responseText);

      let data: PCAApiResponse;
      try {
        data = JSON.parse(responseText) as PCAApiResponse;
      } catch (parseError) {
        console.error('Response parsing error:', parseError);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      if (!response.ok) {
        console.error('PCA API Error:', data);
        
        // 型ガードを使用してエラーレスポンスかチェック
        if ('error' in data) {
          const errorData = data as ApiErrorResponse;
          let errorMessage = errorData.error || errorData.detail || 'PCA分析中にエラーが発生しました';
          
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

      // 成功レスポンスの処理
      if (!data.success) {
        throw new Error('error' in data ? data.error : 'PCA分析に失敗しました');
      }

      console.log('PCA分析が完了しました:', data);

      // 結果の設定と履歴の更新
      setResult(data as PCAAnalysisResult);
      fetchSessions();
      
    } catch (err) {
      console.error('PCA Analysis error:', err);
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
      title="主成分分析（PCA）"
      description="多変量データの次元削減を行い、主要な成分を抽出して可視化します"
      analysisType="pca"
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
              <h2 className="text-xl font-semibold mb-4">新しい主成分分析を実行</h2>
              
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
                        placeholder="例: 顧客データPCA分析2024"
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
                        placeholder="例: 顧客分析, PCA, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900">分析パラメータ</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        主成分数
                      </label>
                      <select
                        value={parameters.n_components}
                        onChange={(e) => setParameters({...parameters, n_components: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n}>{n}成分</option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-500 mt-1">抽出する主成分数を選択してください</p>
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
                      '主成分分析を実行'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">主成分分析履歴</h2>
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
                  <p>保存された主成分分析がありません</p>
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
                        {session.chi2_value && (
                          <p>KMO値: {session.chi2_value.toFixed(3)}</p>
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
            <h2 className="text-2xl font-semibold">主成分分析結果</h2>
            <div className="flex items-center space-x-2">
              {result.session_id && (
                <>
                  <span className="text-sm text-gray-500 mr-4">
                    セッションID: {result.session_id}
                  </span>
                  {/* 元のCSVダウンロード */}
                  <button
                    onClick={() => downloadCSV(result.session_id)}
                    className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    元CSV
                  </button>
                  
                  {/* 新しいダウンロードボタン群 */}
                  <button
                    onClick={() => downloadPCADetails(result.session_id)}
                    className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    詳細結果
                  </button>
                  
                  <button
                    onClick={() => downloadPCALoadings(result.session_id)}
                    className="bg-purple-600 text-white px-3 py-1 rounded-md hover:bg-purple-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    負荷量
                  </button>
                  
                  <button
                    onClick={() => downloadPCAScores(result.session_id)}
                    className="bg-orange-600 text-white px-3 py-1 rounded-md hover:bg-orange-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    得点
                  </button>
                  
                  <button
                    onClick={() => downloadPlotImage(result.session_id)}
                    className="bg-gray-600 text-white px-3 py-1 rounded-md hover:bg-gray-700 text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    画像
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
                  <dt className="text-gray-600">サンプル数:</dt>
                  <dd className="font-medium">{result.data.n_samples}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">変数数:</dt>
                  <dd className="font-medium">{result.data.n_features}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">分析設定</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">主成分数:</dt>
                  <dd className="font-medium">{result.data.n_components}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">標準化:</dt>
                  <dd className="font-medium">{result.data.standardized ? 'あり' : 'なし'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">KMO値:</dt>
                  <dd className="font-medium">{result.data.kmo.toFixed(3)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">相関行列式:</dt>
                  <dd className="font-medium">{result.data.determinant.toFixed(6)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 寄与率 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">主成分別寄与率</h3>
            <div className="space-y-3">
              {result.data.explained_variance_ratio?.map((ratio, index) => (
                <div key={index} className="flex items-center">
                  <span className="w-20 text-sm font-medium">第{index + 1}主成分:</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 mr-4">
                    <div 
                      className="bg-indigo-600 h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${ratio * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium w-16 text-right">
                    {(ratio * 100).toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500 w-20 text-right ml-2">
                    (累積: {((result.data.cumulative_variance_ratio?.[index] || 0) * 100).toFixed(1)}%)
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
                      <th className="px-4 py-2 text-left">主成分</th>
                      <th className="px-4 py-2 text-right">固有値</th>
                      <th className="px-4 py-2 text-right">寄与率</th>
                      <th className="px-4 py-2 text-right">累積寄与率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.eigenvalues.map((eigenvalue, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">第{index + 1}主成分</td>
                        <td className="px-4 py-2 text-right">{eigenvalue.toFixed(4)}</td>
                        <td className="px-4 py-2 text-right">{((result.data.explained_variance_ratio?.[index] || 0) * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2 text-right">{((result.data.cumulative_variance_ratio?.[index] || 0) * 100).toFixed(2)}%</td>
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
              <h3 className="font-semibold mb-4">主成分分析プロット</h3>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Image
                  src={`data:image/png;base64,${result.data.plot_image}`}
                  alt="主成分分析プロット"
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
                    <li>• <strong>スコアプロット:</strong> サンプルの主成分得点</li>
                    <li>• <strong>ローディングプロット:</strong> 変数の寄与度</li>
                    <li>• 第1-2主成分で全体の{(((result.data.explained_variance_ratio?.[0] || 0) + (result.data.explained_variance_ratio?.[1] || 0)) * 100).toFixed(1)}%を説明</li>
                    <li>• 原点からの距離が大きいほど特徴的</li>
                  </ul>
                </div>
                
                {/* KMO判定 */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">💡 分析の妥当性</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• KMO値: {result.data.kmo.toFixed(3)} ({
                      result.data.kmo >= 0.9 ? '非常に良い' :
                      result.data.kmo >= 0.8 ? '良い' :
                      result.data.kmo >= 0.7 ? 'まあまあ' :
                      result.data.kmo >= 0.6 ? '平凡' : '悪い'
                    })</li>
                    <li>• 標準化: {result.data.standardized ? '実施済み' : '未実施'}</li>
                    <li>• 主成分数: {result.data.n_components}成分を抽出</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 座標データの詳細 - 改善版 */}
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 主成分得点 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                主成分得点（サンプル）
                <span className="ml-2 text-sm text-gray-500">
                  ({result.data.coordinates?.scores?.length || 0}件)
                </span>
              </h4>
              
              {/* デバッグ情報の表示（開発時のみ） */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mb-2 p-2 bg-yellow-100 rounded text-xs">
                  <p>Debug: scores array length = {result.data.coordinates?.scores?.length || 0}</p>
                  <p>Debug: first score = {JSON.stringify(result.data.coordinates?.scores?.[0])}</p>
                </div>
              )}
              
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2">サンプル名</th>
                      <th className="text-right p-2">第1主成分</th>
                      <th className="text-right p-2">第2主成分</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.coordinates?.scores && result.data.coordinates.scores.length > 0 ? (
                      result.data.coordinates.scores.map((score, index) => (
                        <tr key={index} className="hover:bg-gray-100">
                          <td className="p-2 font-medium">
                            {score.name || score.sample_name || score.label || `Sample ${index + 1}`}
                          </td>
                          <td className="p-2 text-right">
                            {typeof score.dimension_1 === 'number' ? score.dimension_1.toFixed(3) : 
                            typeof score.pc1 === 'number' ? score.pc1.toFixed(3) :
                            typeof score.x === 'number' ? score.x.toFixed(3) : '-'}
                          </td>
                          <td className="p-2 text-right">
                            {typeof score.dimension_2 === 'number' ? score.dimension_2.toFixed(3) :
                            typeof score.pc2 === 'number' ? score.pc2.toFixed(3) :
                            typeof score.y === 'number' ? score.y.toFixed(3) : '-'}
                          </td>
                        </tr>
                      ))
                    ) : result.metadata.sample_names && result.metadata.sample_names.length > 0 ? (
                      result.metadata.sample_names.map((name, index) => (
                        <tr key={`fallback-${index}`} className="hover:bg-gray-100">
                          <td className="p-2 font-medium">{name}</td>
                          <td className="p-2 text-right text-gray-400">データなし</td>
                          <td className="p-2 text-right text-gray-400">データなし</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-gray-500">
                          主成分得点データがありません
                          <br />
                          <span className="text-xs">
                            履歴から表示する場合、データが正しく保存されていない可能性があります
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 主成分負荷量 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center">
                <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                主成分負荷量（変数）
                <span className="ml-2 text-sm text-gray-500">
                  ({result.data.coordinates?.loadings?.length || 0}件)
                </span>
              </h4>
              
              {/* デバッグ情報の表示（開発時のみ） */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mb-2 p-2 bg-yellow-100 rounded text-xs">
                  <p>Debug: loadings array length = {result.data.coordinates?.loadings?.length || 0}</p>
                  <p>Debug: first loading = {JSON.stringify(result.data.coordinates?.loadings?.[0])}</p>
                </div>
              )}
              
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2">変数名</th>
                      <th className="text-right p-2">第1主成分</th>
                      <th className="text-right p-2">第2主成分</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {result.data.coordinates?.loadings && result.data.coordinates.loadings.length > 0 ? (
                      result.data.coordinates.loadings.map((loading, index) => (
                        <tr key={index} className="hover:bg-gray-100">
                          <td className="p-2 font-medium">
                            {loading.name || loading.variable_name || loading.label || `Variable ${index + 1}`}
                          </td>
                          <td className="p-2 text-right">
                            {typeof loading.dimension_1 === 'number' ? loading.dimension_1.toFixed(3) :
                            typeof loading.pc1 === 'number' ? loading.pc1.toFixed(3) :
                            typeof loading.x === 'number' ? loading.x.toFixed(3) : '-'}
                          </td>
                          <td className="p-2 text-right">
                            {typeof loading.dimension_2 === 'number' ? loading.dimension_2.toFixed(3) :
                            typeof loading.pc2 === 'number' ? loading.pc2.toFixed(3) :
                            typeof loading.y === 'number' ? loading.y.toFixed(3) : '-'}
                          </td>
                        </tr>
                      ))
                    ) : result.metadata.feature_names && result.metadata.feature_names.length > 0 ? (
                      result.metadata.feature_names.map((name, index) => (
                        <tr key={`fallback-${index}`} className="hover:bg-gray-100">
                          <td className="p-2 font-medium">{name}</td>
                          <td className="p-2 text-right text-gray-400">データなし</td>
                          <td className="p-2 text-right text-gray-400">データなし</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-gray-500">
                          主成分負荷量データがありません
                          <br />
                          <span className="text-xs">
                            履歴から表示する場合、データが正しく保存されていない可能性があります
                          </span>
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
                    <strong>第1-2主成分の累積寄与率 ({(((result.data.explained_variance_ratio?.[0] || 0) + (result.data.explained_variance_ratio?.[1] || 0)) * 100).toFixed(1)}%)</strong>: 
                    2次元プロットで説明できる情報の割合です。一般的に70%以上であれば十分な説明力があるとされます。
                  </p>
                  <p>
                    <strong>KMO標本妥当性の測度 ({result.data.kmo.toFixed(3)})</strong>: 
                    主成分分析の適用妥当性を示します。0.6以上で分析が適切とされ、0.8以上で良好とされます。
                  </p>
                  {(((result.data.explained_variance_ratio?.[0] || 0) + (result.data.explained_variance_ratio?.[1] || 0)) * 100) < 70 && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ 累積寄与率が70%未満のため、3次元以上での分析も検討することをお勧めします。
                    </p>
                  )}
                  {result.data.kmo < 0.6 && (
                    <p className="text-orange-700 font-medium">
                      ⚠️ KMO値が0.6未満のため、データの適合性を再確認することをお勧めします。
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
          主成分分析（PCA）について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📖 概要</h3>
            <p className="text-sm text-blue-800">
              主成分分析は、多変量データの次元削減手法です。
              元の変数を線形結合して新しい変数（主成分）を作り、
              データの分散を最大にする方向を見つけます。
            </p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">🔍 適用場面</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• データの可視化・要約</li>
              <li>• 次元削減・ノイズ除去</li>
              <li>• 変数間の関係性の理解</li>
              <li>• パターン認識・クラスタリング</li>
              <li>• 機械学習の前処理</li>
            </ul>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">💡 解釈のコツ</h3>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• 寄与率の高い主成分を重視</li>
              <li>• 負荷量から主成分の意味を解釈</li>
              <li>• スコアプロットでサンプルの特徴を把握</li>
              <li>• KMO値で分析の妥当性を確認</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">📊 データの準備について</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>推奨データ形式:</strong> 行（サンプル）×列（変数）の数値データ
              </p>
              <p>
                <strong>前処理:</strong> 
                スケールの異なる変数がある場合は標準化を推奨します。
              </p>
              <p>
                <strong>サンプルサイズ:</strong> 
                変数数の3-5倍以上のサンプル数が望ましいです。
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">⚠️ 注意点</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                <strong>多重共線性:</strong> 
                変数間の相関が高すぎる場合は事前に確認が必要です。
              </p>
              <p>
                <strong>外れ値:</strong> 
                極端な値は結果に大きく影響するため事前チェックが重要です。
              </p>
              <p>
                <strong>解釈性:</strong> 
                主成分は元の変数の線形結合なので、意味の解釈が必要です。
              </p>
            </div>
          </div>
        </div>
      </div>
    </AnalysisLayout>
  );
}