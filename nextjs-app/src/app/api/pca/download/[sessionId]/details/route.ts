// src/app/api/pca/download/[sessionId]/details/route.ts
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/pca/download/${sessionId}/details`;
    
    const response = await fetch(backendUrl, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // Content-Dispositionヘッダーを転送
    const contentDisposition = response.headers.get('Content-Disposition') || 
      `attachment; filename="pca_details_${sessionId}.csv"`;
    
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('PCA details download API error:', error);
    return Response.json(
      { error: 'PCA詳細ダウンロードでエラーが発生しました' },
      { status: 500 }
    );
  }
}
