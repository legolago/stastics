// 📁 app/api/rfm/download/[sessionId]/customers/route.ts (修正版)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    console.log(`🔗 RFM顧客データダウンロード開始: セッション ${sessionId}`);
    
    // 入力値検証
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      console.error('❌ 無効なsessionId:', sessionId);
      return NextResponse.json(
        { error: '有効なセッションIDが必要です' },
        { status: 400 }
      );
    }

    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    const downloadUrl = `${fastApiUrl}/api/rfm/download/${sessionId}/customers`;
    
    console.log(`🌐 FastAPI URL: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv',
      },
      // タイムアウト設定
      signal: AbortSignal.timeout(30000), // 30秒
    });

    console.log('📥 FastAPI レスポンス:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI エラー:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500)
      });
      
      // エラーレスポンスをJSONとして解析
      let errorData;
      try {
        errorData = JSON.parse(errorText);
        console.error('❌ パースされたエラー:', errorData);
      } catch {
        errorData = { 
          detail: errorText || `HTTP ${response.status}: ${response.statusText}`,
          raw_error: errorText.substring(0, 200)
        };
      }
      
      return NextResponse.json(
        { 
          error: 'FastAPIでエラーが発生しました', 
          details: errorData,
          fastapi_status: response.status,
          session_id: sessionId
        },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    // CSVデータを取得
    const csvContent = await response.text();
    console.log(`✅ CSV取得成功: ${csvContent.length} 文字`);
    
    // CSVが空でないことを確認
    if (!csvContent || csvContent.trim() === '') {
      console.error('❌ 空のCSVデータ');
      return NextResponse.json(
        { error: 'CSVデータが空です', session_id: sessionId },
        { status: 500 }
      );
    }

    // CSVの最初の数行をログ出力（デバッグ用）
    const firstLines = csvContent.split('\n').slice(0, 3).join('\n');
    console.log(`📄 CSV内容（最初の3行）:\n${firstLines}`);

    // レスポンスヘッダーを設定してCSVファイルとして返す
    const filename = `rfm_customers_${sessionId}.csv`;
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
        'Content-Length': csvContent.length.toString(),
      },
    });
    
  } catch (error) {
    console.error('❌ RFM顧客データダウンロードエラー:', error);
    
    // タイムアウトエラーの特別処理
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'リクエストがタイムアウトしました' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { 
        error: '顧客データのダウンロード中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}