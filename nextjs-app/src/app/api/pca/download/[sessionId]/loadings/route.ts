// app/api/pca/download/[sessionId]/loadings/route.ts
import { NextRequest, NextResponse } from 'next/server';


export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading PCA loadings for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/pca/download/${sessionId}/loadings`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI loadings download error:', errorText);
      return NextResponse.json(
        { error: '因子負荷量のダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ PCA loadings downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pca_loadings_${sessionId}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('❌ PCA loadings download error:', error);
    return NextResponse.json(
      { error: '因子負荷量のダウンロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
