// app/api/timeseries/download/[sessionId]/details/route.ts
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
    
    console.log(`🔗 Downloading timeseries details for session ${sessionId} from:`, PYTHON_API_URL);
    
    const response = await fetch(`${PYTHON_API_URL}/api/timeseries/download/${sessionId}/details`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI details download error:', errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'セッションまたは詳細情報が見つかりません' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: '詳細情報のダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ Timeseries details downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="timeseries_details_${sessionId}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });
    
  } catch (error) {
    console.error('❌ Timeseries details download error:', error);
    return NextResponse.json(
      { 
        error: '詳細情報のダウンロード中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}