// 📁 app/api/rfm/download/[sessionId]/segments/route.ts (改良版)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    // 入力値検証
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      return NextResponse.json({
        error: '有効なセッションIDが必要です',
        session_id: sessionId
      }, { status: 400 });
    }

    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading RFM segment data for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/rfm/download/${sessionId}/segments`, {
      signal: AbortSignal.timeout(30000), // 30秒
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI segment data download error:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { detail: errorText };
      }
      
      return NextResponse.json({
        error: 'セグメントデータのダウンロードに失敗しました',
        details: errorData,
        session_id: sessionId
      }, { status: response.status });
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ RFM segment data downloaded successfully for session ${sessionId}`);
    console.log(`📊 CSV size: ${csvContent.length} characters`);
    
    const filename = `rfm_segments_${sessionId}.csv`;
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
    
  } catch (error) {
    console.error('❌ RFM segment data download error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        error: 'リクエストがタイムアウトしました'
      }, { status: 504 });
    }
    
    return NextResponse.json({
      error: 'セグメントデータのダウンロード中にエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}