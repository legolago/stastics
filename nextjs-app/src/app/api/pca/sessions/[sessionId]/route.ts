// =============================================================================
// 1. src/app/api/sessions/route.ts の完全修正版
// =============================================================================
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // パラメータを詳細ログ出力
    console.log('🔍 Sessions API - Received request');
    console.log('📊 Query parameters:');
    searchParams.forEach((value, key) => {
      console.log(`  ${key}: '${value}'`);
    });
    
    // すべてのパラメータを確実に転送
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });
    
    // analysis_typeパラメータの特別処理
    const analysisType = searchParams.get('analysis_type');
    if (analysisType) {
      console.log(`🎯 Analysis type filter requested: '${analysisType}'`);
    }
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    const backendUrl = `${fastApiUrl}/api/sessions`;
    const fullUrl = `${backendUrl}?${params.toString()}`;
    
    console.log('🔗 Forwarding to backend:', fullUrl);
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('📥 Backend response status:', response.status);
    console.log('📥 Backend response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend error response:', errorText);
      return NextResponse.json(
        { success: false, error: 'セッション取得に失敗しました', details: errorText },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // レスポンスデータの詳細ログ
    console.log('📊 Backend response structure:');
    console.log(`  success: ${data.success}`);
    console.log(`  data type: ${Array.isArray(data.data) ? 'array' : typeof data.data}`);
    console.log(`  data length: ${data.data?.length || 0}`);
    console.log(`  total: ${data.total || 'not provided'}`);
    
    // 各セッションの分析タイプをログ出力（最初の5件）
    if (data.success && Array.isArray(data.data)) {
      console.log('📊 First 5 sessions analysis types:');
      data.data.slice(0, 5).forEach((session: any, index: number) => {
        console.log(`  ${index + 1}. Session ${session.id || session.session_id}: '${session.analysis_type}' (${session.session_name})`);
      });
    }
    
    // analysis_typeでフィルタリングされていない場合の緊急対応
    if (analysisType && data.success && Array.isArray(data.data)) {
      const originalCount = data.data.length;
      
      // 分析タイプ別カウント
      const typeCounts: Record<string, number> = {};
      data.data.forEach((session: any) => {
        const type = session.analysis_type || 'undefined';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      console.log('📈 Analysis type distribution:', typeCounts);
      
      // 指定された分析タイプの確認
      const exactMatches = data.data.filter((session: any) => session.analysis_type === analysisType);
      const caseInsensitiveMatches = data.data.filter((session: any) => 
        (session.analysis_type || '').toLowerCase() === analysisType.toLowerCase()
      );
      
      console.log(`🔍 Exact matches for '${analysisType}': ${exactMatches.length}`);
      console.log(`🔍 Case-insensitive matches for '${analysisType}': ${caseInsensitiveMatches.length}`);
      
      // サーバーサイドでフィルタリングが働いていない場合のクライアントサイド補完
      if (originalCount > 0 && exactMatches.length === 0 && caseInsensitiveMatches.length > 0) {
        console.log('⚠️ Server-side filtering failed, applying client-side filter');
        data.data = caseInsensitiveMatches;
        data.total = caseInsensitiveMatches.length;
      } else if (originalCount > 0 && exactMatches.length === 0 && analysisType === 'pca') {
        // PCA特別処理：名前ベースの検索
        const nameBasedMatches = data.data.filter((session: any) => {
          const sessionName = (session.session_name || '').toLowerCase();
          const filename = (session.filename || session.original_filename || '').toLowerCase();
          return sessionName.includes('pca') || 
                 sessionName.includes('主成分') ||
                 filename.includes('pca');
        });
        
        console.log(`🔍 Name-based PCA matches: ${nameBasedMatches.length}`);
        
        if (nameBasedMatches.length > 0) {
          console.log('🔄 Applying name-based PCA filter as fallback');
          data.data = nameBasedMatches;
          data.total = nameBasedMatches.length;
        }
      }
    }
    
    console.log('✅ Sessions API response prepared successfully');
    return NextResponse.json(data, { status: response.status });
    
  } catch (error) {
    console.error('❌ Sessions API critical error:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3),
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'セッション取得でエラーが発生しました', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
