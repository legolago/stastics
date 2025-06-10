// 📁 app/api/rfm/sessions/[sessionId]/route.ts (改良版)
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || process.env.FASTAPI_URL || 'http://python-api:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    console.log(`📊 RFM分析セッション詳細取得開始: ${sessionId}`);

    // 入力値の検証
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      console.error('❌ 無効なsessionId:', sessionId);
      return NextResponse.json({
        error: '有効なセッションIDが必要です',
        session_id: sessionId
      }, { status: 400 });
    }

    // sessionIdが数値かチェック
    const sessionIdNum = parseInt(sessionId, 10);
    if (isNaN(sessionIdNum)) {
      console.error('❌ sessionIdが数値ではありません:', sessionId);
      return NextResponse.json({
        error: 'セッションIDは数値である必要があります',
        session_id: sessionId
      }, { status: 400 });
    }

    // Python APIエンドポイントの構築
    const pythonUrl = new URL(`/api/rfm/sessions/${sessionId}`, PYTHON_API_URL);
    
    console.log('🌐 Calling Python RFM Session Detail API:', pythonUrl.toString());

    // Python APIを呼び出し
    const pythonResponse = await fetch(pythonUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000), // 30秒
    });

    console.log('📥 Python APIレスポンス:', {
      status: pythonResponse.status,
      statusText: pythonResponse.statusText,
      ok: pythonResponse.ok,
      contentType: pythonResponse.headers.get('content-type')
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error('❌ Python API Error:', {
        status: pythonResponse.status,
        statusText: pythonResponse.statusText,
        responseText: errorText.substring(0, 500)
      });
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { 
          detail: `HTTP ${pythonResponse.status}: ${pythonResponse.statusText}`,
          raw_error: errorText.substring(0, 200)
        };
      }
      
      // 404の場合は特別処理
      if (pythonResponse.status === 404) {
        return NextResponse.json({
          error: 'セッションが見つかりません',
          session_id: sessionId,
          details: errorData
        }, { status: 404 });
      }
      
      return NextResponse.json({
        error: 'Python APIでエラーが発生しました', 
        details: errorData,
        python_status: pythonResponse.status,
        session_id: sessionId
      }, { status: pythonResponse.status >= 500 ? 500 : pythonResponse.status });
    }

    // Python APIからのレスポンスを取得
    const responseText = await pythonResponse.text();
    console.log('📄 Python API生レスポンス:', {
      length: responseText.length,
      isEmpty: responseText.trim() === '',
      isJson: responseText.trim().startsWith('{')
    });

    if (!responseText || responseText.trim() === '') {
      console.error('❌ 空のレスポンスを受信');
      return NextResponse.json({
        error: 'Python APIから空のレスポンスが返されました',
        session_id: sessionId
      }, { status: 500 });
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Python APIレスポンスのJSONパースエラー:', parseError);
      return NextResponse.json({
        error: 'Python APIからの応答を解析できませんでした',
        parse_error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        session_id: sessionId
      }, { status: 500 });
    }
    
    console.log('✅ RFM分析セッション詳細取得結果:', {
      session_id: sessionId,
      success: responseData.success,
      has_data: !!responseData.data,
      customer_count: responseData.data?.analysis_data?.total_customers || 0,
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ RFM分析セッション詳細取得API Error:', error);
    
    // タイムアウトエラーの特別処理
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        error: 'リクエストがタイムアウトしました。Python APIが応答していません。'
      }, { status: 504 });
    }
    
    return NextResponse.json({
      error: 'RFM分析セッション詳細取得中にエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}