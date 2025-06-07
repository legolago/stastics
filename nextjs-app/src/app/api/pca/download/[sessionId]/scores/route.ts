// app/api/pca/download/[sessionId]/scores/route.ts
import { NextRequest, NextResponse } from 'next/server';
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading PCA scores for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/pca/download/${sessionId}/scores`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI scores download error:', errorText);
      return NextResponse.json(
        { error: '主成分得点のダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ PCA scores downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pca_scores_${sessionId}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('❌ PCA scores download error:', error);
    return NextResponse.json(
      { error: '主成分得点のダウンロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
}