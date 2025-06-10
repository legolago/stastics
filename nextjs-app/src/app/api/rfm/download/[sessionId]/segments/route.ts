// 📁 app/api/rfm/download/[sessionId]/segments/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading RFM segment data for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/rfm/download/${sessionId}/segments`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI segment data download error:', errorText);
      return NextResponse.json(
        { error: 'セグメントデータのダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ RFM segment data downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rfm_segments_${sessionId}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('❌ RFM segment data download error:', error);
    return NextResponse.json(
      { error: 'セグメントデータのダウンロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
}