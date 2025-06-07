// app/api/correspondence/download/[sessionId]/coordinates/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading correspondence coordinates for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/correspondence/download/${sessionId}/coordinates`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI coordinates download error:', errorText);
      return NextResponse.json(
        { error: '座標データのダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ Correspondence coordinates downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="correspondence_coordinates_${sessionId}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('❌ Correspondence coordinates download error:', error);
    return NextResponse.json(
      { error: '座標データのダウンロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
}