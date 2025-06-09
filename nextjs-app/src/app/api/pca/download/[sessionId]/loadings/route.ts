// src/app/api/pca/download/[sessionId]/loadings/route.ts
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/pca/download/${sessionId}/loadings`;
    
    const response = await fetch(backendUrl, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    const contentDisposition = response.headers.get('Content-Disposition') || 
      `attachment; filename="pca_loadings_${sessionId}.csv"`;
    
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('PCA loadings download API error:', error);
    return Response.json(
      { error: 'PCA負荷量ダウンロードでエラーが発生しました' },
      { status: 500 }
    );
  }
}