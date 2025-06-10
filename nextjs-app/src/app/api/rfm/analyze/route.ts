// 📁 app/api/rfm/analyze/route.ts (改良版)
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Docker環境では python-api サービス名を使用
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    
    console.log('🔗 FastAPI URL:', fastApiUrl);
    console.log('📤 Sending RFM analysis request...');
    
    // クエリパラメータを取得
    const searchParams = request.nextUrl.searchParams;
    console.log('📋 Query parameters:', Object.fromEntries(searchParams.entries()));
    
    const response = await fetch(`${fastApiUrl}/api/rfm/analyze?${searchParams.toString()}`, {
      method: 'POST',
      body: formData,
      // タイムアウト設定
      signal: AbortSignal.timeout(60000), // 60秒
    });

    console.log('📥 FastAPI Response Status:', response.status);
    console.log('📋 Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI error:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { 
          detail: `HTTP ${response.status}: ${response.statusText}`,
          raw_error: errorText.substring(0, 200)
        };
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'RFM分析に失敗しました', 
          details: errorData,
          status: response.status
        },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    // レスポンステキストを取得
    const responseText = await response.text();
    console.log('📄 Response length:', responseText.length);

    if (!responseText || responseText.trim() === '') {
      console.log('⚠️ Empty response from FastAPI');
      return NextResponse.json({
        success: false,
        error: 'FastAPIからの応答が空です'
      }, { status: 500 });
    }

    // JSONパース
    let result;
    try {
      result = JSON.parse(responseText);
      console.log('✅ JSON parse successful');
      console.log('📊 Result keys:', Object.keys(result || {}));
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return NextResponse.json({
        success: false,
        error: 'FastAPIからの応答を解析できませんでした',
        details: parseError instanceof Error ? parseError.message : 'Parse error'
      }, { status: 500 });
    }
    
    // 結果の検証と正規化
    if (result && typeof result === 'object' && result !== null) {
      // successプロパティの確保
      if (!('success' in result)) {
        result.success = true;
      }
      
      // session_idの確保
      if (!result.session_id && result.data?.session_id) {
        result.session_id = result.data.session_id;
      }
      
      console.log('✅ RFM analysis completed successfully');
      console.log('📤 Returning result with session_id:', result.session_id);
      
      return NextResponse.json(result);
    } else {
      console.error('❌ Invalid result format:', result);
      return NextResponse.json({
        success: false,
        error: '無効なレスポンス形式です',
        debug: {
          resultType: typeof result,
          responseLength: responseText.length
        }
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ RFM analysis error:', error);
    
    // タイムアウトエラーの特別処理
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        success: false,
        error: 'リクエストがタイムアウトしました',
        details: 'Python APIが応答していません'
      }, { status: 504 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'サーバーエラーが発生しました', 
      details: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        fastApiUrl: process.env.FASTAPI_URL || 'http://python-api:8000',
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.constructor.name : typeof error
      }
    }, { status: 500 });
  }
}