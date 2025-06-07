// app/api/cluster/download/[sessionId]/assignments/route.ts  
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log(`🔗 Downloading cluster assignments for session ${sessionId} from:`, fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/cluster/download/${sessionId}/assignments`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI assignments download error:', errorText);
      return NextResponse.json(
        { error: 'クラスター割り当て結果のダウンロードに失敗しました', details: errorText },
        { status: response.status }
      );
    }

    // CSVファイルとして返す
    const csvContent = await response.text();
    console.log(`✅ Cluster assignments downloaded successfully for session ${sessionId}`);
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cluster_assignments_${sessionId}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('❌ Cluster assignments download error:', error);
    return NextResponse.json(
      { error: 'クラスター割り当て結果のダウンロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
