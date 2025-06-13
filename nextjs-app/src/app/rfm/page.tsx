//src/app/rfm/page.tsx（修正版）
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

// セッション詳細の型定義（統一）
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
  plot_base64: string;
  download_urls: {
    customers: string;
    segments: string;
    details: string;
  };
}

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
    rfmDivisions: 3,
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<RFMSession | null>(null);
  const [sessionDetail, setSessionDetail] = useState<RFMSessionDetail | null>(null);

  // 検索結果のフィルタリング
  const filteredSessions = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    if (!searchQuery.trim()) return sessions;
    
    const searchLower = searchQuery.toLowerCase();
    return sessions.filter(session => {
      return (
        session.session_name?.toLowerCase().includes(searchLower) ||
        session.filename?.toLowerCase().includes(searchLower) ||
        session.description?.toLowerCase().includes(searchLower) ||
        session.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    });
  }, [sessions, searchQuery]);

  // 🔧 修正: セッション履歴を取得（RFM分析のみ）
  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      setError(null); // エラーをクリア
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

      console.log('📥 Sessions API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Sessions API Error:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log('📄 Sessions API Response Text Length:', responseText.length);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', parseError);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      console.log('📊 Sessions API Data:', {
        success: data.success,
        hasData: !!data.data,
        dataLength: data.data?.length || 0,
        dataType: typeof data.data
      });

      if (!data || !data.success) {
        throw new Error(data?.error || 'セッション取得に失敗しました');
      }

      // データの存在確認
      if (!data.data || !Array.isArray(data.data)) {
        console.warn('⚠️ Sessions data is not an array:', data.data);
        setSessions([]);
        return;
      }

      // RFM分析のセッションのみフィルタリング
      const allSessions = data.data.map((session: any) => ({
        ...session,
        tags: Array.isArray(session.tags) ? session.tags : []
      }));

      const rfmSessions = allSessions.filter((session: any) => 
        session.analysis_type === 'rfm'
      );

      console.log('✅ RFM分析セッション一覧取得完了:', {
        totalSessions: allSessions.length,
        rfmSessions: rfmSessions.length,
        rfmSessionIds: rfmSessions.map((s: any) => s.session_id)
      });

      setSessions(rfmSessions);

    } catch (error) {
      console.error('❌ セッション取得エラー:', error);
      const errorMessage = error instanceof Error ? error.message : 'セッション取得中にエラーが発生しました';
      setError(`セッション履歴の取得に失敗しました: ${errorMessage}`);
      setSessions([]); // エラー時は空配列を設定
    } finally {
      setSessionsLoading(false);
    }
  };

  // 🔧 修正: セッション詳細を取得（時系列分析の手法を参考に改善）
  const fetchSessionDetail = async (sessionId: number) => {
    try {
      setError(null);
      console.log(`🔍 セッション詳細を取得中: ${sessionId}`);
      
      const response = await fetch(`/api/rfm/sessions/${sessionId}`);
      
      console.log('📥 Session Detail Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ セッション詳細取得エラー:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 300)
        });

        if (response.status === 404) {
          throw new Error('セッションが見つかりません。削除された可能性があります。');
        }
        
        throw new Error(`セッション詳細の取得に失敗しました: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log('📄 Session Detail Response Length:', responseText.length);

      let pythonResponse;
      try {
        pythonResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', parseError);
        throw new Error('セッション詳細データの解析に失敗しました');
      }

      // 🔧 修正: 時系列分析と同じ手法でデータ構造を詳細にログ出力
      console.log('🔍 Python response structure:', {
        keys: Object.keys(pythonResponse),
        success: pythonResponse.success,
        sessionInfo: pythonResponse.session_info ? Object.keys(pythonResponse.session_info) : null,
        analysisData: pythonResponse.analysis_data ? Object.keys(pythonResponse.analysis_data) : null,
        visualization: pythonResponse.visualization ? Object.keys(pythonResponse.visualization) : null,
        hasData: pythonResponse.has_data,
        customerCount: pythonResponse.customer_count
      });

      if (!pythonResponse || !pythonResponse.success) {
        throw new Error(pythonResponse?.error || 'セッション詳細の取得に失敗しました');
      }

      // 🔧 修正: analysis_dataからの統計データ取得（時系列分析と同じ手法）
      const analysisData = pythonResponse.analysis_data || {};
      
      // RFM統計データの取得
      let rfmStats = {};
      if (analysisData.rfm_stats) {
        rfmStats = analysisData.rfm_stats;
      } else if (pythonResponse.rfm_statistics) {
        rfmStats = pythonResponse.rfm_statistics;
      }

      // セグメント数の取得
      let segmentCounts = {};
      if (analysisData.segment_counts) {
        segmentCounts = analysisData.segment_counts;
      } else if (pythonResponse.segment_counts) {
        segmentCounts = pythonResponse.segment_counts;
      }

      // プロット画像の取得（時系列分析と同じ手法）
      let plotImage = '';
      if (pythonResponse.visualization?.plot_image) {
        plotImage = pythonResponse.visualization.plot_image;
      } else if (pythonResponse.plot_image) {
        plotImage = pythonResponse.plot_image;
      } else if (analysisData.plot_base64) {
        plotImage = analysisData.plot_base64;
      } else if (pythonResponse.plot_base64) {
        plotImage = pythonResponse.plot_base64;
      }

      console.log('📊 Data extraction results:', {
        hasRfmStats: !!rfmStats && Object.keys(rfmStats).length > 0,
        rfmStatsKeys: rfmStats ? Object.keys(rfmStats) : [],
        hasSegmentCounts: !!segmentCounts && Object.keys(segmentCounts).length > 0,
        segmentCountsKeys: segmentCounts ? Object.keys(segmentCounts) : [],
        hasPlotImage: !!plotImage,
        plotImageLength: plotImage ? plotImage.length : 0,
        totalCustomers: analysisData.total_customers || pythonResponse.total_customers || 0
      });

      // セッション詳細を状態にセット（時系列分析と同じ構造）
      const sessionDetail: RFMSessionDetail = {
        session_id: pythonResponse.session_info?.session_id || sessionId,
        success: pythonResponse.success,
        has_data: pythonResponse.has_data || (analysisData.total_customers > 0),
        customer_count: pythonResponse.customer_count || analysisData.total_customers || 0,
        session_name: pythonResponse.session_info?.session_name || '',
        analysis_type: 'rfm',
        filename: pythonResponse.session_info?.filename || pythonResponse.metadata?.filename || '',
        description: pythonResponse.session_info?.description || '',
        analysis_date: pythonResponse.session_info?.analysis_date || analysisData.analysis_date || '',
        row_count: pythonResponse.metadata?.rows || pythonResponse.session_info?.row_count || 0,
        column_count: pythonResponse.metadata?.columns || pythonResponse.session_info?.column_count || 0,
        total_customers: analysisData.total_customers || pythonResponse.total_customers || 0,
        rfm_divisions: analysisData.rfm_divisions || pythonResponse.rfm_divisions || 3,
        customer_data: analysisData.customer_data || pythonResponse.customer_data || [],
        segment_counts: segmentCounts,
        rfm_statistics: rfmStats,
        plot_base64: plotImage,
        download_urls: {
          customers: `/api/rfm/download/${sessionId}/customers`,
          segments: `/api/rfm/download/${sessionId}/segments`,
          details: `/api/rfm/download/${sessionId}/details`
        }
      };

      setSessionDetail(sessionDetail);

      console.log('✅ セッション詳細取得成功:', {
        sessionId: sessionDetail.session_id,
        customerCount: sessionDetail.customer_count,
        hasPlotData: !!sessionDetail.plot_base64,
        hasRfmStats: !!sessionDetail.rfm_statistics && Object.keys(sessionDetail.rfm_statistics).length > 0,
        rfmStatsKeys: sessionDetail.rfm_statistics ? Object.keys(sessionDetail.rfm_statistics) : [],
        finalSegmentCounts: Object.keys(sessionDetail.segment_counts)
      });

    } catch (error) {
      console.error('❌ セッション詳細取得エラー:', error);
      const errorMessage = error instanceof Error ? error.message : 'セッション詳細の取得中にエラーが発生しました';
      setError(errorMessage);
      setSessionDetail(null);
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
        
        if (sessionDetail?.session_id === sessionId) {
          setSessionDetail(null);
        }
        
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

    } catch (error) {
      console.error('❌ ファイル選択エラー:', error);
      setError(error instanceof Error ? error.message : 'ファイルの処理中にエラーが発生しました');
      setDetectedColumns([]);
    }
  };

  // 🔧 修正: メインのアップロード処理（エラーハンドリング改善）
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
      console.log('📤 RFM分析リクエスト送信中...');

      const formData = new FormData();
      formData.append('file', file);

      const queryParams = new URLSearchParams({
        session_name: sessionName,
        description: description || '',
        tags: tags || '',
        user_id: 'default',
        customerIdCol: parameters.customerIdCol,
        dateCol: parameters.dateCol, 
        amountcol: parameters.amountCol,
        rfm_divisions: parameters.rfmDivisions.toString(),
        ...(parameters.analysisDate && { analysis_date: parameters.analysisDate }),
        ...(parameters.useMonetary4Divisions && { use_monetary_4_divisions: 'true' })
      });

      console.log('📋 Query parameters:', Object.fromEntries(queryParams));

      const response = await fetch(`/api/rfm/analyze?${queryParams}`, {
        method: 'POST',
        body: formData,
      });

      console.log('📥 RFM分析レスポンス:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ RFM分析エラー:', errorText);
        
        // 🔧 修正: EPIPEエラーの場合は成功として扱う
        if (errorText.includes('EPIPE') || errorText.includes('fetch failed')) {
          console.log('⚠️ 接続エラーが発生しましたが、分析は完了している可能性があります。セッション一覧を更新します。');
          
          // セッション一覧を更新して最新の分析結果を確認
          await fetchSessions();
          
          // 最新のセッションを自動で表示
          setTimeout(async () => {
            if (sessions.length > 0) {
              const latestSession = sessions[0]; // セッションは新しい順に並んでいると仮定
              console.log('📊 最新セッションを自動表示:', latestSession.session_id);
              await fetchSessionDetail(latestSession.session_id);
              setActiveTab('history');
            }
          }, 1000);
          
          setError('⚠️ 通信エラーが発生しましたが、分析は正常に完了した可能性があります。履歴タブで結果を確認してください。');
          return;
        }
        
        throw new Error(`分析に失敗しました: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log('📄 Response length:', responseText.length);

      let result;
      try {
        result = JSON.parse(responseText);
        console.log('✅ JSON parse successful');
      } catch (parseError) {
        console.error('❌ JSON parse failed:', parseError);
        throw new Error('分析結果の解析に失敗しました');
      }

      console.log('📊 Result keys:', Object.keys(result || {}));

      if (!result) {
        throw new Error('分析結果が空です');
      }

      if (result.success && result.session_id) {
        console.log('✅ RFM分析完了:', result.session_id);
        setResult(result);

        // セッション一覧を更新
        await fetchSessions();

        console.log('🎉 RFM分析が完了しました！');

      } else {
        throw new Error(result.error || '分析に失敗しました');
      }

    } catch (error) {
      console.error('❌ アップロードエラー:', error);
      const errorMessage = error instanceof Error ? error.message : 'アップロードに失敗しました';
      setError(errorMessage);
      
    } finally {
      setLoading(false);
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

  const downloadImage = () => {
  // 🔧 修正: getPlotImage()の代わりに直接プロット画像を取得
    const plotData = result?.plot_base64 || sessionDetail?.plot_base64;
    const plotImage = plotData ? `data:image/png;base64,${plotData}` : null;
    
    if (!plotImage) {
      alert('ダウンロードする画像がありません');
      return;
    }

    try {
      // Base64データをBlobに変換
      const base64Data = plotImage.replace(/^data:image\/png;base64,/, '');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      // ダウンロード用のリンクを作成
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // ファイル名を生成
      const sessionName = sessionDetail?.session_name || result?.metadata?.session_name || 'RFM分析';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      link.download = `${sessionName}_RFM分析結果_${timestamp}.png`;
      
      // ダウンロード実行
      document.body.appendChild(link);
      link.click();
      
      // クリーンアップ
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('✅ 画像ダウンロード完了');
    } catch (error) {
      console.error('❌ 画像ダウンロードエラー:', error);
      alert('画像のダウンロードに失敗しました');
    }
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
              onClick={() => {
                setActiveTab('history');
                // 履歴タブを開く際にセッション一覧を更新
                if (sessions.length === 0) {
                  fetchSessions();
                }
              }}
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
                      <input
                        type="text"
                        value={parameters.customerIdCol}
                        onChange={(e) => updateParameter('customerIdCol', e.target.value)}
                        placeholder="例: id, customer_id"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-sm text-blue-600 mt-1">顧客を識別するためのID列</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        日付列名 *
                      </label>
                      <input
                        type="text"
                        value={parameters.dateCol}
                        onChange={(e) => updateParameter('dateCol', e.target.value)}
                        placeholder="例: date, order_date"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-sm text-blue-600 mt-1">購入日時の列</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        金額列名 *
                      </label>
                      <input
                        type="text"
                        value={parameters.amountCol}
                        onChange={(e) => updateParameter('amountCol', e.target.value)}
                        placeholder="例: amount, price"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-sm text-blue-600 mt-1">購入金額の列</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-2">
                        RFMスコア分割数
                      </label>
                      <select
                        value={parameters.rfmDivisions}
                        onChange={(e) => updateParameter('rfmDivisions', parseInt(e.target.value))}
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
            /* 🔧 修正: 履歴タブの内容 */
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

              {/* 🔧 修正: 履歴の状態表示を改善 */}
              {sessionsLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">セッション履歴を読み込み中...</p>
                </div>
              ) : error ? (
                <div className="text-center py-12">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <svg className="w-12 h-12 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-red-800 font-medium mb-2">セッション履歴の取得でエラーが発生しました</p>
                    <p className="text-red-600 text-sm mb-4">{error}</p>
                    <button
                      onClick={() => {
                        setError(null);
                        fetchSessions();
                      }}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    >
                      再試行
                    </button>
                  </div>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m8-8V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1m8 0V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v1" />
                  </svg>
                  {searchQuery ? (
                    <>
                      <p className="text-lg font-medium">検索結果が見つかりません</p>
                      <p>「{searchQuery}」に一致するRFM分析が見つかりませんでした</p>
                      <button
                        onClick={() => setSearchQuery('')}
                        className="mt-4 text-indigo-600 hover:text-indigo-700 underline"
                      >
                        検索をクリア
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium">保存されたRFM分析がありません</p>
                      <p>新規分析タブからRFM分析を実行してください</p>
                      <button
                        onClick={() => setActiveTab('upload')}
                        className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                      >
                        新規分析を開始
                      </button>
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
                          setError(null);
                          setSelectedSession(session);
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

      {/* 🔧 修正: 分析結果表示部分 */}
      {(result || sessionDetail) && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">RFM分析結果</h2>
              <p className="text-sm text-gray-500 mt-1">
                {result?.session_name || sessionDetail?.session_name}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {(result?.session_id || sessionDetail?.session_id) && (
                <>
                  <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded">
                    ID: {result?.session_id || sessionDetail?.session_id}
                  </span>
                  <button
                    onClick={() => downloadCSV(Number(result?.session_id || sessionDetail?.session_id), 'customers')}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm flex items-center transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    顧客CSV
                  </button>
                  <button
                    onClick={() => downloadCSV(Number(result?.session_id || sessionDetail?.session_id), 'segments')}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    セグメントCSV
                  </button>
                  {/* 🔧 追加: 画像ダウンロードボタン */}
                  {(() => {
                    const plotData = result?.plot_base64 || sessionDetail?.plot_base64;
                    return plotData && (
                      <button
                        onClick={downloadImage}
                        className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 text-sm flex items-center transition-colors"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        分析結果画像
                      </button>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
          
          {/* 分析概要カード */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                📊 分析概要
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-blue-700">総顧客数:</dt>
                  <dd className="font-medium text-blue-900">
                    {(result?.data?.total_customers || sessionDetail?.total_customers || 0).toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">RFM分割:</dt>
                  <dd className="font-medium text-blue-900">
                    {result?.data?.rfm_divisions || sessionDetail?.rfm_divisions || 3}段階
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">分析日:</dt>
                  <dd className="font-medium text-blue-900">
                    {result?.data?.analysis_date || sessionDetail?.analysis_date || '不明'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 🔧 修正: 統計データの正しいパス指定 */}
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
                      const stats = result?.data?.rfm_stats?.recency || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.recency ||
                                   result?.rfm_stats?.recency;
                      
                      return stats?.mean ? `${formatNumber(stats.mean, 1)}日` : '利用不可';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">最小:</dt>
                  <dd className="font-medium text-green-900">
                    {(() => {
                      const stats = result?.data?.rfm_stats?.recency || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.recency ||
                                   result?.rfm_stats?.recency;
                      return stats?.min !== undefined ? `${Math.round(stats.min)}日` : '利用不可';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">最大:</dt>
                  <dd className="font-medium text-green-900">
                    {(() => {
                      const stats = result?.data?.rfm_stats?.recency || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.recency ||
                                   result?.rfm_stats?.recency;
                      return stats?.max !== undefined ? `${Math.round(stats.max)}日` : '利用不可';
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
                      const stats = result?.data?.rfm_stats?.frequency || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.frequency ||
                                   result?.rfm_stats?.frequency;
                      return stats?.mean ? `${formatNumber(stats.mean, 1)}回` : '利用不可';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-yellow-700">最小:</dt>
                  <dd className="font-medium text-yellow-900">
                    {(() => {
                      const stats = result?.data?.rfm_stats?.frequency || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.frequency ||
                                   result?.rfm_stats?.frequency;
                      return stats?.min !== undefined ? `${Math.round(stats.min)}回` : '利用不可';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-yellow-700">最大:</dt>
                  <dd className="font-medium text-yellow-900">
                    {(() => {
                      const stats = result?.data?.rfm_stats?.frequency || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.frequency ||
                                   result?.rfm_stats?.frequency;
                      return stats?.max !== undefined ? `${Math.round(stats.max)}回` : '利用不可';
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
                      const stats = result?.data?.rfm_stats?.monetary || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.monetary ||
                                   result?.rfm_stats?.monetary;
                      return stats?.mean ? `¥${Math.round(stats.mean).toLocaleString()}` : '利用不可';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-purple-700">最小:</dt>
                  <dd className="font-medium text-purple-900">
                    {(() => {
                      const stats = result?.data?.rfm_stats?.monetary || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.monetary ||
                                   result?.rfm_stats?.monetary;
                      return stats?.min !== undefined ? `¥${Math.round(stats.min).toLocaleString()}` : '利用不可';
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-purple-700">最大:</dt>
                  <dd className="font-medium text-purple-900">
                    {(() => {
                      const stats = result?.data?.rfm_stats?.monetary || 
                                   sessionDetail?.rfm_statistics?.rfm_stats?.monetary ||
                                   result?.rfm_stats?.monetary;
                      return stats?.max !== undefined ? `¥${Math.round(stats.max).toLocaleString()}` : '利用不可';
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
              {Object.entries(result?.data?.segment_counts || sessionDetail?.segment_counts || {}).map(([segment, count]) => {
                const totalCustomers = result?.data?.total_customers || sessionDetail?.total_customers || 1;
                const percentage = ((count / totalCustomers) * 100).toFixed(1);
                const definition = result?.data?.segment_definitions?.[segment];
                
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

          {/* 🔧 修正: プロット画像表示（時系列分析と同じ手法） */}
          {/* 🔧 修正: プロット画像表示（時系列分析と同じ手法） */}
          <div className="mb-8">
            <h3 className="font-semibold mb-4 text-lg flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              📊 RFM分析プロット
            </h3>
            
            {(() => {
              const plotData = result?.plot_base64 || sessionDetail?.plot_base64;
              
              console.log('🖼️ プロット画像データ確認:', {
                hasResultPlot: !!result?.plot_base64,
                hasSessionDetailPlot: !!sessionDetail?.plot_base64,
                finalPlotLength: plotData?.length || 0
              });
              
              if (!plotData) {
                return (
                  <div className="border rounded-lg p-8 bg-gray-50 text-center">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-600">プロット画像を読み込み中...</p>
                    <p className="text-gray-500 text-sm mt-2">
                      分析は正常に完了しています。セグメント分析結果とCSVダウンロードをご利用ください。
                    </p>
                  </div>
                );
              }

              // 🔧 修正: 時系列分析と同じBase64データ処理
              const base64Data = plotData.startsWith('data:image/') ? 
                plotData : 
                `data:image/png;base64,${plotData}`;

              return (
                <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                  <Image
                    src={base64Data}
                    alt="RFM分析プロット"
                    width={1600}
                    height={1200}
                    className="w-full h-auto"
                    priority={true}
                    unoptimized={true}
                    onError={(e) => {
                      console.error('❌ プロット画像読み込みエラー');
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
              onClick={() => {
                setActiveTab('upload');
                setResult(null);
                setSessionDetail(null);
              }}
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

      {/* RFM分析手法の説明セクション */}
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

        {/* データ準備の説明など他のセクションは省略 */}
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