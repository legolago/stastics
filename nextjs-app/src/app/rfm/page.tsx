//src/app/rfm/page.tsx（第1回：基本構造と型定義）
'use client';

import { useState, useEffect, useMemo } from 'react';
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
  customerIdCol: string;
  dateCol: string;
  amountCol: string;
  analysisDate: string;
  rfmDivisions: number;
  useMonetary4Divisions?: boolean;
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

// RFMSessionDetail インターフェースを先に定義
interface RFMSessionDetail {
  session_id: number;
  success: boolean;
  has_data: boolean;
  customer_count: number;
  session_name: string;
  analysis_type: string;
  filename: string;
  description: string;
  analysis_date: string;
  row_count: number;
  column_count: number;
  total_customers: number;
  rfm_divisions: number;
  customer_data: RFMCustomer[];
  segment_counts: Record<string, number>;
  rfm_statistics: any;
  plot_base64: string;  // plot_image から plot_base64 に変更
  download_urls: {
    customers: string;
    segments: string;
    details: string;
  };
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export default function RFMAnalysisPage() {
  // ファイルとセッション管理の状態
  const [file, setFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  
  // 列名候補と分析パラメータの状態
  const [parameters, setParameters] = useState<RFMParams>({
    customerIdCol: 'id',
    dateCol: 'date', 
    amountCol: 'price',
    analysisDate: '',
    rfmDivisions: 3, // ✅ デフォルト値を明示的に設定
    useMonetary4Divisions: false
  });

  const updateParameter = (key: keyof RFMParams, value: string | number | boolean) => {
    setParameters(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);

  // 分析結果とUI状態の管理
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RFMAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 履歴管理の状態
  const [sessions, setSessions] = useState<RFMSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [searchQuery, setSearchQuery] = useState<string>(''); // 検索クエリの状態
  const [selectedSession, setSelectedSession] = useState<RFMSession | null>(null);
  const [sessionDetail, setSessionDetail] = useState<RFMSessionDetail | null>(null);

  // 検索結果のフィルタリング
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery.trim()) return sessions;
    
    const searchLower = searchQuery.toLowerCase();
    return sessions.filter(session => {
      return (
        session.session_name.toLowerCase().includes(searchLower) ||
        session.filename.toLowerCase().includes(searchLower) ||
        session.description?.toLowerCase().includes(searchLower) ||
        session.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    });
  }, [sessions, searchQuery]);

  // セッション履歴を取得（RFM分析のみ）
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      console.log('📋 RFM分析セッション履歴を取得中...');
      
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
      if (!data || !data.success) {
        throw new Error(data.error || 'セッション取得に失敗しました');
      }

      // RFM分析のセッションのみフィルタリング
      const rfmSessions = data.data
        .filter((session: any) => session.analysis_type === 'rfm')
        .map((session: any) => ({
          ...session,
          tags: session.tags || [] // タグが無い場合は空配列を設定
        }));

      console.log('✅ RFM分析セッション一覧取得完了:', {
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


  // セッションを削除
  const deleteSession = async (sessionId: number) => {
    if (!confirm('このセッションを削除しますか？この操作は取り消せません。')) return;

    try {
      console.log(`🗑️ RFMセッション削除開始: ${sessionId}`);
      
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ セッション削除完了');
        await fetchSessions(); // セッション一覧を更新
        
        // 現在表示中のセッションが削除された場合は結果をクリア
        if (result?.session_id === sessionId) {
          setResult(null);
        }
        
        // 成功メッセージを表示
        alert('セッションを削除しました');
      } else {
        const errorData = await response.json();
        console.error('❌ 削除エラー:', errorData);
        throw new Error(errorData.error || 'セッションの削除に失敗しました');
      }
    } catch (err) {
      console.error('❌ セッション削除エラー:', err);
      alert(err instanceof Error ? err.message : '削除中にエラーが発生しました');
    }
  };

  // CSVファイルをダウンロード
  const downloadCSV = async (sessionId: number, type: 'customers' | 'segments' = 'customers') => {
    try {
      console.log(`📥 ${type} CSV ダウンロード開始: セッション ${sessionId}`);
      
      const response = await fetch(`/api/rfm/download/${sessionId}/${type}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/csv',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ CSV ダウンロードエラー:', errorText);
        throw new Error(`ダウンロードに失敗しました: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // ファイル名を取得（Content-Dispositionヘッダーから）
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const fileName = fileNameMatch ? 
        fileNameMatch[1].replace(/['"]/g, '') : 
        `rfm_${type}_${sessionId}_${new Date().toISOString().slice(0, 10)}.csv`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log(`✅ CSV ダウンロード完了: ${fileName}`);
      
    } catch (err) {
      console.error('❌ CSVダウンロードエラー:', err);
      alert(err instanceof Error ? err.message : 'CSVファイルのダウンロードに失敗しました');
    }
  };

  // 詳細JSONファイルをダウンロード
  const downloadJSON = async (sessionId: number) => {
    try {
      console.log(`📥 詳細JSON ダウンロード開始: セッション ${sessionId}`);
      
      const response = await fetch(`/api/rfm/download/${sessionId}/details`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ JSON ダウンロードエラー:', errorText);
        throw new Error(`ダウンロードに失敗しました: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rfm_analysis_${sessionId}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('✅ JSON ダウンロード完了');
      
    } catch (err) {
      console.error('❌ JSONダウンロードエラー:', err);
      alert(err instanceof Error ? err.message : 'JSONファイルのダウンロードに失敗しました');
    }
  };

  // ファイル選択処理（列名自動検出付き）
  const handleFileSelect = async (selectedFile: File) => {
    try {
      setFile(selectedFile);
      setError(null);
      
      console.log('📁 ファイル選択:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      });
      
      // セッション名の自動設定
      if (!sessionName && selectedFile.name) {
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
        const newSessionName = `${nameWithoutExt}_RFM分析_${new Date().toISOString().slice(0, 10)}`;
        setSessionName(newSessionName);
        console.log('📝 セッション名自動設定:', newSessionName);
      }

      // CSVファイルの基本検証
      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        throw new Error('CSVファイルを選択してください');
      }

      // ファイルサイズチェック（50MB制限）
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (selectedFile.size > maxSize) {
        throw new Error('ファイルサイズが50MBを超えています。より小さなファイルを選択してください。');
      }

      // CSVファイルのヘッダーを読み取って列名を推定
      const fileContent = await selectedFile.text();
      const lines = fileContent.split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      
      if (lines.length < 2) {
        throw new Error('データが不足しています。ヘッダー行と最低1行のデータが必要です。');
      }

      // ヘッダー行を解析
      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      console.log('📋 検出された列名:', headers);
      setDetectedColumns(headers);
      
      // 列名の自動推定
      const newParams = { ...parameters };
      
      // 顧客ID列の推定
      const customerIdCandidates = ['id', 'customer_id', 'cust_id', 'user_id', '顧客ID', 'customer', 'userid'];
      const customerIdCol = headers.find(h => 
        customerIdCandidates.some(candidate => 
          h.toLowerCase().includes(candidate.toLowerCase())
        )
      );
      if (customerIdCol) {
        newParams.customerIdCol = customerIdCol;
      }
      
      // 日付列の推定
      const dateCandidates = ['date', 'order_date', 'purchase_date', 'transaction_date', '日付', '購入日', 'created_at', 'timestamp'];
      const dateCol = headers.find(h => 
        dateCandidates.some(candidate => 
          h.toLowerCase().includes(candidate.toLowerCase())
        )
      );
      if (dateCol) {
        newParams.dateCol = dateCol;
      }
      
      // 金額列の推定
      const amountCandidates = ['amount', 'price', 'total', 'value', 'cost', '金額', '価格', '合計', 'revenue', 'sales'];
      const amountCol = headers.find(h => 
        amountCandidates.some(candidate => 
          h.toLowerCase().includes(candidate.toLowerCase())
        )
      );
      if (amountCol) {
        newParams.amountCol = amountCol;
      }
      
      setParameters(newParams);
      console.log('✅ 列名推定完了:', newParams);

      // データのプレビュー表示（開発時のみ）
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 データプレビュー:', {
          totalLines: lines.length,
          headers,
          sampleData: lines.slice(1, 4).map(line => line.split(','))
        });
      }

    } catch (error) {
      console.error('❌ ファイル選択エラー:', error);
      setError(error instanceof Error ? error.message : 'ファイルの処理中にエラーが発生しました');
      setDetectedColumns([]);
    }
  };

  // 初回ロード時にセッション履歴を取得
  useEffect(() => {
    fetchSessions();
  }, []);

  // ユーティリティ関数群
  const formatDate = (dateString: string) => {
    if (!dateString) return '不明';
    try {
      return new Date(dateString).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatNumber = (num: number | undefined, decimals: number = 2) => {
    if (num === undefined || num === null || isNaN(num)) return '0.00';
    return num.toFixed(decimals);
  };

  const getSegmentColor = (segment: string) => {
    const colorMap: Record<string, string> = {
      'VIP顧客': 'bg-purple-100 text-purple-800 border-purple-200',
      '優良顧客': 'bg-blue-100 text-blue-800 border-blue-200',
      '新規顧客': 'bg-green-100 text-green-800 border-green-200',
      '要注意ヘビーユーザー': 'bg-orange-100 text-orange-800 border-orange-200',
      '安定顧客': 'bg-cyan-100 text-cyan-800 border-cyan-200',
      '見込み顧客': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      '離脱した優良顧客': 'bg-red-100 text-red-800 border-red-200',
      '離脱しつつある顧客': 'bg-gray-100 text-gray-800 border-gray-200',
      '離脱顧客': 'bg-gray-200 text-gray-600 border-gray-300'
    };
    return colorMap[segment] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // メインのアップロード処理
  // RFM分析ページの handleUpload 関数修正

  const handleUpload = async () => {
    // バリデーション
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
      console.log('📤 Sending RFM analysis request...');

      const formData = new FormData();
      formData.append('file', file);

      const queryParams = new URLSearchParams({
        session_name: sessionName,
        description: description || '',
        tags: tags || '',
        user_id: 'default',
        customerIdCol: parameters?.customerIdCol || 'id',
        dateCol: parameters?.dateCol || 'date', 
        amountcol: parameters?.amountCol || 'price',
        rfm_divisions: (parameters?.rfmDivisions ?? 3).toString(), // ✅ nullish coalescing で安全にアクセス
        ...(parameters?.analysisDate && { analysis_date: parameters.analysisDate }),
        ...(parameters?.useMonetary4Divisions && { use_monetary_4_divisions: 'true' })
      });

      console.log('📋 Query parameters:', Object.fromEntries(queryParams));

      const response = await fetch(`/api/rfm/analyze?${queryParams}`, {
        method: 'POST',
        body: formData,
      });

      console.log('📥 FastAPI Response Status:', response.status);
      console.log('📋 Response Headers:', {
        'content-length': response.headers.get('content-length'),
        'content-type': response.headers.get('content-type'),
        'date': response.headers.get('date'),
        'server': response.headers.get('server')
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ FastAPI Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const responseText = await response.text();
      console.log('📄 Response length:', responseText.length);

      let result;
      try {
        result = JSON.parse(responseText);
        console.log('✅ JSON parse successful');
      } catch (parseError) {
        console.error('❌ JSON parse failed:', parseError);
        console.log('📄 Raw response (first 500 chars):', responseText.substring(0, 500));
        throw new Error('無効なJSONレスポンスです');
      }

      console.log('📊 Result keys:', Object.keys(result || {}));

      // ✅ 修正: result の null チェックを最初に行う
      if (!result) {
        throw new Error('分析結果が空です');
      }

      // ✅ 修正: オプショナルチェーンを使用してプロパティにアクセス
      if (result?.success && result?.session_id) {
        console.log('✅ RFM analysis completed successfully');
        console.log('📤 Returning result with session_id:', result.session_id);

        // プロット画像データの確認
        console.log('🖼️ プロット画像データ確認:', {
          hasPlotBase64: !!result.plot_base64,
          hasPlotImage: !!result.plot_image,
          dataLength: result.plot_base64?.length || result.plot_image?.length || 0
        });

        setResult(result);

        // セッション詳細取得を試行（失敗しても分析結果は表示）
        try {
          const detailSuccess = await fetchSessionDetail(result.session_id);
          
          if (!detailSuccess) {
            console.warn('⚠️ セッション詳細取得に失敗しましたが、分析結果は表示します');
            // エラーは fetchSessionDetail 内で設定済み
          }
        } catch (detailError) {
          console.warn('⚠️ セッション詳細取得でエラー:', detailError);
          // セッション詳細の取得に失敗してもメイン分析は成功とみなす
        }

        // セッション一覧を更新
        await fetchSessions();

        // 成功メッセージ（詳細取得に失敗してもOK）
        console.log('🎉 分析が完了しました！');

      } else {
        // ✅ 修正: result.error へのアクセスも安全にする
        const errorMessage = result?.error || 'Analysis failed without error message';
        throw new Error(errorMessage);
      }

    } catch (error) {
      console.error('❌ Upload error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setError(errorMessage);
      
      // エラー詳細をログに出力
      if (error instanceof Error) {
        console.error('❌ Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      
    } finally {
      setLoading(false);
    }
  };


// ✅ fetchSessionDetail 関数も修正
  const fetchSessionDetail = async (sessionId: number): Promise<boolean> => {
    try {
      console.log(`🔍 セッション詳細を取得中: ${sessionId}`);
      
      const response = await fetch(`/api/rfm/sessions/${sessionId}`);
      const responseData = await response.json();

      // プロット画像データの統一処理
      if (responseData.plot_image && !responseData.plot_base64) {
        responseData.plot_base64 = responseData.plot_image;
      }

      console.log('🖼️ プロット画像データ確認:', {
        hasPlotBase64: !!responseData.plot_base64,
        hasPlotImage: !!responseData.plot_image,
        dataLength: responseData.plot_base64?.length || 0,
        dataType: typeof responseData.plot_base64,
        firstChars: responseData.plot_base64?.substring(0, 50) || 'No data'
      });
      
      // プロットデータのバリデーション
      if (!responseData.has_data || responseData.customer_count === 0) {
        console.warn('⚠️ セッション詳細にデータが含まれていません:', {
          sessionId,
          hasData: responseData.has_data,
          customerCount: responseData.customer_count,
          hasPlotData: !!(responseData.plot_base64 || responseData.plot_image)
        });

        // プロット画像があれば警告レベルで続行
        if (responseData.plot_base64 || responseData.plot_image) {
          console.log('📊 プロット画像データは利用可能です');
        } else {
          console.error('❌ プロット画像データも見つかりません');
          setError('セッション詳細の取得に失敗しました。Python API側でデータが正常に保存されていない可能性があります。');
          return false;
        }
      }

      // プロット画像データの確認（条件を緩和）
      if (responseData.plot_base64 || responseData.plot_image) {
        
        // FastAPI側のレスポンスを確認
        console.log('📡 FastAPI レスポンス詳細:', {
          plot_base64: responseData.plot_base64?.substring(0, 50) + '...',
          plot_image: responseData.plot_image?.substring(0, 50) + '...'  // 旧フィールド名もチェック
        });
      } else {
        console.log('✅ プロット画像データ検証:', {
          dataLength: responseData.plot_base64.length,
          isBase64: responseData.plot_base64.match(/^data:image\/\w+;base64,/) || 
                  responseData.plot_base64.match(/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/),
          firstChars: responseData.plot_base64.substring(0, 50) + '...'
        });
      }
      

      // データの保存前に変換を確認
      const sessionDetail: RFMSessionDetail = {
        ...responseData,
        plot_base64: responseData.plot_base64 || responseData.plot_image || '',  // 後方互換性対応
      };
      

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ セッション詳細取得エラー:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 300)
        });

        // 404エラーの場合は特別な処理
        if (response.status === 404) {
          console.warn('⚠️ セッション詳細が見つかりません。Python API側の修正が必要です。');
          
          // セッション一覧を再取得して、新しい分析結果を表示
          await fetchSessions();
          
          // エラーメッセージを表示（ユーザーに状況を説明）
          setError(`
            分析は正常に完了しましたが、詳細情報の取得でエラーが発生しました。
            
            原因: Python API側でモデルクラスのインポートエラー
            解決方法: analysis/rfm.py ファイルの先頭に以下を追加：
            from models import AnalysisSession, AnalysisMetadata, CoordinatesData          データのダウンロードは可能です。
          `);
          return false;
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      
      // ✅ 修正: data の null チェックとオプショナルチェーンを使用
      if (!responseData || !responseData.success) {
        console.error('❌ セッション詳細取得失敗:', responseData?.error || 'Unknown error');
        setError(responseData?.error || 'セッション詳細の取得に失敗しました');
        return false;
      }

      // プロットデータの存在チェック
      if (!responseData.plot_base64) {
        console.warn('⚠️ プロット画像データが含まれていません');
        // プロット画像がなくても続行
      }
      // セッション詳細を状態にセット
      const mappedSessionDetail: RFMSessionDetail = {
        session_id: responseData.session_id,
        success: responseData.success,
        has_data: responseData.has_data,
        customer_count: responseData.customer_count,
        session_name: responseData.session_name,
        analysis_type: responseData.analysis_type,
        filename: responseData.filename,
        description: responseData.description,
        analysis_date: responseData.analysis_date,
        row_count: responseData.row_count,
        column_count: responseData.column_count,
        total_customers: responseData.total_customers,
        rfm_divisions: responseData.rfm_divisions,
        customer_data: responseData.customer_data || [],
        segment_counts: responseData.segment_counts || {},
        rfm_statistics: responseData.rfm_statistics || {},
        plot_base64: responseData.plot_base64 || '',  // plot_image から plot_base64 に変更
        download_urls: {
          customers: `/api/rfm/download/${sessionId}/customers`,
          segments: `/api/rfm/download/${sessionId}/segments`,
          details: `/api/rfm/download/${sessionId}/details`
        }
      };

      // 一度だけsetSessionDetailを呼び出す
      setSessionDetail(mappedSessionDetail);

      // デバッグログ
      console.log('✅ セッション詳細取得成功:', {
        sessionId: mappedSessionDetail.session_id,
        customerCount: mappedSessionDetail.customer_count,
        hasPlotData: !!mappedSessionDetail.plot_base64,
        dataMapping: 'success'
      });

    } catch (error) {
      console.error('❌ セッション詳細取得エラー:', error);
      
      // より詳細なエラーメッセージ
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('404')) {
        setError(`
          セッション詳細の取得に失敗しました。
          
          これは既知の問題で、Python API側の修正が必要です。
          分析結果自体は正常に保存されているため、データのダウンロードは可能です。
          
          回避策: 
          1. ページを再読み込みして履歴から確認
          2. CSVファイルを直接ダウンロード
        `);
      } else {
        setError(`セッション詳細の取得中にエラーが発生しました: ${errorMessage}`);
      }
      
      return false;
    }
  };

  // または、より詳細な型定義を使用する場合：
  interface RFMSessionDetail {
    session_id: number;
    success: boolean;
    has_data: boolean;
    customer_count: number;  // 追加
    session_name: string;
    analysis_type: string;
    filename: string;
    description: string;
    analysis_date: string;
    row_count: number;
    column_count: number;
    total_customers: number;
    rfm_divisions: number;
    customer_data: any[];
    segment_counts: Record<string, number>;
    rfm_statistics: any;
    plot_base64: string;
    download_urls: {
      customers: string;
      segments: string;
      details: string;
    };
  }
  


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
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'upload'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
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
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                分析履歴 ({sessions.length})
              </span>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'upload' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">新しいRFM分析を実行</h2>
                {sessions.length > 0 && (
                  <span className="text-sm text-gray-500">
                    これまでに {sessions.length} 件の分析を実行済み
                  </span>
                )}
              </div>
              
              {/* デバッグ情報表示（開発環境のみ）
              {process.env.NODE_ENV === 'development' && detectedColumns?.length > 0 && (
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 text-xs">
                  <h4 className="font-semibold mb-2">🐛 デバッグ情報:</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p><strong>現在の列名設定:</strong></p>
                      <pre className="mt-1 text-xs">{JSON.stringify(parameters, null, 2)}</pre>
                    </div>
                    <div>
                      <p><strong>検出された列:</strong></p>
                      <p className="mt-1">{detectedColumns.join(', ')}</p>
                      <p><strong>選択ファイル:</strong> {file?.name || 'なし'}</p>
                    </div>
                  </div>
                </div>
              )} */}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 左側：設定パネル */}
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-gray-900 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.349 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.349a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.349 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.349a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      分析パラメータ設定
                    </h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        セッション名 *
                      </label>
                      <input
                        type="text"
                        value={sessionName}
                        onChange={(e) => setSessionName(e.target.value)}
                        placeholder="例: 2024年第1四半期_RFM分析"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">分析結果を識別するための名前</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        説明（任意）
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="この分析の目的や背景を記載..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        タグ（任意）
                      </label>
                      <input
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="例: Q1, 新規顧客, キャンペーン"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-sm text-gray-500 mt-1">カンマ区切りで複数指定可能</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                    <h3 className="font-medium text-blue-900 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2" />
                      </svg>
                      データ列の設定
                    </h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        顧客ID列名 *
                      </label>
                      {false ? (
                        <select
                          value={parameters?.customerIdCol ?? 'id'}
                          onChange={(e) => setParameters({...parameters, customerIdCol: e.target.value})}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          {detectedColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={parameters?.customerIdCol ?? 'id'}
                          onChange={(e) => setParameters({...parameters, customerIdCol: e.target.value})}
                          placeholder="例: id, customer_id"
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      )}
                      <p className="text-sm text-blue-600 mt-1">顧客を識別するためのID列</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        日付列名 *
                      </label>
                      {false ? (
                        <select
                          value={parameters.dateCol}
                          onChange={(e) => setParameters({...parameters, dateCol: e.target.value})}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          {detectedColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={parameters?.dateCol ?? ''}  // null チェックを追加
                          onChange={(e) => setParameters(prev => ({
                            ...prev,
                            dateCol: e.target.value
                          }))}
                          placeholder="例: date, order_date"
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      )}
                      <p className="text-sm text-blue-600 mt-1">購入日時の列</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        金額列名 *
                      </label>
                      {false ? (
                        <select
                          value={parameters.amountCol}
                          onChange={(e) => setParameters({...parameters, amountCol: e.target.value})}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          {detectedColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={parameters.amountCol}
                          onChange={(e) => setParameters({...parameters, amountCol: e.target.value})}
                          placeholder="例: amount, price"
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      )}
                      <p className="text-sm text-blue-600 mt-1">購入金額の列</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        RFMスコア分割数
                      </label>
                      <select
                        value={parameters?.rfmDivisions ?? 3}
                        onChange={(e) => setParameters({...parameters, rfm_divisions: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value={3}>3分割（1-3）- 標準</option>
                        <option value={4}>4分割（1-4）- 詳細</option>
                        <option value={5}>5分割（1-5）- 最詳細</option>
                      </select>
                      <p className="text-sm text-blue-600 mt-1">各指標（R・F・M）の分割数を設定</p>
                    </div>
                  </div>
                </div>

                {/* 右側：ファイルアップロード */}
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      データファイル
                    </h3>
                    <FileUpload
                      onFileSelect={handleFileSelect}
                      accept=".csv"
                      disabled={loading}
                    />
                    
                    {file && (
                      <div className="mt-4 space-y-3">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center mb-2">
                            <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm text-blue-700 font-medium">
                              選択されたファイル: {file.name}
                            </p>
                          </div>
                          <div className="text-xs text-blue-600 space-y-1">
                            <p>ファイルサイズ: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            <p>ファイル形式: {file.type || 'CSV'}</p>
                          </div>
                          
                          {detectedColumns.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs text-blue-600 mb-2 font-medium">検出された列名:</p>
                              <div className="flex flex-wrap gap-1">
                                {detectedColumns.map((col, index) => (
                                  <span 
                                    key={index}
                                    className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded border"
                                  >
                                    {col}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {detectedColumns.length > 0 && (
                          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center mb-2">
                              <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-sm text-green-700 font-medium">
                                列名の自動設定が完了しました
                              </p>
                            </div>
                            <div className="text-xs text-green-600 space-y-1">
                              <p>顧客ID: <span className="font-mono bg-green-100 px-1 rounded border">{parameters.customerIdCol}</span></p>
                              <p>日付: <span className="font-mono bg-green-100 px-1 rounded border">{parameters.dateCol}</span></p>
                              <p>金額: <span className="font-mono bg-green-100 px-1 rounded border">{parameters.amountCol}</span></p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={!file || !sessionName.trim() || loading || !parameters.customerIdCol || !parameters.dateCol || !parameters.amountCol}
                    className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 
                               disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg
                               flex items-center justify-center transition-colors duration-200"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        RFM分析実行中...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        RFM分析を実行
                      </>
                    )}
                  </button>

                  {/* 分析要件の説明 */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-800 mb-2 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      データ要件
                    </h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• 1行1取引の形式（顧客が複数回購入している場合は複数行）</li>
                      <li>• 最低100件以上のトランザクションデータ推奨</li>
                      <li>• 日付は YYYY-MM-DD 形式が理想的</li>
                      <li>• 金額は数値のみ（通貨記号不要）</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 履歴タブの内容 */
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">RFM分析履歴</h2>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="セッション名、ファイル名で検索..."
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <button
                    onClick={fetchSessions}
                    disabled={sessionsLoading}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                  >
                    <svg className={`w-4 h-4 mr-2 ${sessionsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    更新
                  </button>
                </div>
              </div>

              {sessionsLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">セッション履歴を読み込み中...</p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m8-8V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1m8 0V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1" />
                  </svg>
                  {searchQuery ? (
                    <>
                      <p className="text-lg font-medium">検索結果が見つかりません</p>
                      <p>検索条件を変更してお試しください</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium">保存されたRFM分析がありません</p>
                      <p>新規分析タブからRFM分析を実行してください</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {searchQuery && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">{filteredSessions.length}</span> 件の結果が見つかりました
                        {filteredSessions.length !== sessions.length && (
                          <span> （全 {sessions.length} 件中）</span>
                        )}
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredSessions.map((session) => (
                      <div
                        key={session.session_id}
                        className="bg-gray-50 rounded-lg p-5 hover:bg-gray-100 transition-colors cursor-pointer border hover:border-indigo-300 hover:shadow-md group"
                        onClick={() => {
                          // エラーをクリアしてからセッション詳細を取得
                          setError(null);
                          fetchSessionDetail(session.session_id);
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-semibold text-gray-900 truncate pr-2">{session.session_name}</h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.session_id);
                            }}
                            className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                            title="セッションを削除"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                          <p className="text-sm text-gray-600 flex items-center">
                            <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {session.filename}
                          </p>
                          
                          {session.description && (
                            <p className="text-sm text-gray-500 line-clamp-2">{session.description}</p>
                          )}
                        </div>
                        
                        {session.tags && session.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {session.tags.slice(0, 3).map((tag, index) => (
                              <span
                                key={index}
                                className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded border border-green-200"
                              >
                                {tag}
                              </span>
                            ))}
                            {session.tags.length > 3 && (
                              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                                +{session.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-500 space-y-1 border-t border-gray-200 pt-3">
                          <div className="grid grid-cols-2 gap-2">
                            <p>📅 {formatDate(session.analysis_timestamp)}</p>
                            <p>📊 {session.row_count?.toLocaleString()} 行</p>
                            {session.total_customers && (
                              <p>👥 {session.total_customers.toLocaleString()} 顧客</p>
                            )}
                            {session.rfm_divisions && (
                              <p>🎯 {session.rfm_divisions}段階分析</p>
                            )}
                          </div>
                        </div>
                        
                        {/* ホバー時に表示されるクイックアクション */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-3 flex justify-between items-center">
                          <span className="text-xs text-indigo-600 font-medium">クリックして詳細を表示</span>
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadCSV(session.session_id, 'customers');
                              }}
                              className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors"
                              title="顧客CSV ダウンロード"
                            >
                              CSV
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadJSON(session.session_id);
                              }}
                              className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 transition-colors"
                              title="詳細JSON ダウンロード"
                            >
                              JSON
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="ml-3 flex-1">
              <h3 className="font-medium text-red-800">エラーが発生しました</h3>
              <div className="mt-1 text-sm text-red-700">
                <pre className="whitespace-pre-wrap font-sans">{error}</pre>
              </div>
              
              {/* エラーに応じた対処法を表示 */}
              {error.includes('AnalysisSession') && (
                <div className="mt-3 p-3 bg-red-100 rounded border border-red-200">
                  <h4 className="font-medium text-red-800 mb-2">解決方法:</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• サーバーの再起動を試してください</li>
                    <li>• 問題が継続する場合は管理者にお問い合わせください</li>
                    <li>• 新しい分析は実行可能です</li>
                  </ul>
                </div>
              )}
              
              {error.includes('見つかりません') && (
                <div className="mt-3 p-3 bg-red-100 rounded border border-red-200">
                  <h4 className="font-medium text-red-800 mb-2">考えられる原因:</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• セッションが既に削除されている</li>
                    <li>• データベースの整合性に問題がある</li>
                    <li>• セッションIDが正しくない</li>
                  </ul>
                </div>
              )}
              
              <div className="mt-3 flex space-x-3">
                <button
                  onClick={() => setError(null)}
                  className="text-sm text-red-600 hover:text-red-800 underline"
                >
                  エラーを閉じる
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    fetchSessions();
                  }}
                  className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                >
                  セッション一覧を更新
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    setActiveTab('upload');
                  }}
                  className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                >
                  新規分析へ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 結果表示 */}
      {result && result.success && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">RFM分析結果</h2>
              <p className="text-sm text-gray-500 mt-1">{result.session_name}</p>
            </div>
            <div className="flex items-center space-x-3">
              {result.session_id && (
                <>
                  <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded">
                    ID: {result.session_id}
                  </span>
                  <button
                    onClick={() => downloadCSV(Number(result.session_id), 'customers')}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm flex items-center transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    顧客CSV
                  </button>
                  <button
                    onClick={() => downloadCSV(Number(result.session_id), 'segments')}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    セグメントCSV
                  </button>
                  <button
                    onClick={() => downloadJSON(Number(result.session_id))}
                    className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 text-sm flex items-center transition-colors"
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
          
          {/* 分析概要カード */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                📊 分析概要
              </h3>
              <dl className="space-y-2 text-sm">
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

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                📈 Recency統計
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-green-700">平均:</dt>
                  <dd className="font-medium text-green-900">
                    {(() => {
                      const recencyStats = result.data?.rfm_stats?.recency_stats || 
                                          result.data?.rfm_stats?.recency || 
                                          result.rfm_stats?.recency_stats || 
                                          result.rfm_stats?.recency;
                      
                      return recencyStats?.mean ? 
                        `${formatNumber(recencyStats.mean, 1)}日` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">最小:</dt>
                  <dd className="font-medium text-green-900">
                    {(() => {
                      const recencyStats = result.data?.rfm_stats?.recency_stats || 
                                          result.data?.rfm_stats?.recency || 
                                          result.rfm_stats?.recency_stats || 
                                          result.rfm_stats?.recency;
                      
                      return recencyStats?.min !== undefined ? 
                        `${Math.round(recencyStats.min)}日` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">最大:</dt>
                  <dd className="font-medium text-green-900">
                    {(() => {
                      const recencyStats = result.data?.rfm_stats?.recency_stats || 
                                          result.data?.rfm_stats?.recency || 
                                          result.rfm_stats?.recency_stats || 
                                          result.rfm_stats?.recency;
                      
                      return recencyStats?.max !== undefined ? 
                        `${Math.round(recencyStats.max)}日` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
              <h3 className="font-semibold text-yellow-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                🔄 Frequency統計
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-yellow-700">平均:</dt>
                  <dd className="font-medium text-yellow-900">
                    {(() => {
                      const frequencyStats = result.data?.rfm_stats?.frequency_stats || 
                                            result.data?.rfm_stats?.frequency || 
                                            result.rfm_stats?.frequency_stats || 
                                            result.rfm_stats?.frequency;
                      
                      return frequencyStats?.mean ? 
                        `${formatNumber(frequencyStats.mean, 1)}回` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-yellow-700">最小:</dt>
                  <dd className="font-medium text-yellow-900">
                    {(() => {
                      const frequencyStats = result.data?.rfm_stats?.frequency_stats || 
                                            result.data?.rfm_stats?.frequency || 
                                            result.rfm_stats?.frequency_stats || 
                                            result.rfm_stats?.frequency;
                      
                      return frequencyStats?.min !== undefined ? 
                        `${Math.round(frequencyStats.min)}回` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-yellow-700">最大:</dt>
                  <dd className="font-medium text-yellow-900">
                    {(() => {
                      const frequencyStats = result.data?.rfm_stats?.frequency_stats || 
                                            result.data?.rfm_stats?.frequency || 
                                            result.rfm_stats?.frequency_stats || 
                                            result.rfm_stats?.frequency;
                      
                      return frequencyStats?.max !== undefined ? 
                        `${Math.round(frequencyStats.max)}回` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                💰 Monetary統計
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-purple-700">平均:</dt>
                  <dd className="font-medium text-purple-900">
                    {(() => {
                      const monetaryStats = result.data?.rfm_stats?.monetary_stats || 
                                          result.data?.rfm_stats?.monetary || 
                                          result.rfm_stats?.monetary_stats || 
                                          result.rfm_stats?.monetary;
                      
                      return monetaryStats?.mean ? 
                        `¥${monetaryStats.mean.toLocaleString()}` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-purple-700">最小:</dt>
                  <dd className="font-medium text-purple-900">
                    {(() => {
                      const monetaryStats = result.data?.rfm_stats?.monetary_stats || 
                                          result.data?.rfm_stats?.monetary || 
                                          result.rfm_stats?.monetary_stats || 
                                          result.rfm_stats?.monetary;
                      
                      return monetaryStats?.min !== undefined ? 
                        `¥${Math.round(monetaryStats.min).toLocaleString()}` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-purple-700">最大:</dt>
                  <dd className="font-medium text-purple-900">
                    {(() => {
                      const monetaryStats = result.data?.rfm_stats?.monetary_stats || 
                                          result.data?.rfm_stats?.monetary || 
                                          result.rfm_stats?.monetary_stats || 
                                          result.rfm_stats?.monetary;
                      
                      return monetaryStats?.max !== undefined ? 
                        `¥${Math.round(monetaryStats.max).toLocaleString()}` : 
                        '計算中...';
                    })()}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 顧客セグメント分布 */}
          <div className="mb-8">
            <h3 className="font-semibold mb-4 text-lg flex items-center">
              <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              👥 顧客セグメント分布
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(result.data.segment_counts).map(([segment, count]) => {
                const percentage = ((count / result.data.total_customers) * 100).toFixed(1);
                const definition = result.data.segment_definitions[segment];
                
                return (
                  <div key={segment} className="bg-gray-50 rounded-lg p-4 border hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getSegmentColor(segment)}`}>
                        {segment}
                      </span>
                      <span className="text-xl font-bold text-gray-900">{count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center mb-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-2.5 mr-3">
                        <div 
                          className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700">{percentage}%</span>
                    </div>
                    {definition && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <p className="mb-2">{definition.description}</p>
                        <div className="bg-indigo-50 p-2 rounded border border-indigo-100">
                          <p className="text-indigo-700 font-medium">💡 推奨アクション:</p>
                          <p className="text-indigo-600">{definition.action}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* プロット画像 */}
          <div className="mb-8">
            <h3 className="font-semibold mb-4 text-lg flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              📊 RFM分析プロット
            </h3>
            
            {(() => {
              // プロット画像データを取得（優先順位を修正）
              const plotData = result?.plot_base64 || 
                              result?.data?.plot_base64 || 
                              sessionDetail?.plot_base64 || 
                              result?.plot_image;
              
              console.log('🖼️ プロット画像データチェック:', {
                hasResultPlotBase64: !!result?.plot_base64,
                hasResultDataPlotBase64: !!result?.data?.plot_base64,
                hasSessionDetailPlot: !!sessionDetail?.plot_base64,
                hasResultPlotImage: !!result?.plot_image,
                finalPlotData: !!plotData,
                plotDataLength: plotData?.length || 0,
                plotDataPrefix: plotData?.substring(0, 50) || 'No data'
              });
              
              // // デバッグ情報（開発環境のみ）
              // if (process.env.NODE_ENV === 'development') {
              //   return (
              //     <>
              //       <div className="bg-gray-100 p-3 mb-4 rounded text-xs">
              //         <h4 className="font-medium mb-2">🐛 プロット画像デバッグ情報:</h4>
              //         <div className="grid grid-cols-2 gap-4">
              //           <div>
              //             <p><strong>result:</strong></p>
              //             <ul className="ml-4 space-y-1">
              //               <li>plot_base64: {result?.plot_base64 ? `${result.plot_base64.length}文字` : '❌'}</li>
              //               <li>data.plot_base64: {result?.data?.plot_base64 ? `${result.data.plot_base64.length}文字` : '❌'}</li>
              //               <li>plot_image: {result?.plot_image ? `${result.plot_image.length}文字` : '❌'}</li>
              //             </ul>
              //           </div>
              //           <div>
              //             <p><strong>sessionDetail:</strong></p>
              //             <ul className="ml-4 space-y-1">
              //               <li>has_data: {sessionDetail?.has_data ? '✅' : '❌'}</li>
              //               <li>customer_count: {sessionDetail?.customer_count || 0}</li>
              //               <li>plot_base64: {sessionDetail?.plot_base64 ? `${sessionDetail.plot_base64.length}文字` : '❌'}</li>
              //             </ul>
              //           </div>
              //         </div>
              //         <div className="mt-2 p-2 bg-white rounded border">
              //           <p><strong>最終選択データ:</strong> {plotData ? `${plotData.length}文字` : 'なし'}</p>
              //           {plotData && (
              //             <p className="font-mono text-xs mt-1">{plotData.substring(0, 100)}...</p>
              //           )}
              //         </div>
              //       </div>
              //       {/* 実際の画像表示部分 */}
              //       {plotData ? (
              //         <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
              //           <Image
              //             src={plotData.startsWith('data:image/') ? plotData : `data:image/png;base64,${plotData}`}
              //             alt="RFM分析プロット"
              //             width={1200}
              //             height={800}
              //             className="w-full h-auto"
              //             priority={true}
              //             unoptimized={true}
              //             onError={(e) => {
              //               console.error('❌ プロット画像読み込みエラー:', {
              //                 hasSessionDetail: !!sessionDetail?.plot_base64,
              //                 hasResult: !!result?.plot_base64,
              //                 dataLength: plotData?.length,
              //                 dataPrefix: plotData?.substring(0, 50)
              //               });
              //               const target = e.target as HTMLImageElement;
              //               target.style.display = 'none';
              //               const errorDiv = document.createElement('div');
              //               errorDiv.className = 'p-4 text-red-600 bg-red-50 rounded border';
              //               errorDiv.innerHTML = `
              //                 <div class="flex items-center mb-2">
              //                   <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              //                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
              //                   </svg>
              //                   プロット画像の読み込みに失敗しました
              //                 </div>
              //                 <p class="text-sm">CSVダウンロードで詳細データを確認できます</p>
              //               `;
              //               target.parentNode?.appendChild(errorDiv);
              //             }}
              //           />
              //         </div>
              //       ) : (
              //         <div className="border rounded-lg p-8 bg-yellow-50 text-center border-yellow-200">
              //           <svg className="w-12 h-12 mx-auto mb-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
              //           </svg>
              //           <p className="text-yellow-700 font-medium">プロット画像データが見つかりません</p>
              //           <p className="text-yellow-600 text-sm mt-2">Python API側でプロット生成エラーが発生している可能性があります</p>
              //         </div>
              //       )}
              //     </>
              //   );
              // }
              
              // 本番環境での表示
              if (!plotData) {
                return (
                  <div className="border rounded-lg p-8 bg-gray-50 text-center">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-600">プロット画像を生成中...</p>
                    <p className="text-gray-500 text-sm mt-2">
                      分析は正常に完了しています。セグメント分析結果とCSVダウンロードをご利用ください。
                    </p>
                  </div>
                );
              }

              // Base64プレフィックスを処理
              const base64Data = plotData.startsWith('data:image/') ? 
                plotData : 
                `data:image/png;base64,${plotData}`;

              return (
                <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                  <Image
                    src={base64Data}
                    alt="RFM分析プロット"
                    width={1200}
                    height={800}
                    className="w-full h-auto"
                    priority={true}
                    unoptimized={true}
                    onError={(e) => {
                      console.error('❌ プロット画像読み込みエラー:', {
                        hasSessionDetail: !!sessionDetail?.plot_base64,
                        hasResult: !!result?.plot_base64,
                        dataLength: plotData?.length,
                        dataPrefix: plotData?.substring(0, 50)
                      });
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const errorDiv = document.createElement('div');
                      errorDiv.className = 'p-4 text-red-600 bg-red-50 rounded border';
                      errorDiv.innerHTML = `
                        <div class="flex items-center mb-2">
                          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
                          </svg>
                          プロット画像の読み込みに失敗しました
                        </div>
                        <p class="text-sm">CSVダウンロードで詳細データを確認できます</p>
                      `;
                      target.parentNode?.appendChild(errorDiv);
                    }}
                  />
                </div>
              );
            })()}


              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    📊 プロットの見方
                  </h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 散布図: 顧客の分布状況</li>
                    <li>• 色分け: セグメント別表示</li>
                    <li>• 軸: R（最新購入）、F（頻度）、M（金額）</li>
                    <li>• 右上: 高価値顧客エリア</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="font-medium text-green-900 mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    💡 活用のポイント
                  </h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• VIP顧客: 特別サービス提供</li>
                    <li>• 離脱顧客: 復帰キャンペーン実施</li>
                    <li>• 新規顧客: 継続購入促進</li>
                    <li>• 要注意顧客: 早期フォロー</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* セグメント別詳細統計 */}
          <div className="mb-8">
            <h3 className="font-semibold mb-4 text-lg flex items-center">
              <svg className="w-6 h-6 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              📈 セグメント別詳細統計
            </h3>
            <div className="overflow-x-auto bg-white rounded-lg border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left font-medium text-gray-900">セグメント</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-900">顧客数</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-900">平均Recency</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-900">平均Frequency</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-900">平均Monetary</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-900">平均RFMスコア</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.data.segment_stats || {}).map(([segment, stats], index) => (
                    <tr key={segment} className={`border-b hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getSegmentColor(segment)}`}>
                          {segment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {stats?.customer_count?.toLocaleString() || '0'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stats?.recency_mean ? `${formatNumber(stats.recency_mean, 1)}日` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stats?.frequency_mean ? `${formatNumber(stats.frequency_mean, 1)}回` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stats?.monetary_mean ? `¥${Math.round(stats.monetary_mean).toLocaleString()}` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {stats?.rfm_score_mean ? formatNumber(stats.rfm_score_mean, 2) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  {Object.keys(result.data.segment_stats || {}).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        セグメント統計データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 顧客データサンプル */}
          <div className="mb-8">
            <h3 className="font-semibold mb-4 text-lg flex items-center">
              <svg className="w-6 h-6 mr-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              👤 顧客データサンプル（最初の20件）
            </h3>
            <div className="overflow-x-auto bg-white rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left font-medium text-gray-900">顧客ID</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900">Recency</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900">Frequency</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900">Monetary</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900">RFMスコア</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900">セグメント</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.data.customer_data || []).slice(0, 20).map((customer, index) => (
                    <tr key={index} className={`border-b hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {customer.customer_id || 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {customer.recency !== undefined ? Math.round(customer.recency) : 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {customer.frequency !== undefined ? Math.round(customer.frequency) : 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {customer.monetary !== undefined ? `¥${Math.round(customer.monetary).toLocaleString()}` : 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-medium">
                            {customer.rfm_score !== undefined ? formatNumber(customer.rfm_score, 2) : 'N/A'}
                          </span>
                          {customer.r_score !== undefined && customer.f_score !== undefined && customer.m_score !== undefined && (
                            <span className="text-xs text-gray-500">
                              ({customer.r_score},{customer.f_score},{customer.m_score})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSegmentColor(customer.segment || 'その他')}`}>
                          {customer.segment || 'その他'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!result.data.customer_data || result.data.customer_data.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        顧客データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {result.data.customer_data && result.data.customer_data.length > 20 && (
              <p className="text-sm text-gray-500 mt-3 p-3 bg-gray-50 rounded border">
                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                他 {result.data.customer_data.length - 20} 件の顧客データがあります。CSVダウンロードで全件取得可能です。
              </p>
            )}
          </div>

          {/* 分析結果の解釈とアドバイス */}
          <div className="mb-8 bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-yellow-800">RFM分析結果の活用について</h3>
                <div className="mt-3 text-sm text-yellow-700 space-y-3">
                  <div>
                    <strong className="text-yellow-800">🎯 セグメント別アプローチ:</strong> 
                    各セグメントの特徴に応じたマーケティング施策を検討してください。
                  </div>
                  <div>
                    <strong className="text-yellow-800">⚡ 優先度設定:</strong> 
                    VIP顧客と離脱顧客への対応を最優先に、リソース配分を行いましょう。
                  </div>
                  <div>
                    <strong className="text-yellow-800">🔄 定期的な更新:</strong> 
                    顧客の行動は変化するため、定期的にRFM分析を実行して最新の状況を把握しましょう。
                  </div>
                  <div>
                    <strong className="text-yellow-800">📊 KPI追跡:</strong> 
                    セグメント移動や顧客価値向上を追跡し、施策効果を測定しましょう。
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-4 justify-center p-6 bg-gray-50 rounded-lg">
            <button
              onClick={() => window.print()}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              レポートを印刷
            </button>
            
            <button
              onClick={() => setActiveTab('upload')}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 flex items-center transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新しい分析を実行
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              分析履歴を確認
            </button>
          </div>
        </div>
      )}

      {/* RFM分析手法の説明 */}
      <div className="mt-12 bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <span className="text-3xl mr-3">📚</span>
          RFM分析について
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-5 border border-green-200">
            <h3 className="font-semibold text-green-900 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              📖 概要
            </h3>
            <p className="text-sm text-green-800 leading-relaxed">
              RFM分析は、顧客を最新購入日（Recency）、購入頻度（Frequency）、購入金額（Monetary）の3つの指標で評価し、
              効果的な顧客セグメンテーションを行う手法です。
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              🎯 RFMの3つの指標
            </h3>
            <ul className="text-sm text-blue-800 space-y-1.5 leading-relaxed">
              <li>• <strong>Recency</strong>: 最後の購入からの日数</li>
              <li>• <strong>Frequency</strong>: 購入回数・頻度</li>
              <li>• <strong>Monetary</strong>: 累計購入金額</li>
              <li>• 各指標を3-5段階で評価</li>
            </ul>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-5 border border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              💼 適用場面
            </h3>
            <ul className="text-sm text-purple-800 space-y-1.5 leading-relaxed">
              <li>• EC・小売業の顧客管理</li>
              <li>• マーケティング施策の最適化</li>
              <li>• 顧客ロイヤリティ分析</li>
              <li>• チャーン（離脱）予測</li>
            </ul>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-5 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              📊 主要な顧客セグメント
            </h3>
            <div className="text-sm text-gray-700 space-y-2.5">
              <div className="flex items-start">
                <span className="w-3 h-3 bg-purple-500 rounded-full mr-3 mt-1.5 flex-shrink-0"></span>
                <div>
                  <strong>VIP顧客:</strong> 最近購入・高頻度・高額（R:高, F:高, M:高）
                </div>
              </div>
              <div className="flex items-start">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-3 mt-1.5 flex-shrink-0"></span>
                <div>
                  <strong>優良顧客:</strong> 最近購入・中程度の頻度と金額
                </div>
              </div>
              <div className="flex items-start">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-3 mt-1.5 flex-shrink-0"></span>
                <div>
                  <strong>新規顧客:</strong> 最近購入・低頻度・低額
                </div>
              </div>
              <div className="flex items-start">
                <span className="w-3 h-3 bg-orange-500 rounded-full mr-3 mt-1.5 flex-shrink-0"></span>
                <div>
                  <strong>要注意ヘビーユーザー:</strong> 購入なし・高頻度・高額
                </div>
              </div>
              <div className="flex items-start">
                <span className="w-3 h-3 bg-red-500 rounded-full mr-3 mt-1.5 flex-shrink-0"></span>
                <div>
                  <strong>離脱顧客:</strong> 購入なし・低頻度・低額
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-5 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              🚀 活用のメリット
            </h3>
            <ul className="text-sm text-gray-700 space-y-1.5 leading-relaxed">
              <li>• セグメント別マーケティング戦略の策定</li>
              <li>• 限られたリソースの効率的配分</li>
              <li>• 顧客生涯価値（LTV）の最大化</li>
              <li>• 離脱リスクの早期発見</li>
              <li>• パーソナライズされた顧客体験</li>
              <li>• マーケティングROIの向上</li>
            </ul>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 bg-yellow-50 rounded-lg border border-yellow-200">
            <h3 className="font-semibold mb-3 flex items-center text-yellow-800">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              📋 データの準備について
            </h3>
            <div className="text-sm text-yellow-700 space-y-2 leading-relaxed">
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

          <div className="p-5 bg-green-50 rounded-lg border border-green-200">
            <h3 className="font-semibold mb-3 flex items-center text-green-800">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              📄 サンプルデータ形式
            </h3>
            <div className="text-sm text-green-700">
              <p className="mb-2">RFM分析用のCSVファイルは以下の形式で準備してください：</p>
              <div className="bg-white p-3 rounded border font-mono text-xs overflow-x-auto">
                <div>id,date,price</div>
                <div>1000,2024-01-15,2500</div>
                <div>1001,2024-01-16,1200</div>
                <div>1000,2024-02-20,3800</div>
                <div>1002,2024-01-18,5500</div>
                <div>...</div>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <p>• <strong>id:</strong> 顧客を識別するID</p>
                <p>• <strong>date:</strong> 購入日（YYYY-MM-DD形式推奨）</p>
                <p>• <strong>price:</strong> 購入金額（数値のみ）</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="p-5 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold mb-3 flex items-center text-blue-800">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.349 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.349a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.349 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.349a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ⚙️ 分析パラメータの設定
            </h3>
            <div className="text-sm text-blue-700 space-y-2 leading-relaxed">
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

          <div className="p-5 bg-indigo-50 rounded-lg border border-indigo-200">
            <h3 className="font-semibold mb-3 flex items-center text-indigo-800">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              📈 結果の活用方法
            </h3>
            <div className="grid grid-cols-1 gap-4 text-sm text-indigo-700">
              <div>
                <h4 className="font-medium mb-2 text-indigo-800">マーケティング施策例:</h4>
                <ul className="space-y-1 text-xs">
                  <li>• VIP顧客: 限定商品・特別サービス</li>
                  <li>• 新規顧客: ウェルカムキャンペーン</li>
                  <li>• 離脱顧客: 復帰促進オファー</li>
                  <li>• 要注意顧客: 再エンゲージメント</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-indigo-800">KPI改善への貢献:</h4>
                <ul className="space-y-1 text-xs">
                  <li>• 顧客生涯価値（LTV）向上</li>
                  <li>• 顧客維持率（リテンション）改善</li>
                  <li>• 購入頻度・単価の向上</li>
                  <li>• マーケティング効率の最適化</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 追加の使用ガイダンス */}
        <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
          <h3 className="font-semibold mb-4 flex items-center text-purple-800">
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            💡 より効果的な分析のために
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-purple-700">
            <div>
              <h4 className="font-medium mb-2 text-purple-800">分析前のチェックポイント:</h4>
              <ul className="space-y-1">
                <li>✓ データの品質確認（重複、欠損値など）</li>
                <li>✓ 分析期間の妥当性（季節性の考慮）</li>
                <li>✓ 顧客セグメントの事前仮説設定</li>
                <li>✓ ビジネス目標との整合性確認</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-purple-800">分析後のアクション:</h4>
              <ul className="space-y-1">
                <li>✓ セグメント別戦略の具体化</li>
                <li>✓ 施策実行のためのリソース計画</li>
                <li>✓ 効果測定指標の設定</li>
                <li>✓ 次回分析スケジュールの決定</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
          <h4 className="font-medium text-red-800 mb-2 flex items-center">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            ⚠️ 重要な注意事項
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            <li>• アップロードされたデータは分析完了後に安全に削除されます</li>
            <li>• 個人情報を含む場合は事前に匿名化してください</li>
            <li>• ファイルサイズは50MB以下に制限されています</li>
            <li>• 分析結果の解釈はビジネス文脈を考慮して行ってください</li>
          </ul>
        </div>
      </div>
    </AnalysisLayout>
  );
}

  