// 📁 app/api/rfm/download/[sessionId]/details/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading RFM details for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/rfm/download/${sessionId}/details`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI download error:', errorText);
      return NextResponse.json(
        { error: 'RFM詳細データのダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ RFM details downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rfm_details_${sessionId}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('❌ RFM download error:', error);
    return NextResponse.json(
      { error: 'RFM詳細データのダウンロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
}