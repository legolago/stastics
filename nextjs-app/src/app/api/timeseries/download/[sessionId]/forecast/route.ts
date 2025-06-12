// app/api/timeseries/download/[sessionId]/forecast/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    // セッションIDの検証
    if (!sessionId || isNaN(Number(sessionId))) {
      return NextResponse.json(
        { error: '無効なセッションIDです' },
        { status: 400 }
      );
    }
    
    console.log(`🔗 Downloading timeseries forecast for session ${sessionId} from:`, PYTHON_API_URL);
    
    const response = await fetch(`${PYTHON_API_URL}/api/timeseries/download/${sessionId}/forecast`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI forecast download error:', errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'セッションまたは未来予測データが見つかりません' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: '未来予測データのダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ Timeseries forecast downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="timeseries_forecast_${sessionId}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });
    
  } catch (error) {
    console.error('❌ Timeseries forecast download error:', error);
    return NextResponse.json(
      { 
        error: '未来予測データのダウンロード中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}